import type { BundlerConfig } from "../types/index.js";

/**
 * Type-safe config factory.
 * Simply returns the config object unchanged — used purely for IDE autocomplete and type checking.
 */
export function defineConfig(config: BundlerConfig): BundlerConfig {
  return config;
}
