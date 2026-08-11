import { exec } from "../utils/exec.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { NPM_REGISTRY, queryPublishedVersion } from "./registry.js";
import type { PackageBase } from "../types/index.js";
import type { PhaseOutcome } from "../types/result.js";

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
  const answer = await queryPublishedVersion(pkg.name, version);

  if (answer.state === "present") {
    logger.success(`Published ${pkg.name}@${version} (verified on registry)`);
    phases.push({ phase: "verify", status: "ok" });
    return phases;
  }

  if (answer.state === "absent") {
    const detail = `npm publish reported success but the registry does not serve ${version}${
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
