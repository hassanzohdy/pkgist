#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import {
  registerBuildCommand,
  registerBuildFamilyCommand,
  registerBuildAllCommand,
  registerListCommand,
  registerValidateCommand,
  registerInitCommand,
} from "./commands/index.js";
import { setVerbose } from "./utils/logger.js";

// Resolve package.json version without importing it (works with ESM)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cliVersion = "1.0.0";
try {
  const pkgPath = path.resolve(__dirname, "../package.json");
  const raw = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as { version?: string };
  cliVersion = pkg.version ?? "1.0.0";
} catch {
  // fallback to hardcoded version
}

const program = new Command();

program
  .name("pkgist")
  .description("Build, version, and publish TypeScript npm packages using tsdown.")
  .version(cliVersion)
  .option("--verbose", "Enable verbose debug logging", false)
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as { verbose?: boolean };
    if (opts.verbose) {
      setVerbose(true);
    }
  });

// Register all subcommands
registerInitCommand(program);
registerBuildCommand(program);
registerBuildFamilyCommand(program);
registerBuildAllCommand(program);
registerListCommand(program);
registerValidateCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
