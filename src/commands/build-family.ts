import type { Command } from "commander";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { buildFamily } from "../build/family-builder.js";
import { logger } from "../utils/logger.js";
import type { BuildOptions } from "../types/index.js";

interface BuildFamilyOptions {
  dryRun?: boolean;
  noPublish?: boolean;
  noGit?: boolean;
  config?: string;
  concurrency?: string;
}

export function registerBuildFamilyCommand(program: Command): void {
  program
    .command("build:family <name>")
    .description("Build all packages in a named family with a single shared version.")
    .option("--dry-run", "Print what would happen without making any changes")
    .option("--no-publish", "Skip npm publish")
    .option("--no-git", "Skip git operations")
    .option("--config <path>", "Path to config file")
    .option("--concurrency <n>", "Override concurrency")
    .action(async (familyName: string, opts: BuildFamilyOptions) => {
      const configPath =
        opts.config ?? findDefaultConfigPath(process.cwd());

      const { config, configDir } = await loadConfig(configPath);

      const rawOpts = opts as Record<string, unknown>;
      const shouldPublish = rawOpts["publish"] !== false;

      const buildOptions: BuildOptions = {
        dryRun: opts.dryRun ?? false,
        noPublish: !shouldPublish,
        noGit: opts.noGit ?? false,
        concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : undefined,
        configPath,
      };

      const family = (config.families ?? []).find((f) => f.name === familyName);

      if (!family) {
        const available = (config.families ?? []).map((f) => f.name).join(", ");
        logger.error(
          `Family "${familyName}" not found. Available families: ${available || "(none)"}`,
        );
        process.exit(1);
      }

      const results = await buildFamily(family, config.settings, buildOptions, configDir);
      const anyFailed = results.some((r) => !r.success);
      process.exit(anyFailed ? 1 : 0);
    });
}
