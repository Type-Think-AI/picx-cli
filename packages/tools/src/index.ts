/**
 * Tool registry assembly.
 *
 * Every tool the DevKit exposes is collected here exactly once. The MCP server
 * iterates this registry to call `registerTool`; the CLI iterates it to mount
 * subcommands. Adding a tool means adding it to `ALL_TOOLS` and nowhere else.
 *
 * Imports are NAMED rather than default. The tool modules were written to expose
 * both, but a named import fails loudly at build time if a symbol is renamed,
 * whereas a default import silently yields `undefined` and produces an empty
 * registry at runtime. Two of these modules (`models`, `account`) export no
 * default at all, which is exactly how that bug would have shipped.
 */

import { buildRegistry } from "./types.js";
import type { ToolDef, ToolRegistry } from "./types.js";

import { picx_generate_image, picx_edit_image } from "./images.js";
import { picxGenerateVideo, picxGetGeneration } from "./videos.js";
import { picxUploadAsset, picxListAssets, picxDeleteAsset } from "./assets.js";
import { picx_list_models } from "./models.js";
import { picx_get_account, picx_get_usage } from "./account.js";

export * from "./types.js";
export { getModelCost } from "./models.js";

// Re-exported under stable SCREAMING_CASE names. The modules themselves use
// lowercase; the alias is the public contract the MCP package consumes.
export { prompts as PROMPTS, resources as RESOURCES } from "./prompts.js";
export type { PromptDef, ResourceDef, PromptResult } from "./prompts.js";

/** Flat list, in the order clients tend to display tools. */
export const ALL_TOOLS: ToolDef[] = [
  picx_generate_image,
  picx_edit_image,
  picxGenerateVideo,
  picxGetGeneration,
  picxUploadAsset,
  picxListAssets,
  picxDeleteAsset,
  picx_list_models,
  picx_get_account,
  picx_get_usage,
];

/** Name-keyed registry. Throws on duplicate or unprefixed names. */
export const registry: ToolRegistry = buildRegistry(ALL_TOOLS);

/** Look up a tool, throwing a useful error rather than returning undefined. */
export function getTool(name: string): ToolDef {
  const tool = registry[name];
  if (!tool) {
    const known = Object.keys(registry).sort().join(", ");
    throw new Error(`unknown tool: ${name}. known tools: ${known}`);
  }
  return tool;
}

/** Tools that spend credits — used for pre-flight warnings and by tests. */
export function creditSpendingTools(): ToolDef[] {
  return ALL_TOOLS.filter((t) => !t.effect.readOnlyHint);
}
