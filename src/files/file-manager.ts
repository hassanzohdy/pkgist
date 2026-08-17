import fs from "fs";
import path from "path";
import { resolvePath, joinPath } from "../utils/paths.js";
import { wrapError } from "../utils/errors.js";

/**
 * Ensure a directory exists, creating all intermediate directories as needed.
 */
export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw wrapError("ensure-dir", dir, err);
  }
}

/**
 * Copy a single file from src to dest.
 * Creates the destination directory if it does not exist.
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  try {
    fs.copyFileSync(src, dest);
  } catch (err) {
    throw wrapError("copy-file", src, err);
  }
}

/** Directories that are never copied in any directory tree operation. */
const COPY_EXCLUDES = new Set([".git", "node_modules", "dist", ".turbo", ".cache"]);

/**
 * Copy an entire directory tree recursively, skipping .git and node_modules.
 */
export function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (COPY_EXCLUDES.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const srcPath = joinPath(src, entry.name);
    const destPath = joinPath(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

/**
 * Read a file as a UTF-8 string, or throw a BundlerError with context.
 */
export function readFile(filePath: string, packageName = filePath): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw wrapError("read-file", packageName, err);
  }
}

/**
 * Write a UTF-8 string to a file, creating intermediate directories.
 */
export function writeFile(filePath: string, content: string, packageName = filePath): void {
  ensureDir(path.dirname(filePath));
  try {
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    throw wrapError("write-file", packageName, err);
  }
}

/**
 * Move all files matching a glob-like condition.
 * Actually does a rename — works only within the same filesystem volume.
 */
export function moveFile(src: string, dest: string, packageName = src): void {
  ensureDir(path.dirname(dest));
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    // rename across devices fails — fall back to copy+unlink
    try {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } catch (fallbackErr) {
      throw wrapError("move-file", packageName, fallbackErr);
    }
  }
}

/**
 * Check whether a path exists on the filesystem.
 */
export function pathExists(p: string): boolean {
  return fs.existsSync(p);
}

/**
 * List all file paths inside a directory (non-recursive).
 */
export function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => joinPath(dir, e.name));
}
