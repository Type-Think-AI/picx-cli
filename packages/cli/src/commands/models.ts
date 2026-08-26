/**
 * `picx models` — list available generation models.
 *
 * Delegates to picx_list_models ToolDef handler.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerModelsCommand(program: Command): void {
  program
    .command("models")
    .option("--type <type>", "Filter by type: image or video")
    .option("--json", "Output as JSON (inherits from global --json)")
    .description("List available generation models")
    .action(async (opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_list_models"];
      if (!tool) return fail("Tool picx_list_models not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ type: opts.type }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
