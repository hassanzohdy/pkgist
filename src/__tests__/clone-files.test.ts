import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneFiles } from "../files/clone-files";
import { joinPath, resolveWithinBase } from "../utils/paths";
import { logger } from "../utils/logger";

/**
 * The rule under test: `clone` entries are config-authored path segments, not
 * trusted absolute/relative paths — an entry containing `..` or an absolute
 * path must never be able to read or write outside `packageRoot` / `buildDir`.
 */

const tmpDirs: string[] = [];

function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(joinPath(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveWithinBase", () => {
  it("resolves an in-tree relative path", () => {
    const base = tmpDir("pkgist-base-");
    expect(resolveWithinBase(base, "README.md")).toBe(
      resolveWithinBase(base, "README.md"),
    );
    expect(resolveWithinBase(base, "nested/file.txt")).not.toBeNull();
  });

  it("rejects a '..' segment that escapes the base", () => {
    const base = tmpDir("pkgist-base-");
    expect(resolveWithinBase(base, "../outside")).toBeNull();
    expect(resolveWithinBase(base, "nested/../../outside")).toBeNull();
  });

  it("rejects an absolute path segment outside the base", () => {
    const base = tmpDir("pkgist-base-");
    const outside = path.resolve(os.tmpdir(), "pkgist-absolute-target");
    expect(resolveWithinBase(base, outside)).toBeNull();
  });
});

describe("cloneFiles — containment", () => {
  it("clones a normal in-tree entry from packageRoot to buildDir", () => {
    const packageRoot = tmpDir("pkgist-root-");
    const buildDir = tmpDir("pkgist-build-");
    fs.writeFileSync(joinPath(packageRoot, "README.md"), "hello");

    cloneFiles(packageRoot, buildDir, ["README.md"], "example", false);

    expect(fs.readFileSync(joinPath(buildDir, "README.md"), "utf-8")).toBe("hello");
  });

  it("clones a renamed tuple entry that stays in-tree", () => {
    const packageRoot = tmpDir("pkgist-root-");
    const buildDir = tmpDir("pkgist-build-");
    fs.writeFileSync(joinPath(packageRoot, "LICENSE"), "mit");

    cloneFiles(packageRoot, buildDir, [["LICENSE", "dist/LICENSE"]], "example", false);

    expect(fs.readFileSync(joinPath(buildDir, "dist/LICENSE"), "utf-8")).toBe("mit");
  });

  it("skips (does not read) a source entry that escapes packageRoot via '..'", () => {
    const packageRoot = tmpDir("pkgist-root-");
    const buildDir = tmpDir("pkgist-build-");
    const secretDir = tmpDir("pkgist-secret-");
    fs.writeFileSync(joinPath(secretDir, "secret.txt"), "top-secret");

    const relTraversal = path.relative(packageRoot, joinPath(secretDir, "secret.txt"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    cloneFiles(packageRoot, buildDir, [relTraversal], "example", false);

    expect(fs.existsSync(joinPath(buildDir, "secret.txt"))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("escapes its allowed directory"));

    warnSpy.mockRestore();
  });

  it("skips (does not write) a destination entry that escapes buildDir via '..'", () => {
    const packageRoot = tmpDir("pkgist-root-");
    const buildDir = tmpDir("pkgist-build-");
    const outsideDir = tmpDir("pkgist-outside-");
    fs.writeFileSync(joinPath(packageRoot, "README.md"), "hello");

    const relEscape = path.relative(buildDir, joinPath(outsideDir, "README.md"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    cloneFiles(packageRoot, buildDir, [["README.md", relEscape]], "example", false);

    expect(fs.existsSync(joinPath(outsideDir, "README.md"))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("escapes its allowed directory"));

    warnSpy.mockRestore();
  });

  it("skips an absolute-path destination entry", () => {
    const packageRoot = tmpDir("pkgist-root-");
    const buildDir = tmpDir("pkgist-build-");
    const outsideDir = tmpDir("pkgist-outside-");
    fs.writeFileSync(joinPath(packageRoot, "README.md"), "hello");
    const absoluteDest = joinPath(outsideDir, "README.md");

    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    cloneFiles(packageRoot, buildDir, [["README.md", absoluteDest]], "example", false);

    expect(fs.existsSync(absoluteDest)).toBe(false);

    warnSpy.mockRestore();
  });
});
