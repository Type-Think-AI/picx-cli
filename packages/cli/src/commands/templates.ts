/**
 * `picx templates search [query]` — search/browse prompt templates.
 * `picx templates get <id>` — get a single template by ID.
 *
 * Delegates to picx_search_templates and picx_get_template ToolDef handlers.
 * The templates endpoint is public (no auth required), but we still resolve
 * a client for base URL and optional auth header.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerTemplatesCommand(program: Command): void {
  const templates = program
    .command("templates")
    .description("Browse and search PicX prompt templates");

  // picx templates search [query]
  templates
    .command("search [query]")
    .description("Search templates by keyword, category, media type, or tags")
    .option("--category <category>", "Filter by category slug")
    .option("--media-type <type>", "Filter by media type: image, video, audio")
    .option("--model <model>", "Filter by target model ID")
    .option("--featured", "Only show featured templates")
    .option("--tags <tags...>", "Filter by tags")
    .option("--limit <n>", "Results per page (1-100)", "10")
    .option("--page <n>", "Page number", "1")
    .action(async (query: string | undefined, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_search_templates"];
      if (!tool) return fail("Tool picx_search_templates not found in registry");

      try {
        const client = resolveClient(globals);
        const args: Record<string, unknown> = {
          limit: parseInt(opts.limit, 10),
          page: parseInt(opts.page, 10),
        };
        if (query) args.search = query;
        if (opts.category) args.category = opts.category;
        if (opts.mediaType) args.media_type = opts.mediaType;
        if (opts.model) args.target_model = opts.model;
        if (opts.featured) args.featured = true;
        if (opts.tags) args.tags = opts.tags;

        const result = await tool.handler(args, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx templates get <id>
  templates
    .command("get <id>")
    .description("Get a template by numeric ID")
    .action(async (id: string) => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_template"];
      if (!tool) return fail("Tool picx_get_template not found in registry");

      const numId = parseInt(id, 10);
      if (isNaN(numId) || numId < 1) {
        process.stderr.write("Error: template ID must be a positive integer\n");
        process.exit(EXIT.USAGE);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ template_id: numId }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
