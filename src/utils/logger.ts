import chalk from "chalk";

export type LogLevel = "info" | "success" | "warn" | "error" | "debug" | "step";

let _verbose = false;

export function setVerbose(v: boolean): void {
  _verbose = v;
}

export function log(level: LogLevel, message: string): void {
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  switch (level) {
    case "info":
      console.log(chalk.cyan(`[${ts}] INFO  ${message}`));
      break;
    case "success":
      console.log(chalk.green(`[${ts}] OK    ${message}`));
      break;
    case "warn":
      console.warn(chalk.yellow(`[${ts}] WARN  ${message}`));
      break;
    case "error":
      console.error(chalk.red(`[${ts}] ERROR ${message}`));
      break;
    case "step":
      console.log(chalk.blueBright(`[${ts}] STEP  ${message}`));
      break;
    case "debug":
      if (_verbose) {
        console.log(chalk.gray(`[${ts}] DEBUG ${message}`));
      }
      break;
  }
}

export const logger = {
  info: (msg: string) => log("info", msg),
  success: (msg: string) => log("success", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
  step: (msg: string) => log("step", msg),
  debug: (msg: string) => log("debug", msg),
};
