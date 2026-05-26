import path from "path";
import fs from "fs";
import { build } from "tsdown";
import type { InputOptions } from "rolldown";
import type { PackageBase } from "../types/index.js";
import { joinPath, toForwardSlash, resolvePath } from "../utils/paths.js";
import { ensureDir, moveFile, listFiles, pathExists } from "../files/file-manager.js";
import { wrapError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Collect all dependency names that should be treated as external.
 * Both `dependencies` and `peerDependencies` must never be bundled.
 *
 * For each package we emit two entries:
 *   1. The bare name — for exact imports like `import "react"`
 *   2. A regex — for subpath imports like `import "react/jsx-runtime"` or
 *      `import "react-dom/client"`. Without this, rolldown bundles the CJS
 *      React files and injects a `createRequire` shim that crashes in browsers.
 */
function collectExternals(sourceJson: Record<string, unknown>): (string | RegExp)[] {
  const deps = Object.keys((sourceJson["dependencies"] as Record<string, string> | undefined) ?? {});
  const peers = Object.keys((sourceJson["peerDependencies"] as Record<string, string> | undefined) ?? {});
  const names = [...new Set([...deps, ...peers])];

  const result: (string | RegExp)[] = [];
  for (const name of names) {
    result.push(name);
    // Escape regex metacharacters (handles scoped names like @mongez/events)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result.push(new RegExp(`^${escaped}\\/`));
  }
  return result;
}

/**
 * Resolve entry file paths to absolute forward-slash paths.
 */
function resolveEntries(pkg: PackageBase, packageRoot: string): string[] {
  const srcDir = pkg.srcDir ?? "src";
  const rawEntries = pkg.entries ?? ["index.ts"];
  const entryList = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
  return entryList.map((e) => toForwardSlash(resolvePath(packageRoot, srcDir, e)));
}

/**
 * Return the path to the tsconfig.json inside the package root, if it exists.
 */
function findTsconfig(packageRoot: string): string | undefined {
  const local = joinPath(packageRoot, "tsconfig.json");
  return pathExists(local) ? local : undefined;
}

// ─── Main compiler ──────────────────────────────────────────────────────────

/**
 * Compile a single package using tsdown.
 *
 * When `preserveModules` is on (the default), we run two separate tsdown builds
 * in parallel so that each format's output options are fully independent:
 *
 *   ESM build  — preserveModules: true, dts: true  → _tmp_esm/  → esm/*.mjs + *.d.mts
 *   CJS build  — preserveModules: false, dts: false → _tmp_cjs/  → cjs/*.cjs
 *
 * CJS skips DTS because rolldown has a bug in CJS preserveModules mode where
 * `export { default as X }` assigns the whole module object to exports.X instead
 * of unwrapping .default.  Bundled CJS has no such issue.  Types are shared from
 * the ESM declarations (TypeScript resolves them correctly via the exports map).
 *
 * When `preserveModules` is false, a single combined build is used.
 */
export async function compilePackage(
  pkg: PackageBase,
  packageRoot: string,
  buildPath: string,
  sourceJson: Record<string, unknown>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    logger.info(`[dry-run] compile ${pkg.name} → ${buildPath}`);
    return;
  }

  const entries = resolveEntries(pkg, packageRoot);
  const formats = pkg.formats ?? ["esm", "cjs"];
  const externals: (string | RegExp)[] = collectExternals(sourceJson);
  const tsconfig = findTsconfig(packageRoot);
  const shouldPreserveModules = pkg.preserveModules !== false;
  const srcDir = toForwardSlash(resolvePath(packageRoot, pkg.srcDir ?? "src"));

  logger.step(`Compiling ${pkg.name} (${formats.join(", ")}) → ${buildPath}`);
  logger.debug(`  entries:   ${entries.join(", ")}`);
  const externalNames = externals.filter((e): e is string => typeof e === "string");
  logger.debug(`  externals: ${externalNames.slice(0, 8).join(", ")}${externalNames.length > 8 ? "…" : ""}`);

  // Wipe any previous esm/ and cjs/ output so re-runs of the same version don't
  // leave stale files from a different build mode.
  for (const subDir of ["esm", "cjs"]) {
    const dir = resolvePath(buildPath, subDir);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Build inputOptions for rolldown — used to set the JSX transform for React packages.
  const rolldownInputOptions: InputOptions | undefined =
    pkg.type === "react"
      ? {
          transform: {
            jsx: "react-jsx", // automatic runtime — works with React 17+
          },
        }
      : undefined;

  // Common options shared across all tsdown invocations.
  const sharedOptions = {
    entry: entries,
    deps: { neverBundle: externals },
    sourcemap: pkg.sourcemap !== false,
    clean: true,
    minify: pkg.minify ?? false,
    tsconfig: tsconfig ?? true,
    ...(rolldownInputOptions ? { inputOptions: rolldownInputOptions } : {}),
  } as const;

  try {
    if (shouldPreserveModules && formats.includes("esm") && formats.includes("cjs")) {
      // Two parallel builds: ESM with preserveModules + DTS, CJS bundled without DTS.
      const tmpEsm = toForwardSlash(resolvePath(buildPath, "_tmp_esm"));
      const tmpCjs = toForwardSlash(resolvePath(buildPath, "_tmp_cjs"));
      ensureDir(tmpEsm);
      ensureDir(tmpCjs);

      await Promise.all([
        build({
          ...sharedOptions,
          format: ["esm"],
          dts: pkg.dts !== false,
          outDir: tmpEsm,
          outputOptions: {
            preserveModules: true,
            preserveModulesRoot: srcDir,
          },
        }),
        build({
          ...sharedOptions,
          format: ["cjs"],
          // CJS skips DTS — types are served from ESM declarations (see package-json.ts).
          dts: false,
          outDir: tmpCjs,
        }),
      ]);

      reorganiseOutput(tmpEsm, buildPath, ["esm"], pkg, true);
      // keepNativeExtension=true: CJS files come out as .cjs from tsdown; we keep that
      // extension so the exports map (./cjs/index.cjs) resolves correctly.
      reorganiseOutput(tmpCjs, buildPath, ["cjs"], pkg, false, true);
      rmTmp(tmpEsm);
      rmTmp(tmpCjs);
    } else {
      // Single build: either one format only, or preserveModules disabled.
      const tmpDir = toForwardSlash(resolvePath(buildPath, "_tmp"));
      ensureDir(tmpDir);

      await build({
        ...sharedOptions,
        format: formats as ("esm" | "cjs")[],
        dts: pkg.dts !== false,
        outDir: tmpDir,
        ...(shouldPreserveModules && formats.includes("esm")
          ? { outputOptions: { preserveModules: true, preserveModulesRoot: srcDir } }
          : {}),
      });

      reorganiseOutput(tmpDir, buildPath, formats as ("esm" | "cjs")[], pkg, shouldPreserveModules);
      rmTmp(tmpDir);
    }
  } catch (err) {
    throw wrapError("tsdown-build", pkg.name, err);
  }

  logger.success(`Compiled ${pkg.name}`);
}

function rmTmp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // non-fatal — stale tmp is harmless
  }
}

