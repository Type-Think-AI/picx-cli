/**
 * `picx history` — list recent generations.
 *
 * Delegates to picx_list_generations ToolDef handler.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .option("--type <type>", "Filter by type: image or video")
    .option("--status <status>", "Filter by status: pending, completed, or failed")
    .option("--limit <n>", "Max results (1-50, default 20)")
    .option("--json", "Output raw JSON")
    .description("List recent generation history")
    .action(async (opts) => {
      const globals = globalOpts(program);

      const tool = registry["picx_list_generations"];
      if (!tool) return fail("Tool picx_list_generations not found in registry");

      // Validate --type
      if (opts.type && !["image", "video"].includes(opts.type)) {
        process.stderr.write("Error: --type must be 'image' or 'video'\n");
        process.exit(EXIT.USAGE);
      }

      // Validate --status
      if (opts.status && !["pending", "completed", "failed"].includes(opts.status)) {
        process.stderr.write("Error: --status must be 'pending', 'completed', or 'failed'\n");
        process.exit(EXIT.USAGE);
      }

      // Validate --limit
      const limit = opts.limit ? Number(opts.limit) : undefined;
      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 50)) {
        process.stderr.write("Error: --limit must be a number between 1 and 50\n");
        process.exit(EXIT.USAGE);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler(
          {
            type: opts.type,
            status: opts.status,
            limit,
          },
          { client },
        );
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
