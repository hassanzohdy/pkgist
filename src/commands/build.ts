import type { Command } from "commander";
import semver from "semver";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { buildPackage } from "../build/package-builder.js";
import { runParallel } from "../build/parallel-builder.js";
import { readSourcePackageJson } from "../files/package-json.js";
import { resolveVersion } from "../version/increment.js";
import { resolvePath } from "../utils/paths.js";
import { logger } from "../utils/logger.js";
import { reportRun, narrowingNotes } from "../report/run-report.js";
import type { BuildOptions, BundlerConfig, PackageBase } from "../types/index.js";

interface BuildCommandOptions {
  all?: boolean;
  dryRun?: boolean;
  // commander stores negated flags under their POSITIVE attribute:
  // `--no-publish` → publish === false, `--no-git` → git === false.
  // (There is no `noPublish` / `noGit` property — reading those always yields undefined.)
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

/** A package resolved from either the standalone list or a family. */
interface ResolvedTarget {
  pkg: PackageBase;
  versionStrategy: string;
  commit?: string | boolean;
  familyName?: string;
  familyPackageNames?: Set<string>;
  forcedVersion?: string;
}

/**
 * Compute the version a family would use, so a single-member recovery run
 * lands on the same number the family would have produced rather than
 * bumping that one package independently out of lockstep.
 */
function familySharedVersion(
  family: NonNullable<BundlerConfig["families"]>[number],
  strategy: string,
  configDir: string,
): string {
  const isBumpKeyword = ["auto", "patch", "minor", "major"].includes(strategy);

  if (!isBumpKeyword && semver.valid(semver.coerce(strategy) ?? strategy)) {
    return strategy;
  }

  let highest = "0.0.0";
  for (const member of family.packages) {
    const root = resolvePath(configDir, member.root);
    const version = readSourcePackageJson(root, member.name).version ?? "0.0.0";
    if (semver.gt(version, highest)) highest = version;
  }

  return resolveVersion(highest, strategy, family.name);
}

export function registerBuildCommand(program: Command): void {
  program
    .command("build [packages...]")
    .description(
      "Build packages by name — standalone packages or individual family members. Use --all for every standalone package.",
    )
    .option("--all", "Build all standalone packages")
    .option("--dry-run", "Print what would happen without making any changes")
    .option("--no-publish", "Skip npm publish")
    .option("--no-git", "Skip git operations")
    .option("--no-verify-publish", "Skip the post-publish registry read-back")
    .option("--config <path>", "Path to config file")
    .option("--concurrency <n>", "Override concurrency")
    .option("--retries <n>", "Attempts per network operation, including the first (default 3)")
    .option(
      "--bump <strategy>",
      "Override the configured version for this run: patch | minor | major | auto | an explicit x.y.z",
    )
    .option(
      "--commit [message]",
      'Override the configured commit for this run: a message string, or a bare --commit to auto-generate "Released <version>"',
    )
    .action(async (packageNames: string[], opts: BuildCommandOptions) => {
      const configPath = opts.config ?? findDefaultConfigPath(process.cwd());

      const { config, configDir } = await loadConfig(configPath);

      // commander stores `--no-publish` as publish=false and `--no-git` as git=false.
      // Read those positive attributes; the `noPublish`/`noGit` names are never set.
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

      const standalone = config.standalone ?? [];
      const families = config.families ?? [];

      let targets: ResolvedTarget[] = [];

      if (opts.all || packageNames.length === 0) {
        if (!opts.all) {
          // No names and no --all is a usage error, not a no-op that succeeded.
          logger.error("No packages specified. Pass package names or --all.");
          process.exit(1);
        }
        targets = standalone.map(pkg => ({
          pkg,
          versionStrategy: pkg.version ?? "auto",
        }));
      } else {
        const unknown: string[] = [];

        for (const name of packageNames) {
          const standaloneMatch = standalone.find(p => p.name === name);
          if (standaloneMatch) {
            targets.push({
              pkg: standaloneMatch,
              versionStrategy: standaloneMatch.version ?? "auto",
            });
            continue;
          }

          // Family members are addressable by name too. Without this, an
          // operator whose family release lost one package to a timeout has to
          // re-cut all N — re-attempting N-1 publishes that must fail as
          // duplicates and burying the one real failure among them.
          const family = families.find(f => f.packages.some(p => p.name === name));
          if (family) {
            const member = family.packages.find(p => p.name === name)!;
            const strategy = buildOptions.versionOverride ?? family.version ?? "auto";
            const forcedVersion = familySharedVersion(family, strategy, configDir);

            if (!buildOptions.versionOverride) {
              logger.warn(
                `${name} belongs to family "${family.name}". No --bump given, so this run would ` +
                  `create ${forcedVersion}. To finish an existing release, pass the exact version: ` +
                  `--bump <version>`,
              );
            }

            targets.push({
              pkg: member,
              versionStrategy: strategy,
              commit: family.commit ?? member.commit,
              familyName: family.name,
              familyPackageNames: new Set(family.packages.map(p => p.name)),
              forcedVersion,
            });
            continue;
          }

          unknown.push(name);
        }

        if (unknown.length > 0) {
          // A name we cannot resolve means the run cannot do what was asked.
          // This used to warn and exit 0, so a typo — or the documented
          // single-member recovery command — reported success having done
          // nothing at all.
          logger.error(`Unknown package names: ${unknown.join(", ")}`);
          if (targets.length === 0) {
            logger.error("Nothing to build. Check the names against `pkgist list`.");
            process.exit(1);
          }
        }
      }

      if (targets.length === 0) {
        logger.error("No packages matched. Nothing was built.");
        process.exit(1);
      }

      const concurrency = buildOptions.concurrency ?? config.settings.concurrency ?? 4;

      const tasks = targets.map(
        target => () =>
          buildPackage(
            target.pkg,
            target.versionStrategy,
            config.settings,
            buildOptions,
            configDir,
            target.commit,
            target.forcedVersion,
            target.familyPackageNames,
          ),
      );

      const results = await runParallel(tasks, concurrency);

      const singleMembers = targets.filter(t => t.familyName);
      const narrowed = narrowingNotes({
        noPublish: buildOptions.noPublish,
        noGit: buildOptions.noGit,
        verifyPublish: shouldVerify,
        selected: targets.length,
        available: opts.all ? standalone.length : targets.length,
      });

      for (const target of singleMembers) {
        narrowed.push(
          `single member of family "${target.familyName}" — the rest of the family was not touched`,
        );
      }

      const { exitCode } = reportRun(results, {
        command: "build",
        narrowed,
        dryRun: buildOptions.dryRun,
      });

      process.exit(exitCode);
    });
}