// ─── Output reorganisation ──────────────────────────────────────────────────

/**
 * Move the flat tsdown output (in tmpDir) into `esm/` and `cjs/` subdirectories
 * under buildPath.  Renames .mjs → .js and .cjs → .js so that relative imports
 * inside each format directory resolve correctly.
 */
function reorganiseOutput(
  tmpDir: string,
  buildPath: string,
  formats: ("esm" | "cjs")[],
  pkg: PackageBase,
  preserveModules: boolean,
  keepNativeExtension = false,
): void {
  const esmDir = joinPath(buildPath, "esm");
  const cjsDir = joinPath(buildPath, "cjs");

  if (formats.includes("esm")) ensureDir(esmDir);
  if (formats.includes("cjs")) ensureDir(cjsDir);

  const mainType = pkg.mainType ?? (formats.includes("cjs") ? "cjs" : "esm");

  processDirectory(tmpDir, { esmDir, cjsDir, formats, mainType, pkg, tmpDir, preserveModules, keepNativeExtension });
}

interface ReorgContext {
  esmDir: string;
  cjsDir: string;
  formats: ("esm" | "cjs")[];
  mainType: "esm" | "cjs";
  pkg: PackageBase;
  /** Absolute path to the flat _tmp/ directory — used to compute relative paths when preserveModules is on. */
  tmpDir: string;
  preserveModules: boolean;
  /**
   * When true, keep the native .mjs/.cjs extensions instead of normalising to .js.
   * Used in the CJS-only leg of the two-build path so the final file stays .cjs.
   */
  keepNativeExtension: boolean;
}

function processDirectory(dir: string, ctx: ReorgContext): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = joinPath(dir, entry.name);
    if (entry.isDirectory()) {
      // Recursively handle subdirectories (chunk splits, etc.)
      processDirectory(fullPath, ctx);
    } else {
      processFile(fullPath, entry.name, ctx);
    }
  }
}

