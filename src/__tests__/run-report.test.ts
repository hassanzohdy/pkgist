import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { narrowingNotes, reportRun } from "../report/run-report.js";
import type { BuildResult, PhaseOutcome } from "../types/result.js";

/**
 * The rule under test: the last line must describe the run that happened.
 *
 * Before 1.6.0 the summary was computed from a single `success` boolean that
 * the git step was deliberately excluded from, so a run in which 11 pushes
 * failed still ended on a success line and exited 0.
 */

let output: string[] = [];

beforeEach(() => {
  output = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const text = () => output.join("\n");

function result(name: string, phases: PhaseOutcome[]): BuildResult {
  return {
    packageName: name,
    version: "1.0.0",
    buildPath: `/builds/${name}`,
    success: !phases.some(p => p.status === "failed" || p.status === "unknown"),
    phases,
  };
}

const clean: PhaseOutcome[] = [
  { phase: "compile", status: "ok" },
  { phase: "commit", status: "ok" },
  { phase: "push", status: "ok" },
  { phase: "tag", status: "ok" },
  { phase: "publish", status: "ok" },
  { phase: "verify", status: "ok" },
];

const scope = { command: "build:family warlock", narrowed: [] as string[], dryRun: false };

describe("a fully clean run", () => {
  it("exits 0 and is the only case allowed to say 'successfully'", () => {
    const report = reportRun([result("a", clean), result("b", clean)], scope);

    expect(report.exitCode).toBe(0);
    expect(text()).toContain("successfully");
  });
});

describe("a failed phase", () => {
  it("names the package and the phase, and exits non-zero", () => {
    const broken = result("@warlock.js/cascade", [
      ...clean.slice(0, 4),
      { phase: "publish", status: "failed", detail: "ETIMEDOUT", attempts: 3 },
      { phase: "verify", status: "skipped", detail: "publish failed" },
    ]);

    const report = reportRun([result("a", clean), broken], scope);

    expect(report.exitCode).toBe(1);
    expect(text()).toContain("@warlock.js/cascade");
    expect(text()).toContain("npm publish");
    expect(text()).toContain("ETIMEDOUT");
  });

  it("never prints the word 'successfully' when anything failed", () => {
    const broken = result("x", [{ phase: "push", status: "failed", detail: "connection reset" }]);

    reportRun([broken], scope);

    expect(text()).not.toContain("successfully");
    expect(text()).toContain("INCOMPLETE");
  });

  it("a failed git push is visible in the summary", () => {
    // The exact regression: this used to be warned inline and then omitted
    // from the end-of-run report entirely.
    const pushed = result("create-warlock", [
      { phase: "compile", status: "ok" },
      { phase: "commit", status: "ok" },
      { phase: "push", status: "failed", detail: "Pushing to github.com:warlockjs/create-warlock.git" },
      { phase: "tag", status: "skipped", detail: "push failed" },
      { phase: "publish", status: "skipped", detail: "release commit is not on the remote" },
      { phase: "verify", status: "skipped", detail: "publish failed" },
    ]);

    const report = reportRun([pushed], scope);

    expect(report.exitCode).toBe(1);
    expect(text()).toContain("git push");
    expect(text()).toContain("create-warlock");
  });

  it("calls out a package published without its commit on the remote", () => {
    const orphan = result("create-warlock", [
      { phase: "compile", status: "ok" },
      { phase: "commit", status: "ok" },
      { phase: "push", status: "failed", detail: "connection closed" },
      { phase: "tag", status: "skipped", detail: "push failed" },
      { phase: "publish", status: "ok" },
      { phase: "verify", status: "ok" },
    ]);

    reportRun([orphan], scope);

    expect(text()).toContain("published to npm with its release commit NOT on the remote");
  });
});

describe("COULD-NOT-ASK is not success", () => {
  it("an unresolved phase exits non-zero and is counted separately from a failure", () => {
    const unresolved = result("x", [
      ...clean.slice(0, 5),
      { phase: "verify", status: "unknown", detail: "registry unreachable: ETIMEDOUT" },
    ]);

    const report = reportRun([unresolved], scope);

    expect(report.exitCode).toBe(1);
    expect(report.unresolved).toBe(1);
    expect(report.failed).toBe(0);
    expect(text()).toContain("UNRESOLVED");
    expect(text()).not.toContain("successfully");
  });
});

describe("a narrowed run says so in the final line", () => {
  it("discloses a dry run", () => {
    reportRun([result("a", clean)], { ...scope, dryRun: true });
    expect(text()).toContain("DRY RUN");
  });

  it("discloses skipped publishing in the line itself, not a footnote", () => {
    reportRun([result("a", clean)], {
      ...scope,
      narrowed: narrowingNotes({ noPublish: true, noGit: false, verifyPublish: true }),
    });

    const finalLine = output[output.length - 1];
    expect(finalLine).toContain("nothing was published");
  });

  it("discloses a partial package selection", () => {
    const notes = narrowingNotes({
      noPublish: false,
      noGit: false,
      verifyPublish: true,
      selected: 1,
      available: 26,
    });

    expect(notes.join(" ")).toContain("1 of 26");
  });

  it("says nothing when the run was not narrowed", () => {
    const notes = narrowingNotes({ noPublish: false, noGit: false, verifyPublish: true });
    expect(notes).toEqual([]);
  });

  it("discloses that publishes were not verified", () => {
    const notes = narrowingNotes({ noPublish: false, noGit: false, verifyPublish: false });
    expect(notes.join(" ")).toContain("not confirmed");
  });
});

describe("retry visibility", () => {
  it("reports when a step only succeeded after a retry", () => {
    const retried = result("a", [
      ...clean.slice(0, 4),
      { phase: "publish", status: "ok", attempts: 2 },
      { phase: "verify", status: "ok" },
    ]);

    reportRun([retried], scope);

    expect(text()).toContain("succeeded only after a retry");
  });
});
