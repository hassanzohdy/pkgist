import simpleGit, { SimpleGit } from "simple-git";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import type { PhaseOutcome } from "../types/result.js";

/**
 * Returns true if the given directory is inside a git repository.
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const git: SimpleGit = simpleGit(dir);
    const result = await git.checkIsRepo();
    return result;
  } catch {
    return false;
  }
}

/**
 * Resolve the current branch name in the given directory.
 * Falls back to "main" if the directory is not a git repo.
 */
export async function currentBranch(dir: string): Promise<string> {
  try {
    const git: SimpleGit = simpleGit(dir);
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    return branch.trim() || "main";
  } catch {
    return "main";
  }
}

/** Local HEAD sha, or undefined when it cannot be read. */
export async function localHeadSha(dir: string): Promise<string | undefined> {
  try {
    const git: SimpleGit = simpleGit(dir);
    return (await git.revparse(["HEAD"])).trim();
  } catch {
    return undefined;
  }
}

/**
 * Three-state answer about a ref on the remote.
 *
 * `git ls-remote` prints nothing both when a ref is absent and when the
 * network is unreachable, so a `grep -q` style check reports the second as the
 * first. Anything built on that conflation will confidently report a healthy
 * repository as missing its tag. The `unknown` arm exists to make that
 * impossible.
 */
export interface RemoteRefAnswer {
  state: "present" | "absent" | "unknown";
  sha?: string;
  detail?: string;
}

async function lsRemote(dir: string, ref: string): Promise<RemoteRefAnswer> {
  try {
    const git: SimpleGit = simpleGit(dir);
    const raw = await git.listRemote([ "origin", ref ]);
    const line = raw.split("\n").find(l => l.trim().length > 0);

    if (!line) return { state: "absent" };

    return { state: "present", sha: line.split(/\s+/)[0]?.trim() };
  } catch (err) {
    // Command failed — we learned nothing about the ref.
    const detail = (err instanceof Error ? err.message : String(err)).split("\n")[0];
    return { state: "unknown", detail };
  }
}

/** Does the remote branch already contain this exact commit? */
export async function remoteBranchSha(dir: string, branch: string): Promise<RemoteRefAnswer> {
  return lsRemote(dir, `refs/heads/${branch}`);
}

/** Does the remote already carry this tag, and at which commit? */
export async function remoteTagSha(dir: string, tag: string): Promise<RemoteRefAnswer> {
  const answer = await lsRemote(dir, `refs/tags/${tag}`);
  if (answer.state !== "present") return answer;

  // An annotated tag also publishes a `^{}` peeled entry pointing at the
  // commit. Prefer that one — comparing against the tag object's own sha would
  // never match HEAD.
  try {
    const git: SimpleGit = simpleGit(dir);
    const raw = await git.listRemote(["origin", `refs/tags/${tag}^{}`]);
    const peeled = raw.split("\n").find(l => l.trim().length > 0);
    if (peeled) return { state: "present", sha: peeled.split(/\s+/)[0]?.trim() };
  } catch {
    // Fall through to the unpeeled sha — good enough for a presence check.
  }

  return answer;
}

export interface GitReleaseInput {
  packageRoot: string;
  packageName: string;
  version: string;
  commitMessage: string;
  branch: string;
  dryRun: boolean;
  attempts: number;
}

export interface GitReleaseResult {
  phases: PhaseOutcome[];
  /**
   * True only when the release commit is verifiably on the remote — the gate
   * for whether this package may be published. `false` for a genuine push
   * failure AND for a push whose outcome we could not determine.
   */
  commitIsOnRemote: boolean;
}

/**
 * Commit, push, tag, and push the tag — as four separately-reported phases.
 *
 * Ordering is deliberate and load-bearing: **push before publish, and tag only
 * after the push landed.** Tagging a commit whose push failed produces a tag
 * pointing at something nobody else can see.
 *
 * Every step is check-then-act against real remote state, so re-running a
 * partially-completed release skips what is already done instead of creating
 * fresh half-states.
 */