function processFile(filePath: string, name: string, ctx: ReorgContext): void {
  const { esmDir, cjsDir, formats, mainType, pkg, tmpDir, preserveModules } = ctx;

  // Relative subdirectory from the tmp root — preserves folder structure for both
  // preserveModules output and multi-entry single-bundle output (where each entry
  // lands in its own subdirectory, e.g. cli/index.cjs).
  // path.relative may return backslashes on Windows — normalise to forward slashes.
  const relDir = toForwardSlash(path.relative(tmpDir, path.dirname(filePath)));

  if (preserveModules) {
    if (isEsmFile(name)) {
      if (formats.includes("esm")) {
        moveFile(filePath, joinPath(esmDir, relDir, name), pkg.name);
      }
    } else if (isCjsFile(name)) {
      if (formats.includes("cjs")) {
        moveFile(filePath, joinPath(cjsDir, relDir, name), pkg.name);
      }
    } else if (isDtsFile(name)) {
      const targetDir = formats.includes("esm") ? esmDir : cjsDir;
      moveFile(filePath, joinPath(targetDir, relDir, name), pkg.name);
    }
    // Unknown extensions silently ignored.
    return;
  }

  // ── Single-bundle mode ──────────────────────────────────────────────────────
  const { keepNativeExtension } = ctx;

  if (isEsmFile(name)) {
    if (formats.includes("esm")) {
      const destName = keepNativeExtension ? name : normaliseEsmName(name);
      moveFile(filePath, joinPath(esmDir, relDir, destName), pkg.name);
    }
  } else if (isCjsFile(name)) {
    if (formats.includes("cjs")) {
      const destName = keepNativeExtension ? name : normaliseCjsName(name);
      moveFile(filePath, joinPath(cjsDir, relDir, destName), pkg.name);
    }
  } else if (isDtsFile(name)) {
    const targetDir = formats.includes("esm") ? esmDir : cjsDir;
    moveFile(filePath, joinPath(targetDir, relDir, name), pkg.name);
  } else if (isJsFile(name)) {
    // Plain .js / .js.map — emitted when the format array contains only one format
    // (tsdown uses .js instead of .mjs/.cjs when there's no other format to differentiate from).
    const targetDir = mainType === "esm" ? esmDir : cjsDir;
    if (formats.includes(mainType)) {
      // Files landing in cjsDir should use the .cjs extension for consistency.
      const destName =
        targetDir === cjsDir
          ? name.replace(/\.js\.map$/, ".cjs.map").replace(/\.js$/, ".cjs")
          : name;
      moveFile(filePath, joinPath(targetDir, relDir, destName), pkg.name);
    }
  }
  // Unknown extensions are silently ignored.
}

// ─── Extension predicates ───────────────────────────────────────────────────

function isEsmFile(name: string): boolean {
  return (
    name.endsWith(".mjs") ||
    name.endsWith(".mjs.map") ||
    name.endsWith(".d.mts") ||
    name.endsWith(".d.mts.map")
  );
}

function isCjsFile(name: string): boolean {
  return (
    name.endsWith(".cjs") ||
    name.endsWith(".cjs.map") ||
    name.endsWith(".d.cts") ||
    name.endsWith(".d.cts.map")
  );
}

function isDtsFile(name: string): boolean {
  return name.endsWith(".d.ts") || name.endsWith(".d.ts.map");
}

function isJsFile(name: string): boolean {
  return (
    (name.endsWith(".js") || name.endsWith(".js.map")) &&
    !name.endsWith(".d.ts") &&
    !name.endsWith(".d.ts.map")
  );
}

// ─── Name normalisation ─────────────────────────────────────────────────────

/** Rename .mjs / .d.mts → .js / .d.ts for the esm/ directory. */
function normaliseEsmName(name: string): string {
  return name
    .replace(/\.mjs\.map$/, ".js.map")
    .replace(/\.mjs$/, ".js")
    .replace(/\.d\.mts\.map$/, ".d.ts.map")
    .replace(/\.d\.mts$/, ".d.ts");
}

/** Rename .cjs / .d.cts → .js / .d.ts for the cjs/ directory. */
function normaliseCjsName(name: string): string {
  return name
    .replace(/\.cjs\.map$/, ".js.map")
    .replace(/\.cjs$/, ".js")
    .replace(/\.d\.cts\.map$/, ".d.ts.map")
    .replace(/\.d\.cts$/, ".d.ts");
}
