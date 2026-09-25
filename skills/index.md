---
description: "@mongez/pkgist builds and releases TypeScript or React npm packages with tsdown. It registers standalone packages or synchronized families, creates clean publish artifacts, updates source versions, optionally commits, tags, pushes, and publishes, and can preview all release effects with dry-run mode. Use this package when you need a repeatable package-release configuration, build pipeline, version strategy, or CLI invocation. Not this package -> application runtime builds: @mongez/builder; workspace task automation: your package manager or CI; npm registry policy and account administration: npm documentation."
---

# @mongez/pkgist

`@mongez/pkgist` is the release runner for one or more TypeScript/React packages. It turns a declarative package registry into build artifacts and, when enabled, version, git, and npm publish operations.

## The 80% path

1. Start with [Overview](overview/SKILL.md) for the package model and the smallest usable release flow.
2. Create `pkgist.config.ts` with [Configuration](configuration/SKILL.md), then add package-specific fields from [Package options](package-options/SKILL.md).
3. Run `pkgist validate`, then preview the exact release with `pkgist build:all --dry-run`; command targeting and flags are in [CLI](cli/SKILL.md).
4. Choose independent or family version behavior in [Versioning](versioning/SKILL.md), then run the appropriate `build`, `build:family`, or `build:all` command.
5. Before a real release, review the side effects in [Pipeline](pipeline/SKILL.md) and [Git workflow](git-workflow/SKILL.md). Copy a starting configuration from [Recipes](recipes/SKILL.md).

## Choose a topic

- [CLI](cli/SKILL.md) -- commands, targeting, flags, exit codes, and dry runs.
- [Configuration](configuration/SKILL.md) -- config discovery, `defineConfig`, settings, standalone packages, and families.
- [Package options](package-options/SKILL.md) -- build, output, clone, publish, and git fields on a package.
- [Versioning](versioning/SKILL.md) -- bump strategies, explicit versions, family synchronization, and dependency pinning.
- [Pipeline](pipeline/SKILL.md) -- the ordered build, snapshot, compile, git, publish, and verification phases.
- [Git workflow](git-workflow/SKILL.md) -- commit resolution, branches, tags, pushes, and per-run overrides.
- [Recipes](recipes/SKILL.md) -- copyable configs and focused release flows.
- [Changelog](changelog/SKILL.md) -- dated release history and compatibility context.

## Boundaries

Not this package -> application bundling or dev-server configuration: `@mongez/builder`; monorepo dependency installation and scripts: npm, pnpm, or Yarn; CI-provider workflows and secrets: the relevant CI platform; npm ownership, access tokens, or organization administration: npm documentation.
