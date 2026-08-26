import { defineConfig } from "tsup";

/**
 * Same reasoning as `packages/cli/tsup.config.ts`: `@picx/core` and
 * `@picx/tools` are private workspace packages that would publish as
 * unresolvable `3.0.0` dependencies, so they are inlined here instead.
 *
 * `@modelcontextprotocol/server` and `zod` stay external and declared. Bundling
 * the MCP SDK would be actively wrong — a client and server that each carry
 * their own copy of the protocol types can disagree about them, and zod in
 * particular must be a single instance for schema identity to hold.
 */
export default defineConfig({
  entry: ["src/server.ts", "src/stdio.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  /**
   * No declarations shipped in 0.1.0, deliberately.
   *
   * Two blockers, and the second is the real one:
   *   1. tsup's dts step fails against this workspace's `composite` tsconfig
   *      with TS6307 on the second entry point.
   *   2. More fundamentally, the JS here is BUNDLED while declarations would not
   *      be. Emitted `.d.ts` files would reference `@picx/core` and
   *      `@picx/tools` — private packages absent from the published manifest —
   *      so consumers could not resolve them. Broken types are worse than none.
   *
   * In practice every MCP client consumes this as a stdio binary, so types are
   * not on the critical path. To add them properly, roll declarations into the
   * bundle (api-extractor or dts-bundle-generator) rather than emitting per-file.
   */
  dts: false,
  noExternal: ["@picx/core", "@picx/tools"],
  external: ["@modelcontextprotocol/server", "zod", "picx-ai"],
});
