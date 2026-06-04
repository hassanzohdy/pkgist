---
name: mongez-pkgist-changelog
description: |
  Release history for `@mongez/pkgist` — what changed in each version, each entry dated (`## [x.y.z] - YYYY-MM-DD`). Load this to answer "what's new in pkgist", "when did intra-family dependency pinning land", "which version fixed `--no-git`", "what changed between versions", or before bumping/releasing pkgist. Mirrors the package CHANGELOG.md (Keep a Changelog + SemVer). Newest version first.
---

# Changelog

All notable changes to `@mongez/pkgist` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). This skill is the source-of-truth mirror of the package `CHANGELOG.md` — keep both in lockstep on every release.

---

## [1.3.0] - 2026-06-04

### Added

- **`pkgist init` command.** Scaffolds a `pkgist.config.ts` in the current directory (`buildDir: "./builds"`, `sourcesDir: "./sources"`, one example package). Skips an existing config unless `--force` is passed — the fastest path from `npm install` to a working config.

### Changed

- **Single config file.** Config discovery now recognises only `pkgist.config.ts` (then `pkgist.config.js`). The `builder.ts` / `builder.js` / `mongez.ts` / `mongez.js` legacy aliases are gone. Pass `--config <path>` for a custom location. *Migration: rename `builder.ts` → `pkgist.config.ts`.*
- The shipped example template is renamed `builder.example.ts` → `pkgist.config.example.ts`.
- **pkgist now publishes ESM-only** (`mainType: "esm"`, `formats: ["esm"]`). It targets Node 18+.

### Fixed

- **The published `pkgist` CLI binary runs.** Earlier releases shipped a CommonJS binary (`cjs/cli.cjs`) that crashed on the first log line — `chalk` v5 is ESM-only and can't be `require`d from CommonJS. Publishing ESM-only (`bin` → `esm/cli.mjs`) means `npx pkgist`, `pkgist init`, and every command actually work for installed consumers. (Internal monorepo releases were unaffected — they run the ESM engine, not the published binary.)

### Docs

- Rewrote the README into a professional, beginner→advanced reference.
- Every changelog entry is now dated — here, in the docs Change Logs page, and in `CHANGELOG.md`.

## [1.2.0] - 2026-06-04

### Added

- **Intra-family dependency pinning.** In a family build, any `dependencies` / `peerDependencies` entry that names another family member is now pinned to the **exact** shared release version in the published `package.json` (the source keeps `"*"` for workspace linking). Standalone builds are unaffected. This stops `"*"` from leaking to consumers and keeps a released family installable as one coherent, same-version set. See the `versioning` skill.
- **`changelog` skill** (this file), plus a Change Logs page in the docs site — so version history auto-loads for AI agents and is tracked on every release.

### Fixed

- **`--no-git` is now honoured.** commander stores the negated flag under its positive attribute (`git === false`), but the build commands read `opts.noGit` (always `undefined`), so `--no-git` was silently ignored and git still ran. The commands now read the raw `git` attribute, mirroring the existing `--no-publish` handling. Affects `build`, `build:family`, and `build:all`.
- **`src/build/` is tracked by git again.** A bare `build` line in `.gitignore` matches at any depth, which silently untracked the entire build-pipeline source (`package-builder.ts`, `family-builder.ts`, `parallel-builder.ts`, `index.ts`) — including the dependency-pinning wiring. The ignore rules are now anchored to the package root (`/dist`, `/build`).
- **The published `pkgist` CLI binary works.** `bin` pointed at `dist/cli.js` — the local tsup-dev layout, which is **absent** from the engine-built package (it ships `cjs/` + `esm/`, no `dist/`). `bin` now points at `cjs/cli.cjs`, the real build output, so `npm i -g @mongez/pkgist` produces a working `pkgist` command.

### Docs

- Documented intra-family dependency pinning across the `versioning` + `pipeline` skills, README, the docs site, and `llms-full.txt`.
- Corrected long-standing drift in `llms-full.txt`: the "kept fields" list (dropped the fields that pkgist actually strips), the source-snapshot exclusion list (added `.turbo`, `.cache`), and the config auto-discovery note (six filenames, not two).
- Aligned the documented git pipeline to the real commands: `git add -A` and `git push origin --tags`.

## [1.1.3] - 2026-06-03

### Added

- Per-topic skills (`skills/`) plus `llms.txt` / `llms-full.txt` for AI-agent auto-loading, an expanded install section (npm / yarn / pnpm) with a CLI quick example, and a CI build smoke-test workflow (Node 20/22 on Ubuntu, Node 20 on Windows).

### Fixed

- Reconciled several documentation drift items against source during a skills polish pass.

## [1.1.2] - 2026-05-29

### Added

- This changelog. No code changes — the package remains the tsdown-powered build/version/publish tool: standalone + version-synchronised families, dual ESM+CJS output, asset cloning, git tag + push automation, and `--dry-run`.

> Version history prior to 1.1.0 is available via the git tags and GitHub releases on [hassanzohdy/pkgist](https://github.com/hassanzohdy/pkgist).

## [1.1.0] - 2026-05-27

### Added

- **`commit` field accepts `true` / `false`** in addition to a string. `true` auto-generates a `Released <version>` message (set-and-forget); `false` explicitly skips git; a string is used verbatim; omitting it skips git (back-compat).
