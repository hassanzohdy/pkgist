import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs";
import path from "path";
import { joinPath } from "../utils/paths.js";
import { wrapError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

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
 * Perform git operations for a package after a successful build:
 * 1. git add -A (in the package root)
 * 2. git commit -m <message>
 * 3. git push origin <branch>
 * 4. git tag v<version>
 * 5. git push origin <tag>
 */
export async function gitCommitTagPush(
  packageRoot: string,
  packageName: string,
  version: string,
  commitMessage: string,
  branch: string,
  dryRun: boolean,
): Promise<void> {
  const isRepo = await isGitRepo(packageRoot);
  if (!isRepo) {
    logger.warn(`[git] ${packageName}: directory is not a git repo — skipping git operations`);
    return;
  }

  const tag = `v${version}`;
  logger.step(`[git] ${packageName}: commit "${commitMessage}", tag ${tag}, push to ${branch}`);

  if (dryRun) {
    logger.info(`[dry-run] git add + commit "${commitMessage}" + tag ${tag} + push`);
    return;
  }

  const git: SimpleGit = simpleGit(packageRoot);

  try {
    // Stage all changes
    await git.add("-A");

    // Commit
    await git.commit(commitMessage);

    // Push to remote
    await git.push("origin", branch);

    // Tag
    await git.addTag(tag);

    // Push tags
    await git.pushTags("origin");

    logger.success(`[git] ${packageName}: pushed ${branch}, tagged ${tag}`);
  } catch (err) {
    throw wrapError("git-operations", packageName, err);
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
