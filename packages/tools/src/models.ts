/**
 * models.ts — picx_list_models tool + getModelCost helper.
 * Owner: A5
 *
 * 5-minute in-memory cache keyed by type, bypassed when refresh=true.
 * NEVER hardcodes credit costs — always reads from the live catalog.
 */

import { z } from "zod";
import type { PicXClient } from "@picx-devkit/core";

/** Matches the picx-ai SDK's ModelType */
type ModelType = "image" | "video" | "audio";
import type { ToolDef, ToolContext, ToolOutput } from "./types.js";

// ── Cache ────────────────────────────────────────────────────────────────────

type CacheEntry = { data: unknown; ts: number };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Tool definition ──────────────────────────────────────────────────────────

export const picx_list_models: ToolDef = {
  name: "picx_list_models",
  title: "List Models",
  description:
    "List available PicX generation models with their capabilities and pricing. " +
    "Results are cached for 5 minutes unless refresh=true. Use this to discover " +
    "model IDs before generating, or to check per-model credit costs. Read-only, no credits spent.",
  inputSchema: {
    type: z.enum(["image", "video"]).optional(),
    refresh: z.boolean().optional(),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["models"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const type = args.type as ModelType | undefined;
    const refresh = args.refresh as boolean | undefined;
    const cacheKey = `models:${type ?? "all"}`;

    // Serve from cache unless refresh requested
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        const models = cached as Array<Record<string, unknown>>;
        return {
          summary: `${models.length} model(s) available${type ? ` (type: ${type})` : ""} [cached]`,
          data: { models, cached: true },
        };
      }
    }

    // Fetch from API
    const response = await ctx.client.models.list(
      type ? { type } : undefined
    );

    const models = response.models;
    setCache(cacheKey, models);

    return {
      summary: `${models.length} model(s) available${type ? ` (type: ${type})` : ""}`,
      data: { models, cached: false },
    };
  },
};

// ── getModelCost helper ──────────────────────────────────────────────────────

/**
 * Look up the credit cost for a given model + optional size from the LIVE catalog.
 *
 * Returns null if the model is not found or if cost information is unavailable.
 * NEVER hardcodes costs — a previous marketing page hardcoded Nano Banana 2 at
 * 20/20/40 credits when the live config said 35/53/105, showing prices up to
 * 2× cheaper than billed.
 */
export async function getModelCost(
  client: PicXClient,
  model: string,
  size?: string
): Promise<number | null> {
  // Always hit the live catalog (no cache) for cost lookups — stale prices
  // cause billing mismatches.
  const response = await client.models.list();
  const models = response.models as unknown as Array<Record<string, unknown>>;

  const entry = models.find(
    (m) => m.id === model || m.model_id === model || m.name === model
  );
  if (!entry) return null;

  // Pricing may be nested under `pricing`, `cost`, or `credits`
  const pricing = (entry.pricing ?? entry.cost ?? entry.credits) as
    | Record<string, unknown>
    | number
    | undefined;

  if (pricing === undefined || pricing === null) return null;

  // Simple number — flat cost regardless of size
  if (typeof pricing === "number") return pricing;

  // Object keyed by size (e.g. { "1024x1024": 35, "2048x2048": 53 })
  if (size && typeof pricing === "object" && size in pricing) {
    const val = (pricing as Record<string, unknown>)[size];
    return typeof val === "number" ? val : null;
  }

  // Try a default/base key
  const fallback =
    (pricing as Record<string, unknown>).default ??
    (pricing as Record<string, unknown>).base ??
    (pricing as Record<string, unknown>)["1024x1024"];

  return typeof fallback === "number" ? fallback : null;
}
