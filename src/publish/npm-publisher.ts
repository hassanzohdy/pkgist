import { exec } from "../utils/exec.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { NPM_REGISTRY, queryPublishedVersion } from "./registry.js";
import type { RegistryAnswer } from "./registry.js";
import type { PackageBase } from "../types/index.js";
import type { PhaseOutcome } from "../types/result.js";

/** Waits between post-publish verification attempts, in milliseconds. */
const SETTLE_DELAYS_MS = [1500, 3000, 5000, 8000];

/**
 * Attempts for the post-publish read-back.
 *
 * Deliberately its own number rather than reusing `--retries`: that budget is
 * for transport failures, whereas this one is waiting for registry
 * propagation. Five attempts spans ~17s of waiting, which comfortably covers
 * the lag observed in practice while still failing in bounded time if the
 * version genuinely never arrives.
 */
const VERIFY_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Re-query the registry until it serves the version, or the attempts run out.
 *
 * Only the POST-publish check needs this. The pre-publish "is it already
 * there?" probe must NOT retry: `absent` is the normal, expected answer there,
 * and retrying it would add a pointless delay to every single package.
 *
 * `absent` and `unknown` are both retried here, because immediately after a
 * publish either can mean "not yet" rather than "not ever".
 */
export async function settleVerification(
  packageName: string,
  version: string,
  attempts: number,
  waits: number[] = SETTLE_DELAYS_MS,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<RegistryAnswer> {
  const total = Math.max(1, attempts);
  let answer = await queryPublishedVersion(packageName, version);

  for (let attempt = 2; attempt <= total && answer.state !== "present"; attempt++) {
    const delay = waits[Math.min(attempt - 2, waits.length - 1)];
    logger.debug(
      `[verify] ${packageName}: registry does not serve ${version} yet ` +
        `(attempt ${attempt - 1}/${total}) — waiting ${delay}ms for propagation`,
    );
    await wait(delay);
    answer = await queryPublishedVersion(packageName, version);
  }

  return answer;
}

export interface PublishInput {
  pkg: PackageBase;
  version: string;
  buildPath: string;
  dryRun: boolean;
  attempts: number;
  /** When false, skip the post-publish registry read-back. */
  verify: boolean;
}

/**
 * Publish one package, then confirm the registry actually serves it.
 *
 * The exit code of `npm publish` is necessary but not sufficient. In the
 * 2026-08-11 incident a publish reported success and the package was never on
 * the registry, so the run counted it as shipped and the flagship package
 * pinned an exact sibling version that did not exist. The read-back is what
 * makes "published" mean what a user means by it.
 */
export async function publishPackage(input: PublishInput): Promise<PhaseOutcome[]> {
  const { pkg, version, buildPath, dryRun, attempts, verify } = input;
  const phases: PhaseOutcome[] = [];

  if (pkg.publish === false) {
    const detail = "publish=false in config";
    logger.info(`[publish] ${pkg.name}: ${detail}, skipping`);
    return [
      { phase: "publish", status: "skipped", detail },
      { phase: "verify", status: "skipped", detail },
    ];
  }

  const access = pkg.access ?? "public";

  if (dryRun) {
    logger.info(`[dry-run] npm publish --access ${access} from ${buildPath}`);
    return [
      { phase: "publish", status: "skipped", detail: "dry run" },
      { phase: "verify", status: "skipped", detail: "dry run" },
    ];
  }

  // Check-then-act: if this exact version is already on the registry, a second
  // publish can only fail as a duplicate. Skipping is what lets a recovery run
  // re-target a whole family without burying the one real failure in N
  // expected "version already exists" errors.
  if (verify) {
    const existing = await queryPublishedVersion(pkg.name, version);

    if (existing.state === "present") {
      logger.info(`[publish] ${pkg.name}@${version}: already on the registry — skipping publish`);
      return [
        { phase: "publish", status: "skipped", detail: "already published" },
        { phase: "verify", status: "ok", detail: "already on the registry" },
      ];
    }
    // "absent" → proceed. "unknown" → also proceed: attempting a publish is
    // safe (a duplicate is rejected), whereas skipping on an unreadable
    // registry would silently drop a package from the release.
  }

  logger.step(`Publishing ${pkg.name}@${version} to npm (access: ${access})`);

  try {
    const { attempts: used } = await withRetry(
      () =>
        exec(
          "npm-publish",
          pkg.name,
          "npm",
          ["publish", "--access", access, "--registry", NPM_REGISTRY],
          buildPath,
        ),
      { attempts, label: "publish", packageName: pkg.name },
    );
    phases.push({ phase: "publish", status: "ok", attempts: used });
  } catch (err) {
    const detail = (err instanceof Error ? err.message : String(err)).split("\n")[0];
    phases.push({ phase: "publish", status: "failed", detail, attempts });
    phases.push({ phase: "verify", status: "skipped", detail: "publish failed" });
    logger.error(`[publish] ${pkg.name}: failed — ${detail}`);
    return phases;
  }

  if (!verify) {
    logger.success(`Published ${pkg.name}@${version} (not verified — --no-verify-publish)`);
    phases.push({ phase: "verify", status: "skipped", detail: "--no-verify-publish" });
    return phases;
  }

  // Read back. npm exiting 0 is exactly the signal that lied last time.
  //
  // The read-back must allow for propagation: the registry does not always
  // serve a version the instant `npm publish` returns, so a single immediate
  // query answers "absent" for a publish that in fact succeeded. Observed on
  // the first real release after this check shipped — the run was marked
  // INCOMPLETE and exited 1 while the version was on npm seconds later.
  // A false alarm here is expensive: it is indistinguishable from the real
  // defect this check exists to catch, and it teaches operators to ignore it.
  const answer = await settleVerification(pkg.name, version, VERIFY_ATTEMPTS);

  if (answer.state === "present") {
    logger.success(`Published ${pkg.name}@${version} (verified on registry)`);
    phases.push({ phase: "verify", status: "ok" });
    return phases;
  }

  if (answer.state === "absent") {
    const detail = `npm publish reported success but the registry still does not serve ${version} after ${VERIFY_ATTEMPTS} checks over ~17s${
      answer.detail ? ` (${answer.detail})` : ""
    }`;
    logger.error(`[verify] ${pkg.name}: ${detail}`);
    phases.push({ phase: "verify", status: "failed", detail });
    return phases;
  }

  const detail = answer.detail ?? "registry could not be queried";
  logger.warn(`[verify] ${pkg.name}: could not confirm the publish — ${detail}`);
  phases.push({ phase: "verify", status: "unknown", detail });
  return phases;
}
