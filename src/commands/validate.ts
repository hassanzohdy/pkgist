import type { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { resolvePath } from "../utils/paths.js";
import { logger } from "../utils/logger.js";

interface ValidateOptions {
  config?: string;
}

interface ValidationIssue {
  level: "error" | "warn";
  message: string;
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate the config file and check that all package roots exist.")
    .option("--config <path>", "Path to config file")
    .action(async (opts: ValidateOptions) => {
      const configPath = opts.config ?? findDefaultConfigPath(process.cwd());

      let config: Awaited<ReturnType<typeof loadConfig>>["config"];
      let configDir: string;

      try {
        const loaded = await loadConfig(configPath);
        config = loaded.config;
        configDir = loaded.configDir;
      } catch (err) {
        logger.error(
          `Config load failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      const issues: ValidationIssue[] = [];

      // Check all package roots exist
      const allPackages = [
        ...(config.standalone ?? []).map((p) => ({
          name: p.name,
          root: p.root,
          context: "standalone",
        })),
        ...(config.families ?? []).flatMap((f) =>
          f.packages.map((p) => ({
            name: p.name,
            root: p.root,
            context: `family:${f.name}`,
          })),
        ),
      ];

      for (const { name, root, context } of allPackages) {
        const abs = resolvePath(configDir, root);
        if (!fs.existsSync(abs)) {
          issues.push({
            level: "error",
            message: `[${context}] "${name}": root does not exist — ${abs}`,
          });
          continue;
        }

        const pkgJsonPath = resolvePath(abs, "package.json");
        if (!fs.existsSync(pkgJsonPath)) {
          issues.push({
            level: "error",
            message: `[${context}] "${name}": package.json not found at ${pkgJsonPath}`,
          });
          continue;
        }

        try {
          const raw = fs.readFileSync(pkgJsonPath, "utf-8");
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (!parsed["version"]) {
            issues.push({
              level: "error",
              message: `[${context}] "${name}": package.json is missing "version" field`,
            });
          }
        } catch (err) {
          issues.push({
            level: "error",
            message: `[${context}] "${name}": failed to parse package.json — ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        }
      }

      // Check buildDir
      const buildDir = resolvePath(configDir, config.settings.buildDir);
      if (!fs.existsSync(buildDir)) {
        issues.push({
          level: "warn",
          message: `settings.buildDir does not exist yet and will be created on first build: ${buildDir}`,
        });
      }

      // Print results
      if (issues.length === 0) {
        console.log(chalk.green(`Config is valid. ${allPackages.length} package(s) found.`));
        process.exit(0);
      } else {
        const errors = issues.filter((i) => i.level === "error");
        const warnings = issues.filter((i) => i.level === "warn");

        for (const issue of warnings) {
          console.log(chalk.yellow(`WARN  ${issue.message}`));
        }
        for (const issue of errors) {
          console.log(chalk.red(`ERROR ${issue.message}`));
        }

        console.log(
          `\n${errors.length} error(s), ${warnings.length} warning(s) found.`,
        );
        process.exit(errors.length > 0 ? 1 : 0);
      }
    });
}
