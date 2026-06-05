import type { Command } from "commander";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { buildPackage } from "../build/package-builder.js";
import { buildFamily } from "../build/family-builder.js";
import { runParallel } from "../build/parallel-builder.js";
import { logger } from "../utils/logger.js";
import type { BuildOptions } from "../types/index.js";
import type { BuildResult } from "../build/package-builder.js";

interface BuildAllOptions {
  dryRun?: boolean;
  // commander stores negated flags under their POSITIVE attribute:
  // `--no-publish` → publish === false, `--no-git` → git === false.
  publish?: boolean;
  git?: boolean;
  config?: string;
  concurrency?: string;
  // `--bump <strategy>`: a value-bearing option → string (or undefined when absent).
  // Named `--bump` (not `--version`) because commander reserves `--version` for the
  // root program's version printer, which would intercept it before this subcommand.
  bump?: string;
  // `--commit [message]`: an optional-arg option → string when a message is given,
  // `true` for a bare `--commit` (auto message), or undefined when absent.
  commit?: string | boolean;
}

export function registerBuildAllCommand(program: Command): void {
  program
    .command("build:all")
    .description("Build all standalone packages and all families.")
    .option("--dry-run", "Print what would happen without making any changes")
    .option("--no-publish", "Skip npm publish")
    .option("--no-git", "Skip git operations")
    .option("--config <path>", "Path to config file")
    .option("--concurrency <n>", "Override concurrency")
    .option(
      "--bump <strategy>",
      "Override the configured version for every built package this run: patch | minor | major | auto | an explicit x.y.z",
    )
    .option(
      "--commit [message]",
      'Override the configured commit for every built package this run: a message string, or a bare --commit to auto-generate "Released <version>"',
    )
    .action(async (opts: BuildAllOptions) => {
      const configPath =
        opts.config ?? findDefaultConfigPath(process.cwd());

      const { config, configDir } = await loadConfig(configPath);

      const rawOpts = opts as Record<string, unknown>;
      const shouldPublish = rawOpts["publish"] !== false;
      const shouldGit = rawOpts["git"] !== false;

      const buildOptions: BuildOptions = {
        dryRun: opts.dryRun ?? false,
        noPublish: !shouldPublish,
        noGit: !shouldGit,
        concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : undefined,
        configPath,
        versionOverride: opts.bump,
        commitOverride: opts.commit,
      };

      const concurrency = buildOptions.concurrency ?? config.settings.concurrency ?? 4;

      const allResults: BuildResult[] = [];

      // Build all standalone packages in parallel
      const standalone = config.standalone ?? [];
      if (standalone.length > 0) {
        logger.info(`Building ${standalone.length} standalone package(s)…`);
        const standaloneTasks = standalone.map(
          (pkg) => () =>
            buildPackage(
              pkg,
              pkg.version ?? "auto",
              config.settings,
              buildOptions,
              configDir,
            ),
        );
        const standaloneResults = await runParallel(standaloneTasks, concurrency);
        allResults.push(...standaloneResults);
      }

      // Build all families sequentially (families share a version; running
      // multiple families in parallel is fine since they're independent)
      const families = config.families ?? [];
      if (families.length > 0) {
        logger.info(`Building ${families.length} famil${families.length === 1 ? "y" : "ies"}…`);
        for (const family of families) {
          const familyResults = await buildFamily(
            family,
            config.settings,
            buildOptions,
            configDir,
          );
          allResults.push(...familyResults);
        }
      }

      const succeeded = allResults.filter((r) => r.success).length;
      const failed = allResults.filter((r) => !r.success).length;

      logger.info(`\nSummary: ${succeeded} succeeded, ${failed} failed out of ${allResults.length} total`);
      process.exit(failed > 0 ? 1 : 0);
    });
}
