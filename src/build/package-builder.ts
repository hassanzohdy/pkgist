import { copyDir, ensureDir } from "../files/file-manager.js";
import {
  readSourcePackageJson,
  writeSourceVersion,
  writeBuildPackageJson,
} from "../files/package-json.js";
import { cloneFiles } from "../files/clone-files.js";
import { compilePackage } from "../compile/tsdown-compiler.js";
import { resolveVersion } from "../version/increment.js";
import { gitRelease, currentBranch } from "../git/operations.js";
import { resolveCommitMessage } from "../git/resolve-commit.js";
import { publishPackage } from "../publish/npm-publisher.js";
import { buildOutputPath, sourceSnapshotPath, resolvePath } from "../utils/paths.js";
import { wrapError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { DEFAULT_ATTEMPTS } from "../utils/retry.js";
import { phasesAreClean } from "../types/result.js";
import type { PackageBase, BuildOptions, BuilderSettings } from "../types/index.js";
import type { BuildResult, PhaseOutcome } from "../types/result.js";

export type { BuildResult } from "../types/result.js";

/**
 * Execute the full release pipeline for a single package.
 *
 * Steps:
 * 1. Resolve package root
 * 2. Read source package.json → current version
 * 3. Compute new version
 * 4. Create build output directory
 * 5. Source snapshot (optional)
 * 6. tsdown compile
 * 7. Clone extra files
 * 8. Write build package.json
 * 9. Update source package.json version
 * 10. Git: commit → push → tag        ← must land before anything irreversible
 * 11. npm publish, then verify against the registry
 *
 * **Ordering rule:** git comes before publish, and a push that could not be
 * confirmed on the remote blocks that package's publish. Publishing is
 * irreversible outside npm's 72-hour window; a push is retryable forever. The
 * previous order did the reversible thing first, ignored its failure, and then
 * did the irreversible one anyway — which is how packages shipped to npm with
 * their source not in version control.
 *
 * Ordering alone does not close the window: a crash between push and publish
 * still leaves an unpublished pushed commit. That is the *recoverable*
 * direction, which is why it is the right order — and the check-then-act
 * probes in each step are what let the next run finish the job instead of
 * redoing it.
 */
export async function buildPackage(
  pkg: PackageBase,
  versionStrategy: "auto" | string = "auto",
  settings: BuilderSettings,
  options: BuildOptions,
  configDir: string,
  /**
   * Override commit message (used by family builder to apply a shared message).
   * If undefined, uses pkg.commit. Accepts the same shape as `PackageBase.commit`:
   * `string`, `true` (auto "Released <version>"), or `false` (skip).
   */
  overrideCommit?: string | boolean,
  /**
   * Pre-resolved version — used when a family has already determined the version
   * and needs all member packages to use the same one.
   */
  forcedVersion?: string,
  /**
   * Names of every package in the same release/family. Intra-family deps in the
   * built package.json are pinned to `newVersion` (instead of the source's "*")
   * so the published set stays lockstep-pinned to one exact version.
   */
  familyPackageNames?: Set<string>,
): Promise<BuildResult> {
  const step = "package-builder";
  const phases: PhaseOutcome[] = [];
  const attempts = options.retries ?? DEFAULT_ATTEMPTS;
  const verify = options.verifyPublish !== false;

  let newVersion = "";
  let buildPath = "";

  try {
    // 1. Resolve absolute package root
    const packageRoot = resolvePath(configDir, pkg.root);

    // 2. Read source package.json
    const sourceJson = readSourcePackageJson(packageRoot, pkg.name);
    const currentVersion = sourceJson.version;

    // 3. Determine new version. The CLI `--bump` override (options.versionOverride)
    //    beats the per-package strategy; a family-forced version still wins over both,
    //    because the family builder already folded any override into forcedVersion.
    newVersion =
      forcedVersion ??
      resolveVersion(currentVersion, options.versionOverride ?? versionStrategy, pkg.name);

    logger.info(`Building ${pkg.name}: ${currentVersion} → ${newVersion}`);

    // 4. Build output directory
    const absoluteBuildDir = resolvePath(configDir, settings.buildDir);
    buildPath = buildOutputPath(absoluteBuildDir, pkg.name, newVersion);

    if (!options.dryRun) {
      ensureDir(buildPath);
    }

    // 5. Source snapshot
    if (settings.sourcesDir) {
      const absoluteSourcesDir = resolvePath(configDir, settings.sourcesDir);
      const snapshotPath = sourceSnapshotPath(absoluteSourcesDir, pkg.name);
      if (options.dryRun) {
        logger.info(`[dry-run] snapshot ${packageRoot} → ${snapshotPath}`);
      } else {
        ensureDir(snapshotPath);
        copyDir(packageRoot, snapshotPath);
        logger.debug(`Snapshot: ${packageRoot} → ${snapshotPath}`);
      }
    }

    // 6. Compile with tsdown
    await compilePackage(
      pkg,
      packageRoot,
      buildPath,
      sourceJson as Record<string, unknown>,
      options.dryRun,
    );

    // 7. Clone extra files
    if (pkg.clone && pkg.clone.length > 0) {
      cloneFiles(packageRoot, buildPath, pkg.clone, pkg.name, options.dryRun);
    }

    // 8. Write build package.json
    if (!options.dryRun) {
      writeBuildPackageJson(pkg, sourceJson, buildPath, newVersion, familyPackageNames);
      logger.debug(`Wrote build package.json for ${pkg.name}@${newVersion}`);
    } else {
      logger.info(`[dry-run] write build package.json for ${pkg.name}@${newVersion}`);
    }

    // 9. Update source package.json version
    if (!options.dryRun) {
      writeSourceVersion(packageRoot, pkg.name, newVersion);
      logger.debug(`Updated source version ${pkg.name} → ${newVersion}`);
    } else {
      logger.info(`[dry-run] update source package.json version → ${newVersion}`);
    }

    phases.push({ phase: "compile", status: "ok" });

    // 10. Git — BEFORE publish.
    //     Precedence: CLI `--commit` (options.commitOverride) > family/explicit
    //     override > per-package config `commit`.
    const rawCommit = options.commitOverride ?? overrideCommit ?? pkg.commit;
    const commitMessage = resolveCommitMessage(rawCommit, newVersion);

    let commitIsOnRemote = true;

    if (options.noGit) {
      const detail = "--no-git";
      phases.push(
        { phase: "commit", status: "skipped", detail },
        { phase: "push", status: "skipped", detail },
        { phase: "tag", status: "skipped", detail },
      );
    } else if (!commitMessage) {
      const detail = "no commit message configured";
      phases.push(
        { phase: "commit", status: "skipped", detail },
        { phase: "push", status: "skipped", detail },
        { phase: "tag", status: "skipped", detail },
      );
      logger.debug(`[git] ${pkg.name}: ${detail} — skipping git`);
    } else {
      const branch = pkg.branch ?? (await currentBranch(packageRoot));
      const git = await gitRelease({
        packageRoot,
        packageName: pkg.name,
        version: newVersion,
        commitMessage,
        branch,
        dryRun: options.dryRun,
        attempts,
      });
      phases.push(...git.phases);
      commitIsOnRemote = git.commitIsOnRemote;
    }

    // 11. npm publish — gated on the commit being verifiably on the remote.
    if (options.noPublish) {
      const detail = "--no-publish";
      phases.push(
        { phase: "publish", status: "skipped", detail },
        { phase: "verify", status: "skipped", detail },
      );
      logger.info(`[publish] ${pkg.name}: ${detail}, skipping`);
    } else if (!commitIsOnRemote) {
      const detail = "release commit is not on the remote — refusing to publish";
      phases.push(
        { phase: "publish", status: "skipped", detail },
        { phase: "verify", status: "skipped", detail },
      );
      logger.error(`[publish] ${pkg.name}: ${detail}`);
    } else {
      phases.push(
        ...(await publishPackage({
          pkg,
          version: newVersion,
          buildPath,
          dryRun: options.dryRun,
          attempts,
          verify,
        })),
      );
    }

    return {
      packageName: pkg.name,
      version: newVersion,
      buildPath,
      success: phasesAreClean(phases),
      phases,
    };
  } catch (err) {
    const wrapped = wrapError(step, pkg.name, err);
    logger.error(`Failed to build ${pkg.name}: ${wrapped.message}`);

    // Anything thrown before the phase list got its own entry is a compile-time
    // (or setup) failure — record it so the summary can name a phase rather
    // than just the package.
    if (!phases.some(p => p.phase === "compile")) {
      phases.push({ phase: "compile", status: "failed", detail: wrapped.message.split("\n")[0] });
    }

    return {
      packageName: pkg.name,
      version: newVersion,
      buildPath,
      success: false,
      error: wrapped,
      phases,
    };
  }
}
