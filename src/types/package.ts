export interface PackageBase {
  /** npm package name, e.g. "@mongez/reinforcements" */
  name: string;
  /** relative path to package root, resolved from the builder config file location */
  root: string;
  /** package type — affects jsx transform for react packages */
  type?: "typescript" | "react";
  /** primary output format — determines "main" field in built package.json */
  mainType?: "cjs" | "esm";
  /** output formats to produce. default: ["esm", "cjs"] */
  formats?: ("esm" | "cjs")[];
  /** entry files inside srcDir. default: ["index.ts"] */
  entries?: string | string[];
  /** source directory relative to root. default: "src" */
  srcDir?: string;
  /** minify output. default: false */
  minify?: boolean;
  /** emit sourcemaps. default: true */
  sourcemap?: boolean;
  /** emit d.ts declarations. default: true */
  dts?: boolean;
  /**
   * Preserve the original module structure in the output instead of bundling
   * everything into a single index.js.
   *
   * When true, each source file becomes its own output file (e.g.
   * `src/array/chunk.ts` → `esm/array/chunk.mjs`). Produces much more useful
   * stack traces because file names are preserved.
   *
   * When false, all sources are bundled into a single `esm/index.js` +
   * `cjs/index.js`. Useful for tiny single-file packages.
   *
   * @default true
   */
  preserveModules?: boolean;
  /**
   * Files to copy into the build directory.
   * A plain string copies from the package root to the build root with the same name.
   * A tuple [src, dest] copies src (relative to package root) to dest (relative to build dir).
   */
  clone?: (string | [string, string])[];
  /** run npm publish after build. default: true */
  publish?: boolean;
  /** npm access scope. default: "public" */
  access?: "public" | "restricted";
  /** git commit message. if absent, git operations are skipped entirely */
  commit?: string;
  /** git branch to push to. default: current branch */
  branch?: string;
}

export interface StandalonePackage extends PackageBase {
  /**
   * Version strategy:
   * - "auto" / "patch" → patch-bump the current version from source package.json
   * - "minor"          → minor-bump (x.Y.0)
   * - "major"          → major-bump (X.0.0)
   * - semver string    → use exactly this version string
   * - omitted          → defaults to "auto"
   */
  version?: "auto" | "patch" | "minor" | "major" | string;
}

export interface FamilyPackage extends PackageBase {
  // No per-package version — version comes from the family definition
}

export interface Family {
  /** Identifier used with `build:family <name>` */
  name: string;
  /**
   * Version strategy for all packages in this family.
   * - "auto"  → patch-bump from the first package's current version
   * - string  → use exactly this version string
   * default: "auto"
   */
  version?: "auto" | "patch" | "minor" | "major" | string;
  /** git commit message that overrides per-package commit */
  commit?: string;
  packages: FamilyPackage[];
}
