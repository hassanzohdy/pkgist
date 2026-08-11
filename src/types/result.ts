/**
 * Per-phase release outcomes.
 *
 * Before 1.6.0 a package's fate was a single `success` boolean, and the git
 * step was deliberately excluded from it — a push could fail, warn inline, and
 * still leave `success: true`. The end-of-run summary is computed from these
 * results, so a failed push was invisible in the summary by construction. That
 * is how 16 repositories stayed unpushed for a day after a release.
 *
 * Recording an outcome per phase is what lets the summary name what actually
 * failed, and lets the exit code reflect it.
 */

/** A single stage of a package's release pipeline, in execution order. */
export type PhaseName =
  | "compile"
  | "commit"
  | "push"
  | "tag"
  | "publish"
  | "verify";

/**
 * The outcome of one phase.
 *
 * `unknown` is the COULD-NOT-ASK state and is deliberately distinct from
 * `failed`. `git ls-remote` prints nothing both when a ref is absent and when
 * the network is unreachable; collapsing those two into one answer is how a
 * sweep once reported "0 of 26 tags present" when the truth was "the network
 * was down". A phase we could not evaluate must never be reported as one that
 * evaluated cleanly, nor as one that definitively failed.
 */
export type PhaseStatus = "ok" | "skipped" | "failed" | "unknown";

export interface PhaseOutcome {
  phase: PhaseName;
  status: PhaseStatus;
  /** Why it was skipped, or how it failed. Shown verbatim in the summary. */
  detail?: string;
  /** Attempts made. Greater than 1 means a retry happened. */
  attempts?: number;
}

export interface BuildResult {
  packageName: string;
  version: string;
  buildPath: string;
  /** True only when no phase is `failed` or `unknown`. */
  success: boolean;
  error?: Error;
  /** Every phase that ran, was skipped, or could not be evaluated. */
  phases: PhaseOutcome[];
}

/** True when the phase list contains nothing that failed or could not be evaluated. */
export function phasesAreClean(phases: PhaseOutcome[]): boolean {
  return !phases.some(p => p.status === "failed" || p.status === "unknown");
}
