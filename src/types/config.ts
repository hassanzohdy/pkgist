import type { StandalonePackage, Family } from "./package.js";

export interface BuilderSettings {
  /** Maximum number of packages compiled in parallel. default: 4 */
  concurrency?: number;
  /**
   * Directory where versioned build artifacts are stored.
   * Relative path is resolved from the config file location.
   * e.g. "../builds" → <configDir>/../builds
   */
  buildDir: string;
  /**
   * Directory where source snapshots are copied before compilation.
   * Relative path is resolved from the config file location.
   * Optional — if absent, no source backup is performed.
   */
  sourcesDir?: string;
}

export interface BundlerConfig {
  settings: BuilderSettings;
  standalone?: StandalonePackage[];
  families?: Family[];
}

/** Runtime options injected by the CLI into every build operation */
export interface BuildOptions {
  dryRun: boolean;
  noPublish: boolean;
  noGit: boolean;
  concurrency?: number;
  configPath: string;
}
