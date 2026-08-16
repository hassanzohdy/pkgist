import { readFile, writeFile } from "./file-manager.js";
import { joinPath } from "../utils/paths.js";
import { wrapError } from "../utils/errors.js";
import type { PackageBase } from "../types/index.js";

/**
 * Fields NEVER carried into the published package.json.
 *
 * Deny-list, not allow-list: a published manifest must inherit any field the
 * author wrote unless we have a reason to strip it. An allow-list silently
 * drops the next field npm invents — that is how `peerDependenciesMeta` was
 * lost, publishing every optional peer as required.
 */
export const DROPPED_FIELDS = new Set<string>([
  // Dev-time only — never meaningful to a consumer.
  "scripts",
  "devDependencies",
  "packageManager",
  // Monorepo/root-only — inert or misleading on a published leaf package.
  "private",
  "workspaces",
  "overrides",
  "resolutions",
  "pnpm",
  // Would BREAK the output: pkgist emits a purpose-built directory, so a
  // source `files` (e.g. ["src"]) would ship an empty tarball.
  "files",
  // Tool configuration blocks.
  "eslintConfig",
  "prettier",
  "jest",
  "nodemonConfig",
  "husky",
  "lint-staged",
  // Recomputed below from the build config — never inherited.
  "version",
  "main",
  "module",
  "types",
  "typings",
  "exports",
  "type",
]);

