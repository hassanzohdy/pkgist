import semver from "semver";
import { wrapError } from "../utils/errors.js";

/**
 * Given the current version string and a version strategy, return the new version.
 *
 * @param currentVersion  semver string from source package.json, e.g. "1.2.3"
 * @param strategy        "auto" / "patch" → patch bump
 *                        "minor"          → minor bump
 *                        "major"          → major bump
 *                        any valid semver string → use as-is
 * @param packageName     used in error messages only
 */
export function resolveVersion(
  currentVersion: string,
  strategy: "auto" | "patch" | "minor" | "major" | string = "auto",
  packageName: string,
): string {
  const bumpType =
    strategy === "auto" || strategy === "patch" ? "patch"
    : strategy === "minor" ? "minor"
    : strategy === "major" ? "major"
    : null;

  if (bumpType) {
    const bumped = semver.inc(currentVersion, bumpType);
    if (!bumped) {
      throw wrapError(
        "version-increment",
        packageName,
        new Error(
          `Cannot ${bumpType}-bump invalid semver version "${currentVersion}" for package "${packageName}"`,
        ),
      );
    }
    return bumped;
  }

  // Explicit version string — validate it
  const cleaned = semver.valid(semver.coerce(strategy) ?? strategy);
  if (!cleaned) {
    throw wrapError(
      "version-increment",
      packageName,
      new Error(
        `Explicit version "${strategy}" is not a valid semver string for package "${packageName}"`,
      ),
    );
  }
  return cleaned;
}
