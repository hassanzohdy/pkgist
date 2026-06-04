import path from "path";
import { pathToFileURL } from "url";
import fs from "fs";
import type { BundlerConfig } from "../types/index.js";
import { resolvePath } from "../utils/paths.js";
import { wrapError } from "../utils/errors.js";

export interface LoadedConfig {
  config: BundlerConfig;
  /** Absolute, forward-slash normalised path to the config file */
  configPath: string;
  /** Directory containing the config file — used to resolve relative roots */
  configDir: string;
}

/**
 * Register tsx as a Node loader so TypeScript config files can be imported
 * directly via dynamic import(). Safe to call multiple times — tsx is only
 * registered once. No-ops when tsx is not installed (JS-only config still works).
 */
async function ensureTsxRegistered(): Promise<void> {
  try {
    const { register } = await import("node:module");
    let tsxUrl: string | null = null;
    try {
      tsxUrl = import.meta.resolve("tsx/esm");
    } catch {
      // tsx not installed — JS-only configs still work fine
    }
    if (register && tsxUrl) {
      register(tsxUrl, import.meta.url);
    }
  } catch {
    // node:module unavailable (old Node) — fall through silently
  }
}

/** Load and validate a pkgist config file (TypeScript or JavaScript). */
export async function loadConfig(configFilePath: string): Promise<LoadedConfig> {
  const absolute = resolvePath(configFilePath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Config file not found: ${absolute}`);
  }

  let mod: { default?: BundlerConfig };

  try {
    // Register tsx so .ts config files import without the user needing
    // to prefix the command with `node --import tsx/esm`.
    if (absolute.endsWith(".ts")) {
      await ensureTsxRegistered();
    }

    // Convert to a file:// URL so dynamic import works correctly on Windows.
    const fileUrl = pathToFileURL(absolute).href;
    mod = await import(fileUrl);
  } catch (err) {
    throw wrapError("load-config", absolute, err);
  }

  const config = mod.default;

  if (!config || typeof config !== "object") {
    throw new Error(
      `Config file ${absolute} must export a default object from defineConfig(). Got: ${typeof config}`,
    );
  }

  validateConfig(config, absolute);

  return {
    config,
    configPath: absolute,
    configDir: resolvePath(path.dirname(absolute)),
  };
}

function validateConfig(config: BundlerConfig, filePath: string): void {
  if (!config.settings) {
    throw new Error(`Config "${filePath}" must have a "settings" object.`);
  }
  if (!config.settings.buildDir) {
    throw new Error(`Config "${filePath}" settings.buildDir is required.`);
  }

  const names = new Set<string>();

  for (const pkg of config.standalone ?? []) {
    if (!pkg.name) throw new Error(`Standalone package is missing "name" in ${filePath}`);
    if (!pkg.root) throw new Error(`Standalone package "${pkg.name}" is missing "root"`);
    if (names.has(pkg.name)) throw new Error(`Duplicate package name: "${pkg.name}"`);
    names.add(pkg.name);
  }

  for (const family of config.families ?? []) {
    if (!family.name) throw new Error(`A family is missing "name" in ${filePath}`);
    for (const pkg of family.packages) {
      if (!pkg.name) throw new Error(`Package inside family "${family.name}" is missing "name"`);
      if (!pkg.root) throw new Error(`Package "${pkg.name}" in family "${family.name}" is missing "root"`);
      if (names.has(pkg.name)) throw new Error(`Duplicate package name: "${pkg.name}"`);
      names.add(pkg.name);
    }
  }
}

/**
 * Attempt to find the default config file in the working directory.
 * Tries `pkgist.config.ts` then `pkgist.config.js` (first match wins).
 *
 * pkgist recognises a single config name — `pkgist.config.{ts,js}` — on purpose:
 * one obvious file, no legacy aliases to wonder about. Run `pkgist init` to
 * scaffold one. Use `--config <path>` for a non-default location.
 */
export function findDefaultConfigPath(cwd: string): string {
  const candidates = ["pkgist.config.ts", "pkgist.config.js"];
  for (const candidate of candidates) {
    const full = path.join(cwd, candidate);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(
    `No config file found in ${cwd}. Tried: ${candidates.join(", ")}. ` +
      `Run \`pkgist init\` to create one, or use --config <path> to specify a custom location.`,
  );
}