export async function gitRelease(input: GitReleaseInput): Promise<GitReleaseResult> {
  const { packageRoot, packageName, version, commitMessage, branch, dryRun, attempts } = input;
  const tag = `v${version}`;
  const phases: PhaseOutcome[] = [];

  const isRepo = await isGitRepo(packageRoot);
  if (!isRepo) {
    // A package with no repository is a supported configuration — it must
    // still publish. This is a genuine skip, not a failure, and it is the case
    // the old blanket "git is non-fatal" catch was really protecting.
    const detail = "not a git repository";
    phases.push(
      { phase: "commit", status: "skipped", detail },
      { phase: "push", status: "skipped", detail },
      { phase: "tag", status: "skipped", detail },
    );
    logger.warn(`[git] ${packageName}: ${detail} — skipping git, publish still allowed`);
    return { phases, commitIsOnRemote: true };
  }

  logger.step(`[git] ${packageName}: commit "${commitMessage}", push to ${branch}, tag ${tag}`);

  if (dryRun) {
    logger.info(`[dry-run] git add + commit "${commitMessage}" + push ${branch} + tag ${tag}`);
    phases.push(
      { phase: "commit", status: "skipped", detail: "dry run" },
      { phase: "push", status: "skipped", detail: "dry run" },
      { phase: "tag", status: "skipped", detail: "dry run" },
    );
    return { phases, commitIsOnRemote: true };
  }

  const git: SimpleGit = simpleGit(packageRoot);

  // ---- commit -------------------------------------------------------------
  try {
    const status = await git.status();
    if (status.files.length === 0) {
      phases.push({ phase: "commit", status: "skipped", detail: "nothing to commit" });
      logger.debug(`[git] ${packageName}: working tree clean — nothing to commit`);
    } else {
      await git.add("-A");
      await git.commit(commitMessage);
      phases.push({ phase: "commit", status: "ok" });
    }
  } catch (err) {
    const detail = firstLine(err);
    phases.push({ phase: "commit", status: "failed", detail });
    phases.push({ phase: "push", status: "skipped", detail: "commit failed" });
    phases.push({ phase: "tag", status: "skipped", detail: "commit failed" });
    logger.error(`[git] ${packageName}: commit failed — ${detail}`);
    return { phases, commitIsOnRemote: false };
  }

  const head = await localHeadSha(packageRoot);

  // ---- push ---------------------------------------------------------------
  const alreadyPushed = await remoteBranchSha(packageRoot, branch);
  let commitIsOnRemote = false;

  if (alreadyPushed.state === "present" && head && alreadyPushed.sha === head) {
    phases.push({ phase: "push", status: "skipped", detail: "already on remote" });
    commitIsOnRemote = true;
    logger.debug(`[git] ${packageName}: ${branch} already at ${head.slice(0, 8)} — skipping push`);
  } else {
    try {
      const { attempts: used } = await withRetry(() => git.push("origin", branch), {
        attempts,
        label: "push",
        packageName,
      });
      phases.push({ phase: "push", status: "ok", attempts: used });
      commitIsOnRemote = true;
    } catch (err) {
      const detail = firstLine(err);
      phases.push({ phase: "push", status: "failed", detail, attempts });
      phases.push({
        phase: "tag",
        status: "skipped",
        detail: "push failed — refusing to tag a commit that is not on the remote",
      });
      logger.error(`[git] ${packageName}: push failed after ${attempts} attempt(s) — ${detail}`);
      return { phases, commitIsOnRemote: false };
    }
  }

  // ---- tag ----------------------------------------------------------------
  const existingTag = await remoteTagSha(packageRoot, tag);

  if (existingTag.state === "unknown") {
    // We could not ask whether the tag exists. Pushing blind risks failing on a
    // tag that is already there; claiming success risks reporting a tag we
    // never created. Say so instead.
    phases.push({
      phase: "tag",
      status: "unknown",
      detail: `could not read remote tags: ${existingTag.detail ?? "unknown error"}`,
    });
    logger.warn(`[git] ${packageName}: could not determine whether ${tag} exists on the remote`);
    return { phases, commitIsOnRemote };
  }

  if (existingTag.state === "present") {
    const matches = head && existingTag.sha === head;
    phases.push({
      phase: "tag",
      status: matches ? "skipped" : "failed",
      detail: matches
        ? "already on remote"
        : `remote ${tag} points at ${existingTag.sha?.slice(0, 8)}, not the release commit`,
    });
    if (!matches) {
      logger.error(`[git] ${packageName}: ${tag} already exists on the remote at a different commit`);
    }
    return { phases, commitIsOnRemote };
  }

  try {
    await git.addTag(tag);
    const { attempts: used } = await withRetry(() => git.push("origin", tag), {
      attempts,
      label: `push tag ${tag}`,
      packageName,
    });
    phases.push({ phase: "tag", status: "ok", attempts: used });
    logger.success(`[git] ${packageName}: pushed ${branch}, tagged ${tag}`);
  } catch (err) {
    const detail = firstLine(err);
    phases.push({ phase: "tag", status: "failed", detail, attempts });
    logger.error(`[git] ${packageName}: tagging ${tag} failed — ${detail}`);
  }

  return { phases, commitIsOnRemote };
}

function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0]?.trim() ?? message;
}
