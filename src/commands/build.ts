import type { Command } from "commander";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { buildPackage } from "../build/package-builder.js";
import { runParallel } from "../build/parallel-builder.js";
import { logger } from "../utils/logger.js";
import type { BuildOptions } from "../types/index.js";

interface BuildCommandOptions {
  all?: boolean;
  dryRun?: boolean;
  noPublish?: boolean;
  noGit?: boolean;
  config?: string;
  concurrency?: string;
}

export function registerBuildCommand(program: Command): void {
  program
    .command("build [packages...]")
    .description("Build standalone packages by name. Use --all to build all standalone packages.")
    .option("--all", "Build all standalone packages")
    .option("--dry-run", "Print what would happen without making any changes")
    .option("--no-publish", "Skip npm publish")
    .option("--no-git", "Skip git operations")
    .option("--config <path>", "Path to config file")
    .option("--concurrency <n>", "Override concurrency")
    .action(async (packageNames: string[], opts: BuildCommandOptions) => {
      const configPath =
        opts.config ?? findDefaultConfigPath(process.cwd());

      const { config, configDir } = await loadConfig(configPath);

      const buildOptions: BuildOptions = {
        dryRun: opts.dryRun ?? false,
        noPublish: !opts.noPublish, // commander flips --no-publish to noPublish=false
        noGit: opts.noGit ?? false,
        concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : undefined,
        configPath,
      };

      // Fix: commander's --no-publish sets opts.publish = false (not opts.noPublish)
      // We need to check for the raw value
      const rawOpts = opts as Record<string, unknown>;
      const shouldPublish = rawOpts["publish"] !== false;
      buildOptions.noPublish = !shouldPublish;

      const standalone = config.standalone ?? [];

      let targets = standalone;

      if (!opts.all && packageNames.length > 0) {
        targets = standalone.filter((p) => packageNames.includes(p.name));
        const missing = packageNames.filter(
          (n) => !standalone.some((p) => p.name === n),
        );
        if (missing.length > 0) {
          logger.warn(`Unknown package names: ${missing.join(", ")}`);
        }
      }

      if (targets.length === 0) {
        logger.warn("No standalone packages matched. Use --all or specify package names.");
        process.exit(0);
      }

      const concurrency =
        buildOptions.concurrency ?? config.settings.concurrency ?? 4;

      const tasks = targets.map(
        (pkg) => () =>
          buildPackage(
            pkg,
            pkg.version ?? "auto",
            config.settings,
            buildOptions,
            configDir,
          ),
      );

      const results = await runParallel(tasks, concurrency);
      const anyFailed = results.some((r) => !r.success);
      process.exit(anyFailed ? 1 : 0);
    });
}
