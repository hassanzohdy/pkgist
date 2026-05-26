import { exec } from "../utils/exec.js";
import { logger } from "../utils/logger.js";
import type { PackageBase } from "../types/index.js";

/**
 * Run `npm publish` from the build output directory.
 */
export async function publishPackage(
  pkg: PackageBase,
  buildPath: string,
  dryRun: boolean,
): Promise<void> {
  if (pkg.publish === false) {
    logger.info(`[publish] ${pkg.name}: publish=false, skipping`);
    return;
  }

  const access = pkg.access ?? "public";

  if (dryRun) {
    logger.info(`[dry-run] npm publish --access ${access} from ${buildPath}`);
    return;
  }

  logger.step(`Publishing ${pkg.name}@... to npm (access: ${access})`);

  await exec(
    "npm-publish",
    pkg.name,
    "npm",
    ["publish", "--access", access, "--registry", "https://registry.npmjs.org"],
    buildPath,
  );

  logger.success(`Published ${pkg.name}`);
}
