/**
 * `picx templates search [query]` — search/browse prompt templates.
 * `picx templates get <id>` — get a single template by ID.
 *
 * Delegates to picx_search_templates and picx_get_template ToolDef handlers,
 * which go through the picx-ai SDK's `templates` resource. Three catalogue
 * quirks are surfaced in the command help: `total` is an estimate (page until a
 * short page returns), the topic filter works but the topic field is always
 * null, and a null prompt marks a premium/gated row.
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
    .description("Search templates by keyword, media type, topic, tags, or model")
    .option("--media-type <type>", "Filter by media type: image or video")
    .option("--topic <topic>", "Filter by topic (filter works; topic field is always null)")
    .option("--model <model>", "Filter by target model ID")
    .option("--featured", "Only show featured templates")
    .option("--trending", "Only show trending templates")
    .option("--tags <tags...>", "Filter by tags (matched as a set)")
    .option("--limit <n>", "Page size (1-100, default 30)", "30")
    .option("--offset <n>", "Rows to skip (default 0). total is an estimate — page until a short page returns", "0")
    .action(async (query: string | undefined, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_search_templates"];
      if (!tool) return fail("Tool picx_search_templates not found in registry");

      const limit = parseInt(opts.limit, 10);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        process.stderr.write("Error: --limit must be a number between 1 and 100\n");
        process.exit(EXIT.USAGE);
      }
      const offset = parseInt(opts.offset, 10);
      if (isNaN(offset) || offset < 0) {
        process.stderr.write("Error: --offset must be a non-negative number\n");
        process.exit(EXIT.USAGE);
      }
      if (opts.mediaType && !["image", "video"].includes(opts.mediaType)) {
        process.stderr.write("Error: --media-type must be 'image' or 'video'\n");
        process.exit(EXIT.USAGE);
      }

      try {
        const client = resolveClient(globals);
        const args: Record<string, unknown> = { limit, offset };
        if (query) args.q = query;
        if (opts.mediaType) args.media_type = opts.mediaType;
        if (opts.topic) args.topic = opts.topic;
        if (opts.model) args.target_model = opts.model;
        if (opts.featured) args.featured = true;
        if (opts.trending) args.trending = true;
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
    .description("Get a template by ID (a null prompt means a premium/gated row)")
    .action(async (id: string) => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_template"];
      if (!tool) return fail("Tool picx_get_template not found in registry");

      if (!id || id.trim().length === 0) {
        process.stderr.write("Error: template ID is required\n");
        process.exit(EXIT.USAGE);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({ template_id: id }, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
