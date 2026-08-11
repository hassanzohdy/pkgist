import { execa } from "execa";

/**
 * Ask the registry whether a version actually exists.
 *
 * This is the only check that answers the question a user will ask. During the
 * 2026-08-11 incident `npm publish` reported success for a package that never
 * reached the registry; every internal signal agreed with it, and only a
 * registry read told the truth. So "published" is defined here as "the
 * registry serves this version", not "the publish command exited 0".
 */

export const NPM_REGISTRY = "https://registry.npmjs.org";

/**
 * Three states, never two.
 *
 * `unknown` is COULD-NOT-ASK — the registry was unreachable, so we learned
 * nothing. Reporting that as `absent` would claim a publish failed when it may
 * have succeeded; reporting it as `present` would claim the opposite. Both are
 * worse than admitting we could not tell.
 */
export type RegistryState = "present" | "absent" | "unknown";

export interface RegistryAnswer {
  state: RegistryState;
  /** Short reason, surfaced in the run summary. */
  detail?: string;
}

/** Transport-level failures mean we could not ask, not that the version is missing. */
const UNREACHABLE_PATTERNS: RegExp[] = [
  /\bETIMEDOUT\b/i,
  /\bESOCKETTIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bEAI_AGAIN\b/i,
  /\bENOTFOUND\b/i,
  /\bENETUNREACH\b/i,
  /\bEHOSTUNREACH\b/i,
  /network request to .* failed/i,
  /socket hang up/i,
  /request to .* failed/i,
];

/** A definitive "this does not exist" from the registry. */
const ABSENT_PATTERNS: RegExp[] = [/\bE404\b/, /404 Not Found/i, /is not in this registry/i];

/**
 * Classify a completed `npm view <name>@<version> version` invocation.
 *
 * Split out from the process call so the decision table can be unit-tested
 * without a network — the classification is the part that was wrong in the
 * hand-written sweep this replaces.
 */
export function classifyRegistryResponse(
  exitCode: number | undefined,
  stdout: string,
  stderr: string,
  expectedVersion: string,
): RegistryAnswer {
  const out = stdout.trim();
  const err = stderr.trim();

  // npm prints the matched version on success. An exact match is the only
  // thing that counts as present.
  if (exitCode === 0 && out === expectedVersion) {
    return { state: "present" };
  }

  // Reachable registry, no matching version: `npm view pkg@9.9.9 version`
  // exits 0 and prints nothing when the package exists but the version does not.
  if (exitCode === 0 && out === "") {
    return { state: "absent", detail: "registry returned no such version" };
  }

  // Non-empty but unexpected output — we asked for one field and got something
  // else. Do not guess.
  if (exitCode === 0) {
    return { state: "unknown", detail: `unexpected registry output: ${out.slice(0, 80)}` };
  }

  if (UNREACHABLE_PATTERNS.some(pattern => pattern.test(err))) {
    return { state: "unknown", detail: `registry unreachable: ${firstLine(err)}` };
  }

  if (ABSENT_PATTERNS.some(pattern => pattern.test(err))) {
    return { state: "absent", detail: "registry reports the version does not exist" };
  }

  return { state: "unknown", detail: firstLine(err) || `npm view exited with code ${exitCode}` };
}

function firstLine(text: string): string {
  return text.split("\n").find(line => line.trim().length > 0)?.trim() ?? "";
}

/**
 * Query the registry for one exact version.
 *
 * Never throws — a thrown error here would be indistinguishable from "the
 * package is missing", which is precisely the conflation this function exists
 * to prevent.
 */
export async function queryPublishedVersion(
  packageName: string,
  version: string,
  registry: string = NPM_REGISTRY,
): Promise<RegistryAnswer> {
  try {
    const result = await execa(
      "npm",
      ["view", `${packageName}@${version}`, "version", "--registry", registry],
      { reject: false, all: false },
    );

    return classifyRegistryResponse(
      result.exitCode,
      result.stdout ?? "",
      result.stderr ?? "",
      version,
    );
  } catch (err) {
    // Could not even spawn npm — still COULD-NOT-ASK, not ABSENT.
    const message = err instanceof Error ? err.message : String(err);
    return { state: "unknown", detail: `could not run npm view: ${firstLine(message)}` };
  }
}
