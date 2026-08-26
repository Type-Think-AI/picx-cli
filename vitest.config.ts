import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Resolve workspace packages
    alias: {
      "@picx/tools": resolve(__dirname, "packages/tools/src"),
      "@picx/core": resolve(__dirname, "packages/core/src"),
    },
  },
});
