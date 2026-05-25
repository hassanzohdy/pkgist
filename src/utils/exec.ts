import { execa } from "execa";
import { wrapError } from "./errors.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a shell command and return stdout/stderr.
 * Throws a BundlerError on non-zero exit.
 */
export async function exec(
  step: string,
  packageName: string,
  command: string,
  args: string[],
  cwd?: string,
): Promise<ExecResult> {
  try {
    const result = await execa(command, args, {
      cwd,
      all: true,
      reject: false,
    });
    if (result.exitCode !== 0) {
      const combined = result.all ?? result.stderr ?? "";
      throw new Error(
        `Command "${command} ${args.join(" ")}" exited with code ${result.exitCode}.\n${combined}`,
      );
    }
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode,
    };
  } catch (err) {
    throw wrapError(step, packageName, err);
  }
}

/**
 * Run a command and ignore its output.  Does NOT throw on non-zero exit.
 * Useful for optional operations (e.g. `git tag -d`).
 */
export async function execSilent(
  command: string,
  args: string[],
  cwd?: string,
): Promise<number> {
  try {
    const result = await execa(command, args, { cwd, reject: false });
    return result.exitCode ?? 0;
  } catch {
    return 1;
  }
}
