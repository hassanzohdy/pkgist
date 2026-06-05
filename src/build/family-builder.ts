import semver from "semver";
import { readSourcePackageJson } from "../files/package-json.js";
import { resolveVersion } from "../version/increment.js";
import { resolvePath } from "../utils/paths.js";
import { buildPackage } from "./package-builder.js";
import { runParallel } from "./parallel-builder.js";
import { wrapError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { Family, BuildOptions, BuilderSettings } from "../types/index.js";
import type { BuildResult } from "./package-builder.js";

/**
 * Build all packages in a family using a single shared version.
 *
 * The shared version is determined by taking the HIGHEST current version
 * across all family members and bumping it. This prevents a lower-versioned
 * member (e.g. atomic-query@0.1.0) from pulling down a higher-versioned one
 * (e.g. react-atom@5.1.3) when they are first unified.
 */
export async function buildFamily(
  family: Family,
  settings: BuilderSettings,
  options: BuildOptions,
  configDir: string,
): Promise<BuildResult[]> {
  if (family.packages.length === 0) {
    logger.warn(`Family "${family.name}" has no packages — nothing to build`);
    return [];
  }

  let newVersion: string;
  try {
    // CLI `--bump` overrides the family's configured version for this run.
    const strategy = options.versionOverride ?? family.version ?? "auto";
    const isBumpKeyword = strategy === "auto" || strategy === "patch" || strategy === "minor" || strategy === "major";

    if (!isBumpKeyword && semver.valid(semver.coerce(strategy) ?? strategy)) {
      // Explicit semver string — use as-is
      newVersion = strategy;
    } else {
      // Bump keyword — find the highest current version across all family members, then bump it
      let highestVersion = "0.0.0";
      for (const pkg of family.packages) {
        const root = resolvePath(configDir, pkg.root);
        const sourceJson = readSourcePackageJson(root, pkg.name);
        const v = sourceJson.version ?? "0.0.0";
        if (semver.gt(v, highestVersion)) {
          highestVersion = v;
        }
      }
      newVersion = resolveVersion(highestVersion, strategy, family.name);
    }
  } catch (err) {
    throw wrapError("family-version", family.name, err);
  }

  logger.info(`Family "${family.name}": shared version → ${newVersion} (${family.packages.length} packages)`);

  const concurrency = options.concurrency ?? settings.concurrency ?? 4;

  // The family commit message overrides per-package commit messages
  const familyCommit = family.commit;

  // Every member shares this version; intra-family deps get pinned to it.
  const familyPackageNames = new Set(family.packages.map((p) => p.name));

  const tasks = family.packages.map((pkg) => () =>
    buildPackage(
      pkg,
      "auto", // not used — forcedVersion overrides
      settings,
      options,
      configDir,
      familyCommit ?? pkg.commit,
      newVersion, // all packages use the same version
      familyPackageNames,
    ),
  );

  return runParallel(tasks, concurrency);
}
