/**
 * `picx generation deliveries <generation_id>` — list webhook delivery attempts
 * for one generation.
 *
 * The view that answers "my app never received the result" — covers registered
 * webhooks AND inline webhook:{url} / legacy callback_url targets. Delegates to
 * the picx_generation_deliveries ToolDef handler. (`picx job <id>` for status
 * and `picx history` for the list already live in video.ts / history.ts.)
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerGenerationCommand(program: Command): void {
  const generation = program
    .command("generation")
    .description("Inspect a generation's webhook deliveries");

  // picx generation deliveries <generation_id>
  generation
    .command("deliveries <generation_id>")
    .description("List webhook delivery attempts for a generation")
    .action(async (generationId: string) => {
      const globals = globalOpts(program);
      const tool = registry["picx_generation_deliveries"];
      if (!tool) return fail("Tool picx_generation_deliveries not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ generation_id: generationId }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
