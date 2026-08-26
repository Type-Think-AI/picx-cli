/**
 * account.ts — picx_get_account + picx_get_usage tools.
 * Owner: A5
 *
 * picx_get_account merges GET /v1/account/me and GET /v1/account/tier into a
 * single result so a model can check affordability in one call.
 *
 * NEVER includes the API key in any output.
 */

import { z } from "zod";
import type { ToolDef, ToolContext, ToolOutput } from "./types.js";

// ── picx_get_account ─────────────────────────────────────────────────────────

export const picx_get_account: ToolDef = {
  name: "picx_get_account",
  title: "Get Account",
  description:
    "Get the current account info including email, active status, and credit balance. " +
    "Read-only, no credits spent. Never exposes the API key. " +
    "Note: rate limits and max_credits_per_day are not yet available (awaiting picx-ai v0.4.0 " +
    "to expose GET /v1/account/tier).",
  inputSchema: {},
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["whoami"],
  handler: async (_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const me = await ctx.client.account.me();

    // NOTE: GET /v1/account/tier EXISTS on the API but is not yet exposed by
    // picx-ai (needs v0.4.0). Therefore rate limits and max_credits_per_day
    // cannot be reported yet — do NOT invent or default those numbers.
    const result = {
      id: me.id,
      email: me.email,
      name: me.name ?? null,
      role: me.role ?? null,
      is_active: me.is_active,
      credits_balance: me.credits?.balance ?? null,
      credits_total_earned: me.credits?.total_earned ?? null,
      credits_total_used: me.credits?.total_used ?? null,
    };

    return {
      summary: `${result.email} | ${result.credits_balance ?? "unknown"} credits remaining`,
      data: result,
    };
  },
};

// ── picx_get_usage ───────────────────────────────────────────────────────────

export const picx_get_usage: ToolDef = {
  name: "picx_get_usage",
  title: "Get Usage",
  description:
    "Retrieve account usage statistics for the specified period (7d, 30d, or 90d). " +
    "Shows credit consumption, request counts, and breakdown by model/endpoint. " +
    "Read-only, no credits spent.",
  inputSchema: {
    period: z.enum(["7d", "30d", "90d"]).optional(),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["usage"],
  handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> => {
    const period = (args.period as string | undefined) ?? "30d";

    const usage = await ctx.client.account.usage({ period });

    // UsageResponse is flat — no .data wrapper
    return {
      summary: `Usage (${period}): ${usage.credits_used} credits across ${usage.total_requests} requests`,
      data: {
        period,
        total_requests: usage.total_requests,
        successful_requests: usage.successful_requests,
        failed_requests: usage.failed_requests,
        total_cost_usd: usage.total_cost_usd,
        credits_used: usage.credits_used,
        period_days: usage.period_days,
        model_breakdown: usage.model_breakdown,
      },
    };
  },
};
