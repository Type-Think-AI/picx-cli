/**
 * `picx webhook deliveries <webhook_id>` — list delivery attempts for a webhook.
 * `picx webhook redeliver <delivery_id>` — replay a stored delivery.
 *
 * These are the API-key-reachable webhook operations. Registration
 * (create/list/delete/test) is session-authenticated in the console and is
 * deliberately not exposed by the CLI. Delegates to picx_webhook_deliveries and
 * picx_redeliver_webhook ToolDef handlers.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerWebhookCommand(program: Command): void {
  const webhook = program
    .command("webhook")
    .description("Inspect and replay webhook deliveries (API-key operations only)");

  // picx webhook deliveries <webhook_id>
  webhook
    .command("deliveries <webhook_id>")
    .description("List delivery attempts for a registered webhook")
    .option("--outcome <outcome>", "Filter: delivered, failed, pending_retry, exhausted")
    .option("--event-type <type>", "Filter by event type")
    .option("--limit <n>", "Page size (1-100)")
    .option("--offset <n>", "Rows to skip")
    .action(async (webhookId: string, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_webhook_deliveries"];
      if (!tool) return fail("Tool picx_webhook_deliveries not found in registry");

      const validOutcomes = ["delivered", "failed", "pending_retry", "exhausted"];
      if (opts.outcome && !validOutcomes.includes(opts.outcome)) {
        process.stderr.write(`Error: --outcome must be one of: ${validOutcomes.join(", ")}\n`);
        process.exit(EXIT.USAGE);
      }
      const limit = opts.limit ? Number(opts.limit) : undefined;
      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
        process.stderr.write("Error: --limit must be a number between 1 and 100\n");
        process.exit(EXIT.USAGE);
      }
      const offset = opts.offset ? Number(opts.offset) : undefined;
      if (offset !== undefined && (isNaN(offset) || offset < 0)) {
        process.stderr.write("Error: --offset must be a non-negative number\n");
        process.exit(EXIT.USAGE);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler(
          {
            webhook_id: webhookId,
            outcome: opts.outcome,
            event_type: opts.eventType,
            limit,
            offset,
          },
          { client },
        );
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx webhook redeliver <delivery_id>
  webhook
    .command("redeliver <delivery_id>")
    .description("Replay a stored webhook delivery (triggers a real outbound POST)")
    .action(async (deliveryId: string) => {
      const globals = globalOpts(program);
      const tool = registry["picx_redeliver_webhook"];
      if (!tool) return fail("Tool picx_redeliver_webhook not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ delivery_id: deliveryId }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
