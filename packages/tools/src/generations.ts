/**
 * generations.ts — picx_list_generations tool.
 * Owner: A (lead-wired)
 *
 * Lists generation history with optional filters. picx_get_generation already
 * lives in videos.ts — not duplicated here.
 */

import { z } from "zod";
import type { ToolDef, ToolContext, ToolOutput } from "./types.js";

// ---------------------------------------------------------------------------
// picx_list_generations
// ---------------------------------------------------------------------------

export const picx_list_generations: ToolDef = {
  name: "picx_list_generations",
  title: "List Generations",
  description: [
    "List recent generation jobs (images and videos) with their status, model,",
    "credit cost, and output URLs. Use to review generation history, check what",
    "has been generated recently, or find a specific job. Supports filtering by",
    "type and status. Read-only, no credits spent.",
  ].join(" "),
  inputSchema: {
    type: z.enum(["image", "video"]).optional().describe("Filter by generation type"),
    status: z.string().optional().describe("Filter by status (e.g. completed, failed, pending)"),
    limit: z.number().int().min(1).max(50).default(20).optional().describe("Max results to return (1-50, default 20)"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["history"],

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
    const params: Record<string, unknown> = {};
    if (args.type) params.type = args.type;
    if (args.status) params.status = args.status;
    if (args.limit) params.limit = args.limit;

    const response = await ctx.client.generations.list(params as any);

    const generations = (response as any).generations ?? [];

    // Build links from completed generations with output_url
    const links = generations
      .filter((g: any) => g.status === "completed" && g.output_url)
      .map((g: any) => ({
        url: g.output_url,
        name: `${g.type ?? "generation"}-${g.id}`,
        mimeType: g.type === "video" ? "video/mp4" : "image/png",
      }));

    const count = generations.length;
    const typeLabel = args.type ? ` ${args.type}` : "";
    const statusLabel = args.status ? ` (${args.status})` : "";

    return {
      summary: `${count}${typeLabel} generation(s)${statusLabel}`,
      data: { generations, total: count },
      links: links.length > 0 ? links : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// Default export — registry array
// ---------------------------------------------------------------------------

const generationTools: ToolDef[] = [picx_list_generations];
export default generationTools;
