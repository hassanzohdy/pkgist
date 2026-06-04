import pLimit from "p-limit";
import type { BuildResult } from "./package-builder.js";
import { logger } from "../utils/logger.js";

/**
 * Run an array of async build tasks with a concurrency cap.
 * Each task is a zero-argument function that returns a Promise<BuildResult>.
 */
export async function runParallel(
  tasks: (() => Promise<BuildResult>)[],
  concurrency: number,
): Promise<BuildResult[]> {
  if (tasks.length === 0) return [];

  const limit = pLimit(Math.max(1, concurrency));

  logger.info(`Running ${tasks.length} task(s) with concurrency=${concurrency}`);

  const results = await Promise.all(
    tasks.map((task) => limit(task)),
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (failed > 0) {
    logger.warn(`${succeeded} succeeded, ${failed} failed`);
    for (const r of results.filter((r) => !r.success)) {
      logger.error(`  FAILED: ${r.packageName} — ${r.error?.message ?? "unknown error"}`);
    }
  } else {
    logger.success(`All ${succeeded} package(s) built successfully`);
  }

  return results;
}