export type SourcePackageJson = Record<string, unknown> & {
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * Read and parse the package.json at <packageRoot>/package.json.
 * Throws a BundlerError if the file is missing or malformed.
 */
export function readSourcePackageJson(
  packageRoot: string,
  packageName: string,
): SourcePackageJson {
  const pkgPath = joinPath(packageRoot, "package.json");
  let raw: string;
  try {
    raw = readFile(pkgPath, packageName);
  } catch {
    throw wrapError(
      "read-package-json",
      packageName,
      new Error(`package.json not found at ${pkgPath}`),
    );
  }

  try {
    const parsed = JSON.parse(raw) as SourcePackageJson;
    if (!parsed.version) {
      throw new Error(`package.json at ${pkgPath} is missing "version" field`);
    }
    return parsed;
  } catch (err) {
    throw wrapError("parse-package-json", packageName, err);
  }
}

/**
 * Write the new version back into the source package.json.
 */
export function writeSourceVersion(
  packageRoot: string,
  packageName: string,
  newVersion: string,
): void {
  const pkgPath = joinPath(packageRoot, "package.json");
  const raw = readFile(pkgPath, packageName);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.version = newVersion;
  writeFile(pkgPath, JSON.stringify(parsed, null, 2) + "\n", packageName);
}

/**
 * Build and write the clean package.json for the build output directory.
 */
export function writeBuildPackageJson(
  pkg: PackageBase,
  sourceJson: SourcePackageJson,
  buildPath: string,
  newVersion: string,
  /**
   * Names of all packages in the same family. Any dependency/peerDependency
   * whose name is in this set is pinned to the exact shared `newVersion` in the
   * PUBLISHED package.json (the source keeps "*" for workspace linking). This
   * mirrors the original builder so a released family installs as a coherent,
   * same-version set instead of leaking "*" to consumers.
   */
  familyPackageNames?: Set<string>,
): void {
  const formats = pkg.formats ?? ["esm", "cjs"];
  const hasEsm = formats.includes("esm");
  const hasCjs = formats.includes("cjs");
  const esmOnly = hasEsm && !hasCjs;

  // When preserveModules is on (the default), tsdown keeps one file per source
  // module and uses native extensions (.mjs/.cjs) so internal cross-file imports
  // resolve correctly. When bundling, everything is renamed to .js for simplicity.
  const preserve = pkg.preserveModules !== false;
  const esmExt  = preserve ? ".mjs"   : ".js";
  const cjsExt  = preserve ? ".cjs"   : ".js";
  const esmDts  = preserve ? ".d.mts" : ".d.ts";
  const cjsDts  = preserve ? ".d.cts" : ".d.ts";

  // Determine entry base names from entries config
  const rawEntries = pkg.entries ?? ["index.ts"];
  const entryList = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  /**
   * Convert an entry path (relative to srcDir) into:
   *   basePath   — path without extension, used to build file paths  (e.g. "cli/index")
   *   exportPath — the key in the exports map                        (e.g. "./cli")
   *
   * When the basename is "index" the directory becomes the export path so that
   * `cli/index.ts` maps to `"./cli"` and `index.ts` maps to `"."`.
   */
  function entryPaths(entry: string): { basePath: string; exportPath: string } {
    const basePath = entry.replace(/\.tsx?$/, "");
    const parts = basePath.split("/");
    const last = parts[parts.length - 1];
    let exportPath: string;
    if (last === "index") {
      const dir = parts.slice(0, -1).join("/");
      exportPath = dir ? `./${dir}` : ".";
    } else {
      exportPath = `./${basePath}`;
    }
    return { basePath, exportPath };
  }

  // Primary entry drives `main` / `module` / `types` fields.
  const { basePath: primaryBase } = entryPaths(entryList[0]!);

  // Build the full exports map — one condition block per entry.
  const exportsMap: Record<string, unknown> = {};

  for (const entry of entryList) {
    const { basePath, exportPath } = entryPaths(entry);
    const conditions: Record<string, unknown> = {};

    if (hasEsm) {
      conditions["import"] = {
        types:   `./esm/${basePath}${esmDts}`,
        default: `./esm/${basePath}${esmExt}`,
      };
    }
    if (hasCjs) {
      // When preserveModules is on, CJS is built without DTS to avoid a rolldown bug.
      // TypeScript resolves types correctly from the ESM declarations via the exports map.
      const cjsTypes = preserve && hasEsm
        ? `./esm/${basePath}${esmDts}`
        : `./cjs/${basePath}${cjsDts}`;
      conditions["require"] = {
        types:   cjsTypes,
        default: `./cjs/${basePath}${cjsExt}`,
      };
    }

    exportsMap[exportPath] = conditions;
  }

  const output: Record<string, unknown> = {};

  // Pass everything through except the explicitly denied fields.
  for (const [field, value] of Object.entries(sourceJson)) {
    if (DROPPED_FIELDS.has(field) || value === undefined) continue;

    // Normalize bin paths: npm rejects values that start with "./"
    if (field === "bin") {
      if (typeof value === "string") {
        output["bin"] = value.replace(/^\.\//, "");
      } else if (value && typeof value === "object") {
        const normalized: Record<string, string> = {};
        for (const [cmd, p] of Object.entries(value as Record<string, string>)) {
          normalized[cmd] = p.replace(/^\.\//, "");
        }
        output["bin"] = normalized;
      }
      continue;
    }

    output[field] = value;
  }

  // Override name / version
  output["name"] = pkg.name;
  output["version"] = newVersion;

  // Pin intra-family deps to the exact shared release version. Creates fresh
  // objects so the source package.json (which keeps "*") is never mutated.
  if (familyPackageNames && familyPackageNames.size > 0) {
    for (const field of ["dependencies", "peerDependencies"] as const) {
      const deps = output[field] as Record<string, string> | undefined;
      if (!deps) continue;
      const pinned: Record<string, string> = {};
      for (const [name, range] of Object.entries(deps)) {
        pinned[name] = familyPackageNames.has(name) ? newVersion : range;
      }
      output[field] = pinned;
    }
  }

  if (esmOnly) {
    output["type"] = "module";
  }

  // Entry points
  const mainType = pkg.mainType ?? "cjs";
  if (mainType === "esm" || esmOnly) {
    output["main"] = `./esm/${primaryBase}${esmExt}`;
  } else {
    output["main"] = `./cjs/${primaryBase}${cjsExt}`;
  }

  if (hasEsm) {
    output["module"] = `./esm/${primaryBase}${esmExt}`;
  }

  output["types"] = `./esm/${primaryBase}${esmDts}`;

  output["exports"] = exportsMap;

  const pkgPath = joinPath(buildPath, "package.json");
  writeFile(pkgPath, JSON.stringify(output, null, 2) + "\n", pkg.name);
}
