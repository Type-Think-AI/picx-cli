/**
 * `picx whoami` — show authenticated identity.
 * `picx balance` — show credit balance.
 * `picx usage --period 7d|30d|90d` — show usage stats.
 * `picx tier` — show current subscription tier.
 *
 * Each command calls the appropriate tool and returns only its relevant slice.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerAccountCommands(program: Command): void {
  // picx whoami — identity only
  program
    .command("whoami")
    .description("Show authenticated user identity")
    .action(async () => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_account"];
      if (!tool) return fail("Tool picx_get_account not found in registry", globals);

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ fields: ["identity"] }, { client });

        // Project only identity fields
        const full = result.data as Record<string, unknown>;
        const projected = {
          id: full.id,
          email: full.email,
          name: full.name,
          role: full.role,
        };

        printResult(
          { summary: result.summary, data: projected, links: result.links },
          globals,
        );
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err, globals);
      }
    });

  // picx balance — credits only
  program
    .command("balance")
    .description("Show credit balance")
    .action(async () => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_account"];
      if (!tool) return fail("Tool picx_get_account not found in registry", globals);

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ fields: ["balance"] }, { client });

        // Project only balance fields
        const full = result.data as Record<string, unknown>;
        const projected = {
          credits_balance: full.credits_balance,
          credits_total_earned: full.credits_total_earned,
          credits_total_used: full.credits_total_used,
        };

        printResult(
          { summary: result.summary, data: projected, links: result.links },
          globals,
        );
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err, globals);
      }
    });

  // picx usage --period 7d|30d|90d — calls picx_get_usage
  program
    .command("usage")
    .option("--period <period>", "Time period: 7d, 30d, 90d", "30d")
    .description("Show credit usage for a period")
    .action(async (opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_usage"];
      if (!tool) return fail("Tool picx_get_usage not found in registry", globals);

      const validPeriods = ["7d", "30d", "90d"];
      if (!validPeriods.includes(opts.period)) {
        fail(
          `Invalid --period "${opts.period}". Must be one of: ${validPeriods.join(", ")}`,
          globals,
        );
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ period: opts.period }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err, globals);
      }
    });

  // picx tier — not yet available
  program
    .command("tier")
    .description("Show current subscription tier")
    .action(async () => {
      const globals = globalOpts(program);

      if (globals.json) {
        const envelope = {
          error: false,
          message: "Tier data is not yet available in the SDK (awaiting picx-ai v0.4.0).",
        };
        process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
      } else {
        process.stderr.write(
          "Note: tier data is not yet available in the SDK (awaiting picx-ai v0.4.0).\n",
        );
      }
      process.exit(EXIT.OK);
    });
}
