import fs from "fs";
import { copyFile, copyDir, pathExists } from "./file-manager.js";
import { joinPath } from "../utils/paths.js";
import { logger } from "../utils/logger.js";

/**
 * Clone extra files (README, license, etc.) from the package root into the build directory.
 *
 * Each entry in the `clone` array can be:
 *  - a plain string: copied from `<packageRoot>/<str>` to `<buildDir>/<str>`
 *  - a tuple [src, dest]: copied from `<packageRoot>/<src>` to `<buildDir>/<dest>`
 */
export function cloneFiles(
  packageRoot: string,
  buildDir: string,
  cloneList: (string | [string, string])[],
  packageName: string,
  dryRun: boolean,
): void {
  for (const entry of cloneList) {
    const [srcRel, destRel] =
      typeof entry === "string" ? [entry, entry] : entry;

    const src = joinPath(packageRoot, srcRel);
    const dest = joinPath(buildDir, destRel);

    if (!pathExists(src)) {
      logger.warn(`[clone-files] ${packageName}: source file not found, skipping — ${src}`);
      continue;
    }

    if (dryRun) {
      logger.info(`[dry-run] clone ${src} → ${dest}`);
      continue;
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFile(src, dest);
    }
    logger.debug(`Cloned ${src} → ${dest}`);
  }
}
