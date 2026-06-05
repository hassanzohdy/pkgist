import path from "path";
import { copyDir, ensureDir } from "../files/file-manager.js";
import {
  readSourcePackageJson,
  writeSourceVersion,
  writeBuildPackageJson,
} from "../files/package-json.js";
import { cloneFiles } from "../files/clone-files.js";
import { compilePackage } from "../compile/tsdown-compiler.js";
import { resolveVersion } from "../version/increment.js";
import { gitCommitTagPush, currentBranch } from "../git/operations.js";
import { resolveCommitMessage } from "../git/resolve-commit.js";
import { publishPackage } from "../publish/npm-publisher.js";
import { buildOutputPath, sourceSnapshotPath, resolvePath } from "../utils/paths.js";
import { wrapError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { PackageBase, BuildOptions, BuilderSettings } from "../types/index.js";

export interface BuildResult {
  packageName: string;
  version: string;
  buildPath: string;
  success: boolean;
  error?: Error;
}

/**
 * Execute the full build pipeline for a single package.
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
 * 10. Git: add, commit, push, tag
 * 11. npm publish
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

  try {
    // 1. Resolve absolute package root
    const packageRoot = resolvePath(configDir, pkg.root);

    // 2. Read source package.json
    const sourceJson = readSourcePackageJson(packageRoot, pkg.name);
    const currentVersion = sourceJson.version;

    // 3. Determine new version. The CLI `--bump` override (options.versionOverride)
    //    beats the per-package strategy; a family-forced version still wins over both,
    //    because the family builder already folded any override into forcedVersion.
    const newVersion =
      forcedVersion ??
      resolveVersion(currentVersion, options.versionOverride ?? versionStrategy, pkg.name);

    logger.info(`Building ${pkg.name}: ${currentVersion} → ${newVersion}`);

    // 4. Build output directory
    const absoluteBuildDir = resolvePath(configDir, settings.buildDir);
    const buildPath = buildOutputPath(absoluteBuildDir, pkg.name, newVersion);

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
    await compilePackage(pkg, packageRoot, buildPath, sourceJson as Record<string, unknown>, options.dryRun);

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

    // 10. Git operations (only if commit message resolves and --no-git is not passed)
    //     Precedence: CLI `--commit` (options.commitOverride) > family/explicit
    //     override > per-package config `commit`.
    const rawCommit = options.commitOverride ?? overrideCommit ?? pkg.commit;
    const commitMessage = resolveCommitMessage(rawCommit, newVersion);
    if (commitMessage && !options.noGit) {
      const branch = pkg.branch ?? (await currentBranch(packageRoot));
      // Git is non-fatal: a package whose remote has diverged (e.g. unrelated
      // histories) or has no remote must STILL publish to npm. We commit/tag/push
      // best-effort and only warn on failure — npm publish is the source of truth.
      try {
        await gitCommitTagPush(
          packageRoot,
          pkg.name,
          newVersion,
          commitMessage,
          branch,
          options.dryRun,
        );
      } catch (gitErr) {
        const reason = (gitErr as Error).message.split("\n")[0];
        logger.warn(`[git] ${pkg.name}: git step failed (${reason}) — continuing to npm publish`);
      }
    } else if (!commitMessage) {
      logger.debug(`[git] ${pkg.name}: no commit message set — skipping git`);
    }

    // 11. npm publish
    if (!options.noPublish) {
      await publishPackage(pkg, buildPath, options.dryRun);
    } else {
      logger.info(`[publish] ${pkg.name}: --no-publish, skipping`);
    }

    return { packageName: pkg.name, version: newVersion, buildPath, success: true };
  } catch (err) {
    const wrapped = wrapError(step, pkg.name, err);
    logger.error(`Failed to build ${pkg.name}: ${wrapped.message}`);
    return {
      packageName: pkg.name,
      version: "",
      buildPath: "",
      success: false,
      error: wrapped,
    };
  }
}
