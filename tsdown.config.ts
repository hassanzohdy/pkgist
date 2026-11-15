import { defineConfig } from "tsdown";

export default defineConfig([
  // Library entry
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    shims: true,
    target: "node18",
    platform: "node",
    outDir: "dist",
    // package.json points at dist/index.js and dist/index.d.ts.
    fixedExtension: false,
  },
  // CLI entry — the shebang comes from the first line of src/cli.ts
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    shims: true,
    target: "node18",
    platform: "node",
    outDir: "dist",
    fixedExtension: false,
  },
]);
