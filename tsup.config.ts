import { defineConfig } from "tsup";

export default defineConfig([
  // Library entry
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    shims: true,
    target: "node18",
    outDir: "dist",
    esbuildOptions(options) {
      options.platform = "node";
    },
  },
  // CLI entry — the shebang comes from the first line of src/cli.ts
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    shims: true,
    target: "node18",
    outDir: "dist",
    esbuildOptions(options) {
      options.platform = "node";
    },
  },
]);
