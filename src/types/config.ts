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
  /**
   * CLI `--bump <strategy>` override. When set, it takes precedence over every
   * targeted package's (or family's) configured `version` for this run only —
   * the config file is never mutated. Same shape as the config `version` field:
   * "auto" | "patch" | "minor" | "major" | an explicit semver string.
   * (Named `--bump` on the CLI because commander reserves `--version` for the
   * root program's version printer.)
   */
  versionOverride?: string;
  /**
   * CLI `--commit [message]` override. When set, it takes precedence over the
   * targeted package's (or family's) configured `commit` for this run only.
   * Same shape as `PackageBase.commit`: a message string, or `true` (auto
   * "Released <version>"). To skip git instead, pass `--no-git`.
   */
  commitOverride?: string | boolean;
  /**
   * Total attempts (including the first) for each network-class operation —
   * push, tag push, publish. Defaults to 3. Non-network failures are never
   * retried regardless of this value.
   */
  retries?: number;
  /**
   * Read the published version back from the registry after publishing, and
   * treat a version the registry does not serve as a failed publish.
   *
   * Defaults to true. `npm publish` exiting 0 is not proof the package
   * arrived — during the 2026-08-11 incident it exited 0 for a package that
   * never reached the registry, and only a registry read caught it. Disable
   * with `--no-verify-publish` when working against a registry that cannot be
   * queried.
   */
  verifyPublish?: boolean;
}
