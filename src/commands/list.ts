import type { Command } from "commander";
import chalk from "chalk";
import { loadConfig, findDefaultConfigPath } from "../config/index.js";
import { readSourcePackageJson } from "../files/package-json.js";
import { resolvePath } from "../utils/paths.js";

interface ListOptions {
  config?: string;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List all registered standalone packages and families.")
    .option("--config <path>", "Path to config file")
    .action(async (opts: ListOptions) => {
      const configPath = opts.config ?? findDefaultConfigPath(process.cwd());
      const { config, configDir } = await loadConfig(configPath);

      const standalone = config.standalone ?? [];
      const families = config.families ?? [];

      console.log(chalk.bold("\n=== Standalone Packages ==="));
      if (standalone.length === 0) {
        console.log(chalk.gray("  (none)"));
      } else {
        for (const pkg of standalone) {
          const root = resolvePath(configDir, pkg.root);
          let version = "?";
          try {
            const json = readSourcePackageJson(root, pkg.name);
            version = json.version;
          } catch {
            version = chalk.red("(package.json missing)");
          }
          const type = pkg.type ?? "typescript";
          const formats = (pkg.formats ?? ["esm", "cjs"]).join(", ");
          console.log(
            `  ${chalk.cyan(pkg.name)} ${chalk.yellow(`v${version}`)}` +
              chalk.gray(` [${type}] [${formats}]`),
          );
          console.log(chalk.gray(`    root: ${root}`));
        }
      }

      console.log(chalk.bold("\n=== Families ==="));
      if (families.length === 0) {
        console.log(chalk.gray("  (none)"));
      } else {
        for (const family of families) {
          console.log(chalk.bold(`\n  Family: ${chalk.magenta(family.name)}`));
          for (const pkg of family.packages) {
            const root = resolvePath(configDir, pkg.root);
            let version = "?";
            try {
              const json = readSourcePackageJson(root, pkg.name);
              version = json.version;
            } catch {
              version = chalk.red("(package.json missing)");
            }
            const type = pkg.type ?? "typescript";
            const formats = (pkg.formats ?? ["esm", "cjs"]).join(", ");
            console.log(
              `    ${chalk.cyan(pkg.name)} ${chalk.yellow(`v${version}`)}` +
                chalk.gray(` [${type}] [${formats}]`),
            );
            console.log(chalk.gray(`      root: ${root}`));
          }
        }
      }

      console.log("");
    });
}
