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
 * Given a package name like "@mongez/reinforcements",
 * return just the scoped part without the scope prefix: "reinforcements".
 */
export function scopelessName(packageName: string): string {
  const slash = packageName.indexOf("/");
  return slash === -1 ? packageName : packageName.slice(slash + 1);
}

/**
 * Build the versioned build output path:
 *   <buildDir>/<scopeless-name>/<version>/
 */
export function buildOutputPath(
  buildDir: string,
  packageName: string,
  version: string,
): string {
  return joinPath(buildDir, scopelessName(packageName), version);
}

/**
 * Build the sources snapshot path:
 *   <sourcesDir>/<scopeless-name>/
 */
export function sourceSnapshotPath(
  sourcesDir: string,
  packageName: string,
): string {
  return joinPath(sourcesDir, scopelessName(packageName));
}
