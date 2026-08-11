import pLimit from "p-limit";
import { logger } from "../utils/logger.js";
import type { BuildResult } from "../types/result.js";

/**
 * Run an array of async build tasks with a concurrency cap.
 * Each task is a zero-argument function that returns a Promise<BuildResult>.
 *
 * This used to print the end-of-run summary as a side effect. It no longer
 * does: the summary now lives in `report/run-report.ts`, because a runner that
 * only sees a boolean per task cannot name which phase failed, and because
 * `build:all` calls this several times and would otherwise print several
 * "all good" lines for one release.
 */
export async function runParallel(
  tasks: (() => Promise<BuildResult>)[],
  concurrency: number,
): Promise<BuildResult[]> {
  if (tasks.length === 0) return [];

  const limit = pLimit(Math.max(1, concurrency));

  logger.info(`Running ${tasks.length} task(s) with concurrency=${concurrency}`);

  return Promise.all(tasks.map(task => limit(task)));
}
