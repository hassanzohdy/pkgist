import type { Command } from "commander";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { buildFamily } from "../build/family-builder.js";
import { logger } from "../utils/logger.js";
import { reportRun, reportFamily, narrowingNotes } from "../report/run-report.js";
import type { BuildOptions } from "../types/index.js";

interface BuildFamilyOptions {
  dryRun?: boolean;
  // commander stores negated flags under their POSITIVE attribute:
  // `--no-publish` → publish === false, `--no-git` → git === false.
  publish?: boolean;
  git?: boolean;
  verifyPublish?: boolean;
  config?: string;
  concurrency?: string;
  retries?: string;
  // `--bump <strategy>`: a value-bearing option → string (or undefined when absent).
  // Named `--bump` (not `--version`) because commander reserves `--version` for the
  // root program's version printer, which would intercept it before this subcommand.
  bump?: string;
  // `--commit [message]`: an optional-arg option → string when a message is given,
  // `true` for a bare `--commit` (auto message), or undefined when absent.
  commit?: string | boolean;
}

export function registerBuildFamilyCommand(program: Command): void {
  program
    .command("build:family <name>")
    .description("Build all packages in a named family with a single shared version.")
    .option("--dry-run", "Print what would happen without making any changes")
    .option("--no-publish", "Skip npm publish")
    .option("--no-git", "Skip git operations")
    .option("--no-verify-publish", "Skip the post-publish registry read-back")
    .option("--config <path>", "Path to config file")
    .option("--concurrency <n>", "Override concurrency")
    .option("--retries <n>", "Attempts per network operation, including the first (default 3)")
    .option(
      "--bump <strategy>",
      "Override the family's configured version for this run: patch | minor | major | auto | an explicit x.y.z",
    )
    .option(
      "--commit [message]",
      'Override the configured commit for this run: a message string, or a bare --commit to auto-generate "Released <version>"',
    )
    .action(async (familyName: string, opts: BuildFamilyOptions) => {
      const configPath =
        opts.config ?? findDefaultConfigPath(process.cwd());

      const { config, configDir } = await loadConfig(configPath);

      const rawOpts = opts as Record<string, unknown>;
      const shouldPublish = rawOpts["publish"] !== false;
      const shouldGit = rawOpts["git"] !== false;
      const shouldVerify = rawOpts["verifyPublish"] !== false;

      const buildOptions: BuildOptions = {
        dryRun: opts.dryRun ?? false,
        noPublish: !shouldPublish,
        noGit: !shouldGit,
        concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : undefined,
        configPath,
        versionOverride: opts.bump,
        commitOverride: opts.commit,
        retries: opts.retries ? parseInt(opts.retries, 10) : undefined,
        verifyPublish: shouldVerify,
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

      // A lockstep family that lost a member is broken, not partially shipped —
      // say so before the per-package detail.
      reportFamily(familyName, results);

      const { exitCode } = reportRun(results, {
        command: `build:family ${familyName}`,
        narrowed: narrowingNotes({
          noPublish: buildOptions.noPublish,
          noGit: buildOptions.noGit,
          verifyPublish: shouldVerify,
        }),
        dryRun: buildOptions.dryRun,
      });

      process.exit(exitCode);
    });
}
