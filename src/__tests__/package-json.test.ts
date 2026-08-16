import fs from "fs";
import os from "os";
import { afterEach, describe, expect, it } from "vitest";
import { DROPPED_FIELDS, writeBuildPackageJson } from "../files/package-json";
import { joinPath } from "../utils/paths";
import type { PackageBase } from "../types/index";
import type { SourcePackageJson } from "../files/package-json";

/**
 * The rule under test: the published package.json is source-first.
 *
 * Before 1.6.3 it was built from a 13-field allow-list (KEPT_FIELDS), so any
 * field npm invented after that list was written — peerDependenciesMeta,
 * optionalDependencies, publishConfig, os, cpu, imports, funding — vanished
 * from every published manifest without a warning. Optional peers therefore
 * published as required, breaking pnpm-strict and Yarn PnP consumers.
 */

const tmpDirs: string[] = [];

function tmpBuildPath(): string {
  const dir = fs.mkdtempSync(joinPath(os.tmpdir(), "pkgist-pkgjson-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function readBuiltPackageJson(buildPath: string): Record<string, unknown> {
  const raw = fs.readFileSync(joinPath(buildPath, "package.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const pkg: PackageBase = {
  name: "@mongez/example",
  root: "example",
};

function baseSourceJson(overrides: Partial<SourcePackageJson> = {}): SourcePackageJson {
  return {
    name: "example",
    version: "1.0.0",
    description: "An example package",
    dependencies: { chalk: "^5.0.0" },
    peerDependencies: { react: "^18.0.0" },
    peerDependenciesMeta: { react: { optional: true } },
    optionalDependencies: { fsevents: "^2.0.0" },
    publishConfig: { access: "public", tag: "next" },
    os: ["darwin", "linux"],
    cpu: ["x64", "arm64"],
    imports: { "#internal/*": "./src/internal/*.js" },
    funding: "https://github.com/sponsors/example",
    contributors: ["Jane Doe"],
    scripts: { build: "tsup" },
    devDependencies: { typescript: "^5.0.0" },
    private: true,
    workspaces: ["packages/*"],
    files: ["src"],
    typings: "./src/index.ts",
    ...overrides,
  } as SourcePackageJson;
}

describe("fields that must survive publish (previously dropped by the allow-list)", () => {
  it("round-trips peerDependenciesMeta intact — the regression this fix exists for", () => {
    const buildPath = tmpBuildPath();
    writeBuildPackageJson(pkg, baseSourceJson(), buildPath, "1.0.1");

    const output = readBuiltPackageJson(buildPath);
    expect(output.peerDependenciesMeta).toEqual({ react: { optional: true } });
  });

  it("carries optionalDependencies, publishConfig, os, cpu, imports, funding, contributors", () => {
    const buildPath = tmpBuildPath();
    writeBuildPackageJson(pkg, baseSourceJson(), buildPath, "1.0.1");

    const output = readBuiltPackageJson(buildPath);
    expect(output.optionalDependencies).toEqual({ fsevents: "^2.0.0" });
    expect(output.publishConfig).toEqual({ access: "public", tag: "next" });
    expect(output.os).toEqual(["darwin", "linux"]);
    expect(output.cpu).toEqual(["x64", "arm64"]);
    expect(output.imports).toEqual({ "#internal/*": "./src/internal/*.js" });
    expect(output.funding).toBe("https://github.com/sponsors/example");
    expect(output.contributors).toEqual(["Jane Doe"]);
  });
});

describe("fields that must still be stripped", () => {
  it("drops dev-time, monorepo-only, and output-breaking fields", () => {
    const buildPath = tmpBuildPath();
    writeBuildPackageJson(pkg, baseSourceJson(), buildPath, "1.0.1");

    const output = readBuiltPackageJson(buildPath);
    for (const field of ["scripts", "devDependencies", "private", "workspaces", "files"]) {
      expect(output).not.toHaveProperty(field);
    }
  });
});

describe("computed fields win over source values", () => {
  it("main/module/types/exports come from the build config, not the source", () => {
    const buildPath = tmpBuildPath();
    writeBuildPackageJson(pkg, baseSourceJson(), buildPath, "1.0.1");

    const output = readBuiltPackageJson(buildPath);
    expect(output.main).toBe("./cjs/index.cjs");
    expect(output.module).toBe("./esm/index.mjs");
    expect(output.types).toBe("./esm/index.d.mts");
    expect(output.exports).toBeTruthy();
  });

  it("does not leak the source's typings field", () => {
    const buildPath = tmpBuildPath();
    writeBuildPackageJson(pkg, baseSourceJson(), buildPath, "1.0.1");

    const output = readBuiltPackageJson(buildPath);
    expect(output).not.toHaveProperty("typings");
  });
});

describe("family version pinning", () => {
  it("pins only intra-family specs and never mutates the source object", () => {
    const buildPath = tmpBuildPath();
    const sourceJson = baseSourceJson({
      dependencies: { chalk: "^5.0.0", "@mongez/sibling": "*" },
      peerDependencies: { react: "^18.0.0" },
    });
    const snapshotDeps = { ...sourceJson.dependencies };

    writeBuildPackageJson(
      pkg,
      sourceJson,
      buildPath,
      "1.0.1",
      new Set(["@mongez/sibling"]),
    );

    const output = readBuiltPackageJson(buildPath);
    expect(output.dependencies).toEqual({
      chalk: "^5.0.0",
      "@mongez/sibling": "1.0.1",
    });
    // sourceJson itself must be untouched — the source keeps "*" for workspace linking.
    expect(sourceJson.dependencies).toEqual(snapshotDeps);
  });
});

describe("self-policing: no field can go missing silently", () => {
  it("every source key is either in the output or explicitly denied", () => {
    const buildPath = tmpBuildPath();
    const sourceJson = baseSourceJson();
    writeBuildPackageJson(pkg, sourceJson, buildPath, "1.0.1");

    const output = readBuiltPackageJson(buildPath);
    for (const key of Object.keys(sourceJson)) {
      const accountedFor = key in output || DROPPED_FIELDS.has(key);
      expect(accountedFor, `"${key}" is neither in the output nor in DROPPED_FIELDS`).toBe(true);
    }
  });
});
