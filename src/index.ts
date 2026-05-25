// Public API — used by builder config files via: import { defineConfig } from "@mongez/bundler"
export { defineConfig } from "./config/define-config.js";

// Type exports
export type {
  PackageBase,
  StandalonePackage,
  FamilyPackage,
  Family,
  BundlerConfig,
  BuilderSettings,
  BuildOptions,
} from "./types/index.js";

// Re-export loadConfig for programmatic usage
export { loadConfig, findDefaultConfigPath } from "./config/load-config.js";
export type { LoadedConfig } from "./config/load-config.js";

// Programmatic build API
export { buildPackage } from "./build/package-builder.js";
export type { BuildResult } from "./build/package-builder.js";
export { buildFamily } from "./build/family-builder.js";
export { runParallel } from "./build/parallel-builder.js";

// Version utilities
export { resolveVersion } from "./version/increment.js";
