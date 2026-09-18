/**
 * templates.ts — picx_search_templates + picx_get_template tools.
 *
 * The prompt-template catalogue is part of the /v1 surface, so these tools go
 * through the picx-ai SDK (`client.templates`) like every other resource and
 * carry the API key. The SDK exposes:
 *   client.templates.list(params)  → GET /templates  → { templates, total, limit, offset }
 *   client.templates.get(id)       → GET /templates/{id} → TemplateInfo
 *
 * THREE catalogue behaviours the help text surfaces honestly:
 *   1. `total` is an ESTIMATE, not an exact count — page (offset += limit) until
 *      a short page (< limit rows) comes back rather than trusting `total`.
 *   2. The `topic` FILTER works, but the `topic` FIELD on every row is always
 *      null — you can filter by topic, you just can't read it back.
 *   3. A null `prompt` means a premium/gated row, NOT missing data.
 */

import { z } from "zod";
import type { ToolDef, ToolContext, ToolOutput } from "./types.js";

// ── picx_search_templates ────────────────────────────────────────────────────

export const picx_search_templates: ToolDef = {
  name: "picx_search_templates",
  title: "Search Templates",
  description:
    "Search and browse the PicX prompt-template catalogue. Filter by free-text query, media " +
    "type (image|video), topic, tags (matched as a set — a row must carry every tag), target " +
    "model, featured, or trending. Offset-paginated. Read-only, no credits spent. NOTE: `total` " +
    "is an ESTIMATE, so page until a short page returns rather than trusting it; the `topic` " +
    "field is always null even though the topic filter works; and a null `prompt` marks a " +
    "premium/gated row, not missing data.",
  inputSchema: {
    q: z.string().optional().describe("Free-text search query"),
    media_type: z
      .enum(["image", "video"])
      .optional()
      .describe("Filter by media type"),
    topic: z
      .string()
      .optional()
      .describe("Filter by topic (the filter works; the returned topic field is always null)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Filter by tags — matched as a set, a row must carry every tag"),
    target_model: z.string().optional().describe("Filter by target model ID"),
    featured: z.boolean().optional().describe("Only featured templates"),
    trending: z.boolean().optional().describe("Only trending templates"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30)
      .describe("Page size (1-100, default 30)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip (default 0)"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["templates", "search"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const params: Record<string, unknown> = {};
    if (args.q) params.q = args.q;
    if (args.media_type) params.media_type = args.media_type;
    if (args.topic) params.topic = args.topic;
    if (Array.isArray(args.tags) && args.tags.length > 0) params.tags = args.tags;
    if (args.target_model) params.target_model = args.target_model;
    if (args.featured !== undefined) params.featured = args.featured;
    if (args.trending !== undefined) params.trending = args.trending;
    if (args.limit !== undefined) params.limit = args.limit;
    if (args.offset !== undefined) params.offset = args.offset;

    const res = await ctx.client.templates.list(params as any);
    const templates = res.templates ?? [];

    // `total` is an estimate; tell the caller whether more pages likely exist by
    // whether this page came back full.
    const limit = (res.limit ?? args.limit ?? 30) as number;
    const offset = (res.offset ?? args.offset ?? 0) as number;
    const hasMore = templates.length === limit;

    return {
      summary:
        `${templates.length} template(s) [offset ${offset}, ~${res.total} total (estimate)]` +
        (hasMore ? " — full page, more likely available" : ""),
      data: {
        templates,
        total: res.total,
        total_is_estimate: true,
        limit,
        offset,
        has_more: hasMore,
      },
    };
  },
};

// ── picx_get_template ────────────────────────────────────────────────────────

export const picx_get_template: ToolDef = {
  name: "picx_get_template",
  title: "Get Template",
  description:
    "Get a single PicX template by ID. Returns the full TemplateInfo (title, prompt, media_type, " +
    "tags, target_model, preview/thumbnail URLs, is_featured, likes). Read-only, no credits spent. " +
    "A null `prompt` means a premium/gated row, not missing data. 404s when no live template has " +
    "that ID.",
  inputSchema: {
    template_id: z.string().min(1).describe("Template ID (string, e.g. tpl_abc123)"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["templates", "get"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const id = String(args.template_id);
    const template = await ctx.client.templates.get(id);

    return {
      summary: `Template ${template.id}: ${template.title}`,
      data: { template },
    };
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export default [picx_search_templates, picx_get_template];
