<div align="center">

# @mongez/pkgist

**Build, version, and publish your TypeScript/React npm packages from one typed config — dual ESM+CJS output via [tsdown](https://tsdown.dev), independent or family-synchronized versioning, automatic git tag + push, and npm publish, all in parallel.**

[![npm](https://img.shields.io/npm/v/@mongez/pkgist.svg)](https://www.npmjs.com/package/@mongez/pkgist)
[![license](https://img.shields.io/npm/l/@mongez/pkgist.svg)](LICENSE)
[![downloads](https://img.shields.io/npm/dw/@mongez/pkgist.svg)](https://www.npmjs.com/package/@mongez/pkgist)
[![build](https://github.com/hassanzohdy/pkgist/actions/workflows/build.yml/badge.svg)](https://github.com/hassanzohdy/pkgist/actions/workflows/build.yml)

</div>

---

## Why pkgist?

Shipping a TypeScript package to npm is a chore of glue: pick the next version, compile to ESM **and** CJS, write the `exports` map by hand, copy the README and LICENSE into the publish folder, bump `package.json`, commit, tag `v1.2.3`, push, then finally `npm publish`. Doing it for **many** packages in a monorepo multiplies the busywork — and the moment two packages must release together on the same version, ad-hoc scripts fall over.

`pkgist` collapses all of that into one typed config file and one command. You describe your packages once; it resolves the next version, compiles with tsdown (Rust-based Rolldown — fast, dual-format, correct `.d.ts`), clones your docs into the build, commits and tags per repo, and publishes — every package in parallel. Group packages into a **family** and they share one synchronized version, with their cross-references pinned to that exact version on publish.

```sh
npm install -D @mongez/pkgist
npx pkgist init          # scaffold pkgist.config.ts
npx pkgist build:all     # bump → compile → commit → tag → publish, in parallel
```

---

## Features

| Feature | What you get |
|---|---|
| **One typed config** | A single `pkgist.config.ts` with full type-safety via `defineConfig`. `pkgist init` scaffolds it. |
| **tsdown engine** | Rust-based Rolldown — fast builds, dual **ESM + CJS**, per-format `.d.ts`, sub-path entries. |
| **Two versioning modes** | `standalone[]` packages version independently; `families[]` share one synchronized version. |
| **Intra-family dep pinning** | Sibling deps written as `"*"` in source are pinned to the exact shared version in the **published** `package.json`. |
| **Auto git** | `add -A → commit → push → tag v<version> → push --tags`, per repo, with a `commit: true` shorthand. |
| **npm publish** | Publishes the clean build directory — not your source — with configurable `--access`. |
| **Asset cloning** | Copy `README.md`, `LICENSE`, `skills/`, `llms.txt`, or any file/dir into the build. |
| **Source snapshots** | Optionally archive a clean copy of each package before building. |
| **Dry-run** | `--dry-run` prints every step without touching disk, git, or npm. |
| **Parallel** | Builds many packages concurrently, up to a configurable limit. |

---

## Installation

```sh
npm install -D @mongez/pkgist
```

```sh
yarn add -D @mongez/pkgist
```

```sh
pnpm add -D @mongez/pkgist
```

Prefer the dev-dependency install — it pins the tool version per repo. A global install (`npm i -g @mongez/pkgist`) also works when you want one `pkgist` binary across projects. Runs on Node 18+.

---

## Quick start

**1. Scaffold a config.** From your project root:

```sh
npx pkgist init
```

This writes a starter `pkgist.config.ts` (it never overwrites an existing one — pass `--force` if you mean to):

```ts
import { defineConfig } from "@mongez/pkgist";

export default defineConfig({
  settings: {
    buildDir: "./builds",     // where compiled packages are written
    sourcesDir: "./sources",  // optional source snapshots
  },
  standalone: [
    {
      name: "@my-scope/utils",
      root: "./packages/utils",
      commit: true,            // auto-commit "Released <version>" + tag
      clone: ["README.md", "LICENSE"],
    },
  ],
});
```

**2. Point it at your packages**, then sanity-check:

```sh
npx pkgist validate    # config parses + every package root exists
npx pkgist list        # registered packages with current versions
```

**3. Preview, then release:**

```sh
npx pkgist build:all --dry-run    # every step, nothing written
npx pkgist build:all              # the real thing
```

That's the whole loop. Add a convenience script:

```json
{
  "scripts": {
    "release":     "pkgist build:all",
    "release:dry": "pkgist build:all --dry-run"
  }
}
```

---

## Configuration

pkgist auto-discovers **`pkgist.config.ts`** (then `pkgist.config.js`) in the current directory — one config name, no aliases. `.ts` configs are loaded through `tsx`, so you can use `import` freely. Override the location with `--config <path>`.

```ts
import { defineConfig } from "@mongez/pkgist";

export default defineConfig({
  settings: { /* ... */ },
  standalone: [ /* ... */ ],
  families: [ /* ... */ ],
});
```

`defineConfig` is a type-safety helper — pass it your config and TypeScript infers everything. You can also `export default { ... }` directly and lose autocomplete.

### `settings`

| Field | Type | Default | Description |
|---|---|---|---|
| `buildDir` | `string` | **required** | Where compiled packages are written, relative to the config file. |
| `concurrency` | `number` | `4` | Max parallel package builds. Override per-run with `--concurrency <n>`. |
| `sourcesDir` | `string` | — | Optional. Archive a source snapshot per build (excludes `.git`, `node_modules`, `dist`, `.turbo`, `.cache`). Omit to skip. |

### `standalone[]` vs `families[]`

- **`standalone[]`** — each package has its own version lifecycle. One entry = one independent npm package.
- **`families[]`** — a group that always releases together on a single synchronized version (e.g. a framework-agnostic core + its adapters). The family picks the **highest** current version across its members, bumps that, and lands everyone on it.

```ts
families: [
  {
    name: "state",            // -> pkgist build:family state
    version: "patch",         // strategy for the whole group
    commit: true,             // one commit shape for every member
    packages: [
      { name: "@my-scope/state-core",  root: "./packages/state-core" },
      { name: "@my-scope/react-state", root: "./packages/react-state", type: "react" },
    ],
  },
]
```

> Share constants across entries — the config is just TypeScript:
> ```ts
> const CLONE = ["README.md", "LICENSE", "skills", "llms.txt", "llms-full.txt"];
> // ...then `clone: CLONE` on every package.
> ```

---

## Package options

Every entry in `standalone[]` and `families[].packages[]` accepts these fields. Family members use the same fields **except** `version` (which is family-level only).

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | **required** | npm package name. |
| `root` | `string` | **required** | Path to the package root, relative to the config file. |
| `type` | `"typescript" \| "react"` | `"typescript"` | React packages get JSX/TSX transform. |
| `formats` | `("esm" \| "cjs")[]` | `["esm","cjs"]` | Output formats to produce. |
| `mainType` | `"cjs" \| "esm"` | `"cjs"` | Primary format — drives the `main` field. |
| `entries` | `string \| string[]` | `["index.ts"]` | Entry files inside `srcDir`. Use an array for multi-entry packages (CLI + library). |
| `srcDir` | `string` | `"src"` | Source directory name. |
| `dts` | `boolean` | `true` | Emit `.d.ts` / `.d.mts` / `.d.cts` declarations. |
| `sourcemap` | `boolean` | `true` | Emit sourcemaps. |
| `minify` | `boolean` | `false` | Minify output (rarely useful for libraries). |
| `preserveModules` | `boolean` | `true` | Keep one output file per source module (real stack traces) instead of one bundle. |
| `clone` | `(string \| [string,string])[]` | `[]` | Files/dirs to copy into the build. `"README.md"` copies as-is; `["src","dest"]` renames. |
| `publish` | `boolean` | `true` | Run `npm publish` after build. |
| `access` | `"public" \| "restricted"` | `"public"` | `npm publish --access` value. |
| `commit` | `string \| true \| false` | — | Git behavior — see [Git workflow](#git-workflow). |
| `branch` | `string` | current branch | Branch to push to. |
| `version` | `"auto"\|"patch"\|"minor"\|"major"\| string` | `"auto"` | **Standalone only.** Version strategy — see [Versioning](#versioning). |

> **`clone` is the only way to ship non-source files.** The build dir is otherwise just the compiled output — skip `README.md` and your npm page has no README.

---

## Versioning

pkgist resolves the next version per package, then writes it back to the source `package.json` before building.

| Strategy | Result (`current = 2.1.0`) |
|---|---|
| `"auto"` (default) / `"patch"` | `2.1.1` |
| `"minor"` | `2.2.0` |
| `"major"` | `3.0.0` |
| literal semver (`"3.0.0"`) | `3.0.0` (exact) |

**Families synchronize.** They take the highest current version across all members and bump that, so everyone lands together:

```
atom         1.0.5
react-atom   5.1.3   ← highest
atomic-query 0.1.0

family "patch" → all three become 5.1.4
```

The family version is the compatibility contract — adding a low-versioned package to a family snaps it up to match on first build.

### Intra-family dependency pinning

In a monorepo, siblings reference each other with `"*"` so the workspace links them locally. `"*"` must never reach npm — a consumer could resolve a sibling to *any* version. So during a **family build**, pkgist rewrites every `dependencies` / `peerDependencies` entry whose name is **another family member** to the **exact** shared release version in the *published* `package.json`:

```jsonc
// SOURCE (kept as-is for workspace linking)
"dependencies": { "@scope/atom": "*" }

// PUBLISHED at family version 5.1.4 (not "*", not "^5.1.4" — exact)
"dependencies": { "@scope/atom": "5.1.4" }
```

This is **family-builds-only** — standalone builds publish their deps verbatim. Only family-member names are rewritten; every other dependency keeps its original range. The source `package.json` is never mutated.

---

## Git workflow

Git runs only when `commit` resolves to a non-empty message. Four shapes:

| `commit` value | Behavior |
|---|---|
| `"a message"` | Use that exact message. |
| `true` | Auto-generate `Released <new-version>`. |
| `false` | Explicitly skip git. |
| omitted | Skip git (back-compat default). |

When it runs, pkgist executes this sequence in the package's `root`:

```
git add -A → git commit -m "<message>" → git push origin <branch>
→ git tag v<version> → git push origin --tags
```

The branch comes from `branch` if set, otherwise the currently checked-out branch. `git add -A` stages **everything** dirty in the tree, not just the version bump — clean or stash unrelated work before releasing.

**Family-level `commit`** overrides every member's per-package `commit` and uses the same four shapes. A family `commit: true` produces `Released <shared-version>` for every member.

> Git is **best-effort**: a package whose remote diverged (or has no remote) logs a warning and still publishes to npm — the publish is the source of truth.

---

## CLI reference

| Command | What it does |
|---|---|
| `pkgist init` | Scaffold `pkgist.config.ts` (skips if one exists; `--force` to overwrite). |
| `pkgist build [pkg...]` | Build one or more standalone packages by name (`--all` for every standalone). |
| `pkgist build:family <name>` | Build every package in a family on one shared version. |
| `pkgist build:all` | Build every standalone package and every family. |
| `pkgist list` | Show registered packages + families with current versions. |
| `pkgist validate` | Check the config parses and every `root` exists on disk. |

Flags available on every `build*` command:

| Flag | Description |
|---|---|
| `--dry-run` | Print every step without touching disk, git, or npm. **Run this before any real release.** |
| `--no-publish` | Skip `npm publish` (build + commit + tag still run). |
| `--no-git` | Skip git entirely, regardless of per-package `commit`. |
| `--concurrency <n>` | Override `settings.concurrency`. Use `1` to serialize for debugging. |
| `--config <path>` | Use a specific config file instead of auto-discovery. |
| `--verbose` | Debug-level logging. |

```sh
pkgist validate
pkgist build:all --dry-run
pkgist build:all
pkgist build @my-scope/utils            # one package
pkgist build:family state               # one synchronized family
pkgist build:all --no-publish --no-git  # compile-only smoke test
```

---

## Build pipeline

For each package, in order (steps 4 and 9 are conditional):

```
1.  Read source package.json → current version
2.  Resolve the new version (auto-bump or explicit)
3.  Create the build output directory  (buildDir/<name>/<version>/)
4.  Snapshot source → sourcesDir   (only if sourcesDir is set)
5.  Compile with tsdown → esm/ and cjs/
6.  Clone extra files/dirs listed in `clone`
7.  Write a clean package.json for the build
8.  Update source package.json version in place
9.  git add -A → commit → push → tag → push --tags   (only if commit resolves)
10. npm publish --access <public|restricted> from the build dir   (only if publish !== false)
```

Packages run in parallel up to `concurrency`; within one package, steps are sequential.

### Output structure (`preserveModules: true`, default)

Each source file becomes its own output file, so production stack traces show real file names (`array/chunk.mjs:4`) instead of bundle offsets.

```
builds/utils/2.1.1/
├── package.json        ← clean: no devDeps, no scripts
├── README.md           ← cloned
├── esm/  index.mjs · index.d.mts · array/chunk.mjs · …
└── cjs/  index.cjs · array/chunk.cjs · …
```

The generated `package.json`:

```json
{
  "main":   "./cjs/index.cjs",
  "module": "./esm/index.mjs",
  "types":  "./esm/index.d.mts",
  "exports": {
    ".": {
      "import":  { "types": "./esm/index.d.mts", "default": "./esm/index.mjs" },
      "require": { "types": "./esm/index.d.mts", "default": "./cjs/index.cjs" }
    }
  }
}
```

Set `preserveModules: false` to bundle each format into a single `index.js` (fine for tiny single-file packages). ESM-only packages (`mainType: "esm"` or `formats: ["esm"]`) get `"type": "module"` and omit the `require` condition.

### What ships in the published `package.json`

pkgist generates a clean `package.json` — it does **not** copy yours verbatim.

- **Kept:** `name`, `description`, `keywords`, `author`, `license`, `repository`, `homepage`, `bugs`, `dependencies`, `peerDependencies`, `sideEffects`, `bin`, `engines`.
- **Replaced / set:** `name`, `version`, `main`, `module`, `types`, `exports`, `type`.
- **Dropped:** everything else (`devDependencies`, `scripts`, `private`, `workspaces`, `files`, `publishConfig`, …).

The `bin` field is kept but normalized — a leading `./` is stripped (npm rejects bin values starting with `./`).

---

## Recipes

**React component library** — just add `type: "react"`:

```ts
{ name: "@scope/ui", root: "./packages/ui", type: "react", commit: true, clone: ["README.md", "LICENSE"] }
```

**ESM-only Vite/build-tool plugin:**

```ts
{ name: "@scope/vite-plugin", root: "./packages/vite-plugin", mainType: "esm", formats: ["esm"], commit: true }
```

**Library + CLI in one package** (the `bin` field is preserved from source):

```ts
{ name: "@scope/agent-kit", root: "./packages/agent-kit", entries: ["index.ts", "cli/index.ts"], commit: true, clone: ["README.md", "LICENSE", "bin"] }
```

**Build-only (never publish):**

```ts
{ name: "@scope/internal", root: "./packages/internal", publish: false, commit: true }
```

**CI: publish but let the pipeline handle tags:**

```sh
pkgist build:all --no-git
```

---

## What pkgist does NOT do

No test running, linting, changelog generation, or `node_modules` installs — run those as your own pre-commit hooks or CI steps. pkgist stays focused: take source, produce a clean publishable artifact, commit, tag, publish.

---

## Documentation

- **[`skills/`](./skills)** — per-topic deep dives (configuration, package options, versioning, git workflow, CLI, pipeline, recipes, changelog), authored for AI agents and humans alike.
- **[`llms.txt`](./llms.txt)** / **[`llms-full.txt`](./llms-full.txt)** — LLM-friendly indexes; load `llms-full.txt` once for the complete reference.
- **[CHANGELOG.md](./CHANGELOG.md)** — dated release history.

---

## License

MIT
