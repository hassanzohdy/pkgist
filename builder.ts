import { defineConfig } from "@mongez/pkgist";

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
      version: "auto",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/agent-kit",
      root: "../@mongez/agent-kit",
      commit: "Enhanced docs",
      entries: ["index.ts", "cli/index.ts"],
      clone: ["README.md", "bin", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/supportive-is",
      root: "../@mongez/supportive-is",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/cache",
      root: "../@mongez/cache",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/events",
      root: "../@mongez/events",
      version: "auto",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/collection",
      root: "../@mongez/collection",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/concat-route",
      root: "../@mongez/concat-route",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/query-string",
      root: "../@mongez/query-string",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/dotenv",
      root: "../@mongez/dotenv",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/encryption",
      root: "../@mongez/encryption",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/config",
      root: "../@mongez/config",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/dom",
      root: "../@mongez/dom",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/user",
      root: "../@mongez/user",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/react-router",
      root: "../@mongez/react-router",
      type: "react",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/react-helmet",
      root: "../@mongez/react-helmet",
      type: "react",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/react-form",
      root: "../@mongez/react-form",
      type: "react",
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
    {
      name: "@mongez/vite",
      root: "../@mongez/vite",
      mainType: "esm",
      formats: ["esm"],
      version: "minor",
      clone: ["README.md", "skills", "llms.txt", "llms-full.txt"],
    },
  ],

  families: [
    {
      name: "atom",
      version: "patch",
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
      version: "minor",
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
