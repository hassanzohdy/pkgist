import type { Command } from "commander";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

/** Config filenames pkgist recognises (first match wins during discovery). */
const CONFIG_FILES = ["pkgist.config.ts", "pkgist.config.js"];

/** Starter config written by `pkgist init`. Build/source dirs default to the
 * current directory (`./builds`, `./sources`) so a fresh project works as-is. */
const TEMPLATE = `import { defineConfig } from "@mongez/pkgist";

export default defineConfig({
  settings: {
    concurrency: 4,
    buildDir: "./builds",     // where compiled packages are written
    sourcesDir: "./sources",  // source snapshots (excludes .git, node_modules, dist)
  },

  // Standalone packages — each versions independently.
  standalone: [
    {
      name: "@my-scope/example",
      root: "./packages/example",
      version: "patch",        // "auto" | "patch" | "minor" | "major" | "1.2.3"
      commit: true,            // true -> auto "Released <version>"; string -> exact; false -> skip git
      clone: ["README.md", "LICENSE"],
    },
  ],

  // Families — packages that share one synchronized version. Optional.
  families: [],
});
`;

interface InitOptions {
  force?: boolean;
}

/**
 * \`pkgist init\` — scaffold a \`pkgist.config.ts\` in the current directory.
 *
 * If a config already exists it does nothing (pass \`--force\` to overwrite).
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a pkgist.config.ts in the current directory (skips if one already exists).")
    .option("--force", "Overwrite an existing config file")
    .action((opts: InitOptions) => {
      const cwd = process.cwd();
      const existing = CONFIG_FILES.find((f) => fs.existsSync(path.join(cwd, f)));

      if (existing && !opts.force) {
        logger.warn(
          `Config already exists: ${existing} — nothing to do. Pass --force to overwrite.`,
        );
        process.exit(0);
      }

      const target = path.join(cwd, "pkgist.config.ts");
      try {
        fs.writeFileSync(target, TEMPLATE, "utf-8");
      } catch (err) {
        logger.error(`Failed to write pkgist.config.ts: ${(err as Error).message}`);
        process.exit(1);
      }

      logger.success(`Created pkgist.config.ts`);
      logger.info("Edit it to point at your packages, then run: pkgist validate");
    });
}
