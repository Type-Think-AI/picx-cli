/**
 * `picx whoami` — show authenticated identity.
 * `picx balance` — show credit balance.
 * `picx usage --period 7d|30d|90d` — show usage stats.
 * `picx tier` — show current subscription tier.
 *
 * Delegates to picx_get_account ToolDef handler.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerAccountCommands(program: Command): void {
  // picx whoami
  program
    .command("whoami")
    .description("Show authenticated user identity")
    .action(async () => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_account"];
      if (!tool) return fail("Tool picx_get_account not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ fields: ["identity"] }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx balance
  program
    .command("balance")
    .description("Show credit balance")
    .action(async () => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_account"];
      if (!tool) return fail("Tool picx_get_account not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ fields: ["balance"] }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx usage --period 7d|30d|90d
  program
    .command("usage")
    .option("--period <period>", "Time period: 7d, 30d, 90d", "30d")
    .description("Show credit usage for a period")
    .action(async (opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_account"];
      if (!tool) return fail("Tool picx_get_account not found in registry");

      const validPeriods = ["7d", "30d", "90d"];
      if (!validPeriods.includes(opts.period)) {
        process.stderr.write(`Error: --period must be one of ${validPeriods.join(", ")}\n`);
        process.exit(EXIT.USAGE);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ fields: ["usage"], period: opts.period }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx tier
  program
    .command("tier")
    .description("Show current subscription tier")
    .action(async () => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_account"];
      if (!tool) return fail("Tool picx_get_account not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ fields: ["tier"] }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
