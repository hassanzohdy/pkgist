import { defineConfig } from "@mongez/pkgist";

const RELEASE_COMMIT = "docs: add auto-trigger metadata for skills + llms files";

export default defineConfig({
  settings: {
    concurrency: 8,
    buildDir: "../builds",
    sourcesDir: "../sources",
  },

  standalone: [
    {
      name: "@mongez/reinforcements",
      root: "../@mongez/reinforcements",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/agent-kit",
      root: "../@mongez/agent-kit",
      version: "patch",
      commit: RELEASE_COMMIT,
      entries: ["index.ts", "cli/index.ts"],
      clone: ["README.md", "bin", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/supportive-is",
      root: "../@mongez/supportive-is",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/cache",
      root: "../@mongez/cache",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/events",
      root: "../@mongez/events",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/collection",
      root: "../@mongez/collection",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/concat-route",
      root: "../@mongez/concat-route",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/query-string",
      root: "../@mongez/query-string",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/dotenv",
      root: "../@mongez/dotenv",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/encryption",
      root: "../@mongez/encryption",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/config",
      root: "../@mongez/config",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/dom",
      root: "../@mongez/dom",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/user",
      root: "../@mongez/user",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/react-router",
      root: "../@mongez/react-router",
      type: "react",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/react-helmet",
      root: "../@mongez/react-helmet",
      type: "react",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/react-form",
      root: "../@mongez/react-form",
      type: "react",
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/vite",
      root: "../@mongez/vite",
      mainType: "esm",
      formats: ["esm"],
      version: "patch",
      commit: RELEASE_COMMIT,
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
  ],

  families: [
    {
      name: "atom",
      version: "patch",
      commit: RELEASE_COMMIT,
      packages: [
        {
          name: "@mongez/atom",
          root: "../@mongez/atom",
          clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
        },
        {
          name: "@mongez/react-atom",
          root: "../@mongez/react-atom",
          type: "react",
          clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
        },
        {
          name: "@mongez/atomic-query",
          root: "../@mongez/atomic-query",
          type: "react",
          clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
        },
      ],
    },
    {
      name: "localization",
      version: "patch",
      commit: RELEASE_COMMIT,
      packages: [
        {
          name: "@mongez/localization",
          root: "../@mongez/localization",
          clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
        },
        {
          name: "@mongez/react-localization",
          root: "../@mongez/react-localization",
          type: "react",
          clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
        },
      ],
    },
  ],
});
