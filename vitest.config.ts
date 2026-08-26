import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Resolve workspace packages
    alias: {
      "@picx-devkit/tools": resolve(__dirname, "packages/tools/src"),
      "@picx-devkit/core": resolve(__dirname, "packages/core/src"),
    },
  },
});
