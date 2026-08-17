import path from "path";

/** Normalise any path to forward-slash form (Windows-safe). */
export function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Join path segments and normalise the result to forward slashes. */
export function joinPath(...segments: string[]): string {
  return toForwardSlash(path.join(...segments));
}

/** Resolve an absolute path from segments and normalise to forward slashes. */
export function resolvePath(...segments: string[]): string {
  return toForwardSlash(path.resolve(...segments));
}

/**
 * Resolve `segments` relative to `base` and assert the result stays inside `base`.
 *
 * Returns the resolved (forward-slash) path, or `null` if the joined path would
 * escape `base` — e.g. via a `..` segment or an absolute-path segment. Used to
 * contain config-authored relative paths (like `clone` entries) that must not be
 * able to read/write outside their intended directory.
 */
export function resolveWithinBase(base: string, ...segments: string[]): string | null {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, ...segments);

  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    return null;
  }

  return toForwardSlash(resolved);
}

/**
 * Build the versioned build output path. The package name is preserved verbatim
 * so scoped packages get a real scope directory:
 *
 *   "@mongez/pkgist"   → <buildDir>/@mongez/pkgist/<version>/
 *   "@warlock.js/core" → <buildDir>/@warlock.js/core/<version>/
 *   "create-warlock"   → <buildDir>/create-warlock/<version>/      (unscoped → root)
 *
 * This keeps scoped families grouped on disk (mirroring how npm lays out
 * `node_modules/@scope/...`) so a release runner that hosts many packages
 * stays organised instead of flattening every package into a single directory.
 */
export function buildOutputPath(
  buildDir: string,
  packageName: string,
  version: string,
): string {
  return joinPath(buildDir, packageName, version);
}

/**
 * Build the sources snapshot path. Same scope-preserving layout as
 * `buildOutputPath`, without the version segment:
 *
 *   "@mongez/pkgist"   → <sourcesDir>/@mongez/pkgist/
 *   "@warlock.js/core" → <sourcesDir>/@warlock.js/core/
 *   "create-warlock"   → <sourcesDir>/create-warlock/
 */
export function sourceSnapshotPath(
  sourcesDir: string,
  packageName: string,
): string {
  return joinPath(sourcesDir, packageName);
}
