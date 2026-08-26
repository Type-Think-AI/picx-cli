import { defineConfig } from "tsup";

/**
 * Why this package is bundled rather than plain-tsc'd.
 *
 * `picx-cli` imports `@picx/core` and `@picx/tools`, which are `private: true`
 * and exist only inside this workspace. pnpm rewrites `workspace:*` to a real
 * version on pack, so a tsc-built package would publish a manifest declaring
 * `"@picx/core": "3.0.0"` — a package that 404s on the registry. Every
 * `npm i -g picx-cli` would then fail at install.
 *
 * So the two private packages are inlined into `dist/` via `noExternal`, and
 * dropped from `dependencies` (they stay in devDependencies so the workspace
 * still links them at build time).
 *
 * Everything in `external` is a real registry package and MUST stay declared in
 * `dependencies`. `picx-ai` and `zod` are reached transitively — `@picx/core`
 * imports `picx-ai`, `@picx/tools` imports `zod` — so bundling those two
 * packages makes their imports this package's own runtime requirements.
 * Verified by grepping the emitted bundle for its remaining bare imports.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  // No `dts`: this package ships a binary, nobody imports it as a library.
  dts: false,
  noExternal: ["@picx/core", "@picx/tools"],
  external: ["commander", "picx-ai", "zod"],
});
