/**
 * Example pkgist release config.
 *
 * Copy this file to `builder.ts` (or `pkgist.config.ts`) in your project root
 * and customize for your packages. The real config is gitignored — each user
 * writes their own.
 *
 * CLI usage:
 *   pkgist validate                   # check the config + package roots exist
 *   pkgist list                       # show all registered packages + versions
 *   pkgist build @scope/pkg           # build one standalone package
 *   pkgist build:family family-name   # build a synchronized family
 *   pkgist build:all                  # build everything
 *   pkgist build:all --dry-run        # preview the full pipeline without writing
 *
 * Common flags: --no-publish, --no-git, --concurrency <n>, --verbose
 */
import { defineConfig } from "@mongez/pkgist";

const RELEASE_COMMIT = "chore: release";

export default defineConfig({
  settings: {
    concurrency: 8,           // parallel build limit
    buildDir: "../builds",    // where compiled packages are written
    sourcesDir: "../sources", // source snapshots (excludes .git, node_modules)
  },

  // Standalone packages — each versions independently.
  standalone: [
    {
      name: "@my-scope/utils",
      root: "../packages/utils",
      version: "patch",             // "auto" | "patch" | "minor" | "major" | "1.2.3"
      commit: RELEASE_COMMIT,       // omit to skip git entirely
      clone: ["README.md", "LICENSE", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@my-scope/react-utils",
      root: "../packages/react-utils",
      type: "react",                // adds JSX support
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "LICENSE"],
    },
    {
      name: "@my-scope/vite-plugin",
      root: "../packages/vite-plugin",
      mainType: "esm",              // primary format
      formats: ["esm"],             // ESM-only output
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "LICENSE"],
    },
  ],

  // Families — multiple packages that share one synchronized version.
  // The family picks the highest current version across all members, then bumps.
  families: [
    {
      name: "state",
      version: "patch",
      commit: RELEASE_COMMIT,
      packages: [
        {
          name: "@my-scope/state-core",
          root: "../packages/state-core",
          clone: ["README.md", "LICENSE"],
        },
        {
          name: "@my-scope/react-state",
          root: "../packages/react-state",
          type: "react",
          clone: ["README.md", "LICENSE"],
        },
      ],
    },
  ],
});
