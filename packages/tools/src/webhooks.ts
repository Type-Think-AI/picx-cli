/**
 * webhooks.ts — delivery-inspection + redelivery tools.
 *
 * These are the API-key-reachable slice of the webhook surface in picx-ai@0.4.0.
 * Webhook REGISTRATION (create/list/delete/test) is session-authenticated in the
 * developer console and rejects a pxsk_ key, so it is intentionally NOT exposed
 * here. What an API key CAN do is inspect deliveries and replay one:
 *
 *   GET  /generations/{id}/deliveries          → client.generations.deliveries(id)
 *   GET  /webhooks/{id}/deliveries              → client.webhooks.deliveries(id, params)
 *   POST /webhooks/deliveries/{id}/redeliver    → client.webhooks.redeliver(id)
 *
 * These answer "my app never received the result": list every delivery attempt,
 * then replay the one that failed. `generations.deliveries` also covers inline
 * `webhook:{url}` and legacy `callback_url` targets that have no registered
 * webhook row and so never appear under `webhooks.deliveries`.
 */

import { z } from "zod";
import type { ToolDef, ToolContext, ToolOutput } from "./types.js";

// ── picx_generation_deliveries ───────────────────────────────────────────────

export const picx_generation_deliveries: ToolDef = {
  name: "picx_generation_deliveries",
  title: "Generation Webhook Deliveries",
  description:
    "List every webhook delivery attempt made for one generation — the view that answers " +
    "'my app never received the result'. Covers registered webhooks AND inline webhook:{url} / " +
    "legacy callback_url targets (which never show up under picx_webhook_deliveries). Read-only, " +
    "no credits spent.",
  inputSchema: {
    generation_id: z.string().min(1).describe("Generation ID to inspect deliveries for"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["generation", "deliveries"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const id = String(args.generation_id);
    const res = await ctx.client.generations.deliveries(id);
    const deliveries = res.deliveries ?? [];

    return {
      summary: `${deliveries.length} delivery attempt(s) for generation ${id} (${res.total} total)`,
      data: { generation_id: id, deliveries, total: res.total },
    };
  },
};

// ── picx_webhook_deliveries ──────────────────────────────────────────────────

export const picx_webhook_deliveries: ToolDef = {
  name: "picx_webhook_deliveries",
  title: "Webhook Deliveries",
  description:
    "List delivery history for a registered webhook. Filter by outcome " +
    "(delivered|failed|pending_retry|exhausted) to find the deliveries that never landed, or by " +
    "event_type. Offset-paginated. Works with an API key. Read-only, no credits spent.",
  inputSchema: {
    webhook_id: z.string().min(1).describe("Registered webhook ID"),
    outcome: z
      .enum(["delivered", "failed", "pending_retry", "exhausted"])
      .optional()
      .describe("Filter by delivery outcome"),
    event_type: z.string().optional().describe("Filter by event type"),
    limit: z.number().int().min(1).max(100).optional().describe("Page size"),
    offset: z.number().int().min(0).optional().describe("Rows to skip"),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["webhook", "deliveries"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const id = String(args.webhook_id);
    const params: Record<string, unknown> = {};
    if (args.outcome) params.outcome = args.outcome;
    if (args.event_type) params.event_type = args.event_type;
    if (args.limit !== undefined) params.limit = args.limit;
    if (args.offset !== undefined) params.offset = args.offset;

    const res = await ctx.client.webhooks.deliveries(id, params as any);
    const deliveries = res.deliveries ?? [];

    return {
      summary: `${deliveries.length} delivery attempt(s) for webhook ${id} (${res.total} total)`,
      data: { webhook_id: id, deliveries, total: res.total },
    };
  },
};

// ── picx_redeliver_webhook ───────────────────────────────────────────────────

export const picx_redeliver_webhook: ToolDef = {
  name: "picx_redeliver_webhook",
  title: "Redeliver Webhook",
  description:
    "Replay a stored webhook delivery by its delivery ID. Reuses the original payload and " +
    "event_id, so a consumer that dedupes on X-PicX-Delivery can safely ignore a replay it " +
    "already handled. The recorded target URL is re-validated before the replay is sent (a host " +
    "that now resolves to a private address is refused). Works with an API key. Does not spend " +
    "credits, but DOES trigger a real outbound POST to your endpoint.",
  inputSchema: {
    delivery_id: z.string().min(1).describe("Delivery ID to replay"),
  },
  // Not read-only: it triggers a real outbound delivery (side effect), though it
  // spends no credits.
  effect: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  cost: { kind: "free" },
  cli: ["webhook", "redeliver"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const id = String(args.delivery_id);
    const res = await ctx.client.webhooks.redeliver(id);

    return {
      summary: `Redelivered ${res.event_type} (event ${res.event_id}): ${res.outcome}${res.status_code ? ` [${res.status_code}]` : ""}`,
      data: { ...res },
    };
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

const webhookTools: ToolDef[] = [
  picx_generation_deliveries,
  picx_webhook_deliveries,
  picx_redeliver_webhook,
];
export default webhookTools;
