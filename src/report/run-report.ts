import chalk from "chalk";
import type { BuildResult, PhaseOutcome } from "../types/result.js";

/**
 * The end-of-run report.
 *
 * A summary already existed before 1.6.0; the problem was what fed it. It read
 * a single `success` boolean that the git step was deliberately excluded from,
 * so a run in which 16 pushes failed still ended on a success line. Everything
 * here follows from one rule: **the last line must describe the run that
 * happened, not the run that was attempted.**
 */

export interface RunScope {
  /** e.g. "build", "build:family atom", "build:all" */
  command: string;
  /**
   * Ways this run was narrower than a full release — each becomes part of the
   * final line, not a footnote. A shortened run that ends in the same words as
   * a complete one will be quoted as a complete one.
   */
  narrowed: string[];
  dryRun: boolean;
}

export interface RunReport {
  exitCode: number;
  clean: number;
  failed: number;
  unresolved: number;
}

const PHASE_LABEL: Record<string, string> = {
  compile: "compile",
  commit: "git commit",
  push: "git push",
  tag: "git tag",
  publish: "npm publish",
  verify: "registry verify",
};

function problems(result: BuildResult): PhaseOutcome[] {
  return result.phases.filter(p => p.status === "failed" || p.status === "unknown");
}

/**
 * Print the report and return the process exit code.
 *
 * Returns non-zero when anything failed OR could not be determined. An
 * unresolved phase is not a success: a tool that could not reach the registry
 * must say so rather than implying the package is fine.
 */
export function reportRun(results: BuildResult[], scope: RunScope): RunReport {
  const failedResults = results.filter(r => problems(r).length > 0);
  const unresolved = results.filter(r =>
    problems(r).every(p => p.status === "unknown") && problems(r).length > 0,
  ).length;
  const hardFailed = failedResults.length - unresolved;
  const clean = results.length - failedResults.length;

  if (failedResults.length > 0) {
    console.log("");
    console.log(chalk.red.bold("Release problems"));

    for (const result of failedResults) {
      const version = result.version ? `@${result.version}` : "";
      console.log(chalk.red(`  ${result.packageName}${version}`));

      for (const phase of problems(result)) {
        const marker = phase.status === "failed" ? chalk.red("FAILED ") : chalk.yellow("UNKNOWN");
        const attempts =
          phase.attempts && phase.attempts > 1 ? chalk.gray(` (${phase.attempts} attempts)`) : "";
        const label = (PHASE_LABEL[phase.phase] ?? phase.phase).padEnd(16);
        console.log(`    ${marker} ${label}${phase.detail ?? ""}${attempts}`);
      }

      // A published package whose commit never reached the remote is the
      // specific outcome worth naming: the artifact exists and its source does
      // not. Callers cannot reproduce it from the tag history.
      const published = result.phases.find(p => p.phase === "publish")?.status === "ok";
      const pushOk = ["ok", "skipped"].includes(
        result.phases.find(p => p.phase === "push")?.status ?? "",
      );
      if (published && !pushOk) {
        console.log(
          chalk.red.bold(`    ⚠ published to npm with its release commit NOT on the remote`),
        );
      }
    }
    console.log("");
  }

  const retried = results.flatMap(r => r.phases).filter(p => (p.attempts ?? 1) > 1).length;
  if (retried > 0) {
    console.log(chalk.gray(`  ${retried} step(s) succeeded only after a retry.`));
  }

  const scopeNote = describeScope(scope);
  const exitCode = failedResults.length > 0 ? 1 : 0;

  if (failedResults.length === 0) {
    // The only path that may use the word "successfully".
    console.log(
      chalk.green(
        `${scope.command}: all ${clean} package(s) completed successfully${scopeNote}`,
      ),
    );
  } else {
    const parts: string[] = [];
    if (clean > 0) parts.push(`${clean} completed`);
    if (hardFailed > 0) parts.push(`${hardFailed} FAILED`);
    if (unresolved > 0) parts.push(`${unresolved} UNRESOLVED`);

    console.log(
      chalk.red.bold(
        `${scope.command}: release INCOMPLETE — ${parts.join(", ")} of ${results.length}${scopeNote}`,
      ),
    );
  }

  return { exitCode, clean, failed: hardFailed, unresolved };
}

/**
 * Render a family outcome.
 *
 * In a lockstep family "25 of 26 published" is not 96% of a release — siblings
 * are pinned to exact versions, so one missing member can make every other
 * member uninstallable. The fraction invites the reader to think most of it
 * landed. It didn't.
 */
export function reportFamily(familyName: string, results: BuildResult[]): void {
  const broken = results.filter(r => problems(r).length > 0);
  if (broken.length === 0) return;

  console.log("");
  console.log(
    chalk.red.bold(
      `Family "${familyName}" is BROKEN — ${broken.length} of ${results.length} member(s) did not complete.`,
    ),
  );
  console.log(
    chalk.red(
      `  Members are pinned to each other at exact versions, so this is not a partial release.`,
    ),
  );
  console.log(chalk.red(`  Affected: ${broken.map(r => r.packageName).join(", ")}`));
  console.log("");
}

function describeScope(scope: RunScope): string {
  const notes = [...scope.narrowed];
  if (scope.dryRun) notes.unshift("DRY RUN — nothing was written, pushed, or published");

  return notes.length > 0 ? chalk.yellow(` [${notes.join("; ")}]`) : "";
}

/**
 * Build the `narrowed` list from the flags a command was given.
 *
 * Kept in one place so every command discloses a shortened run the same way.
 */
export function narrowingNotes(options: {
  noPublish: boolean;
  noGit: boolean;
  verifyPublish: boolean;
  selected?: number;
  available?: number;
}): string[] {
  const notes: string[] = [];

  if (options.noPublish) notes.push("--no-publish: nothing was published");
  if (options.noGit) notes.push("--no-git: nothing was committed, pushed, or tagged");
  if (!options.verifyPublish) notes.push("--no-verify-publish: publishes were not confirmed");
  if (
    options.selected !== undefined &&
    options.available !== undefined &&
    options.selected < options.available
  ) {
    notes.push(`partial: ${options.selected} of ${options.available} package(s) targeted`);
  }

  return notes;
}
