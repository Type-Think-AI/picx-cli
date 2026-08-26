/**
 * templates.ts — picx_search_templates + picx_get_template tools.
 *
 * The /templates/ endpoint is PUBLIC (no auth required for search/list) and
 * mounts at the root, NOT under /v1. Since the picx-ai SDK has no templates
 * method, these tools hit the API directly via fetch.
 */

import { z } from "zod";
import type { ToolDef, ToolContext, ToolOutput } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip /v1 from the client's baseUrl to reach root-mounted endpoints. */
function templatesBaseUrl(client: { baseUrl: string }): string {
  return client.baseUrl.replace("/v1", "") + "/templates/";
}

// ── picx_search_templates ────────────────────────────────────────────────────

export const picx_search_templates: ToolDef = {
  name: "picx_search_templates",
  title: "Search Templates",
  description:
    "Search and browse PicX prompt templates. Filter by category, media type, target model, " +
    "tags, or free-text search. Returns paginated results. Read-only, no credits spent, no auth required.",
  inputSchema: {
    search: z.string().optional().describe("Free-text search query"),
    category: z.string().optional().describe("Filter by category slug"),
    media_type: z
      .enum(["image", "video", "audio"])
      .optional()
      .describe("Filter by media type"),
    target_model: z.string().optional().describe("Filter by target model ID"),
    featured: z.boolean().optional().describe("Only show featured templates"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(10)
      .describe("Results per page (1-100, default 10)"),
    page: z.number().min(1).default(1).describe("Page number (default 1)"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["templates", "search"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const baseUrl = templatesBaseUrl(ctx.client);
    const params = new URLSearchParams();

    if (args.search) params.set("search", String(args.search));
    if (args.category) params.set("category", String(args.category));
    if (args.media_type) params.set("media_type", String(args.media_type));
    if (args.target_model) params.set("target_model", String(args.target_model));
    if (args.featured !== undefined) params.set("featured", String(args.featured));
    if (args.tags && Array.isArray(args.tags)) {
      for (const tag of args.tags as string[]) {
        params.append("tags", tag);
      }
    }
    if (args.limit) params.set("limit", String(args.limit));
    if (args.page) params.set("page", String(args.page));

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Templates API returned ${res.status}: ${body}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    const templates = (json.templates ?? json.results ?? json.data ?? json) as unknown[];

    return {
      summary: `Found ${Array.isArray(templates) ? templates.length : 0} template(s)`,
      data: { templates, page: args.page ?? 1, limit: args.limit ?? 10 },
    };
  },
};

// ── picx_get_template ────────────────────────────────────────────────────────

export const picx_get_template: ToolDef = {
  name: "picx_get_template",
  title: "Get Template",
  description:
    "Get a single PicX template by ID. Returns full template detail including prompt text, " +
    "parameters, and example outputs. Read-only, no credits spent, no auth required.",
  inputSchema: {
    template_id: z.number().describe("Numeric template ID"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["templates", "get"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const id = args.template_id as number;
    const baseUrl = templatesBaseUrl(ctx.client);
    const url = `${baseUrl}${id}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Templates API returned ${res.status}: ${body}`);
    }

    const template = (await res.json()) as Record<string, unknown>;

    const name = (template.name ?? template.title ?? `#${id}`) as string;
    return {
      summary: `Template: ${name}`,
      data: { template },
    };
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export default [picx_search_templates, picx_get_template];
