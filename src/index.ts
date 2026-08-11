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
export { buildFamily } from "./build/family-builder.js";
export { runParallel } from "./build/parallel-builder.js";
export type {
  BuildResult,
  PhaseName,
  PhaseStatus,
  PhaseOutcome,
} from "./types/result.js";

// Release integrity
export { reportRun, reportFamily, narrowingNotes } from "./report/run-report.js";
export type { RunScope, RunReport } from "./report/run-report.js";
export { queryPublishedVersion, classifyRegistryResponse } from "./publish/registry.js";
export type { RegistryState, RegistryAnswer } from "./publish/registry.js";
export { withRetry, isRetryableError } from "./utils/retry.js";

// Version utilities
export { resolveVersion } from "./version/increment.js";
