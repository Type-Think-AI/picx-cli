/**
 * `picx upload <file...>` — upload one or more local files.
 * `picx assets list` — list uploaded assets.
 * `picx assets rm <id>` — delete an asset.
 *
 * Delegates to picx_upload_asset / picx_list_assets ToolDef handlers.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerAssetsCommand(program: Command): void {
  // picx upload <file...>
  program
    .command("upload")
    .argument("<files...>", "Local file paths to upload")
    .description("Upload files to PicX asset storage")
    .action(async (files: string[]) => {
      const globals = globalOpts(program);
      const tool = registry["picx_upload_asset"];
      if (!tool) return fail("Tool picx_upload_asset not found in registry");

      if (globals.dryRun) {
        printResult(
          { summary: "Dry run — upload skipped", data: { files, cost: tool.cost }, links: [] },
          globals,
        );
        process.exit(EXIT.OK);
      }

      try {
        const client = resolveClient(globals);
        const allLinks: { url: string; mimeType?: string; name?: string }[] = [];

        for (const file of files) {
          const result = await tool.handler({ file_path: file }, { client });
          if (result.links) allLinks.push(...result.links);
          if (!globals.quiet) {
            process.stderr.write(`Uploaded: ${file} → ${result.links?.[0]?.url ?? "(unknown)"}\n`);
          }
        }

        printResult(
          {
            summary: `Uploaded ${files.length} file(s)`,
            data: { uploaded: allLinks.map((l) => l.url) },
            links: allLinks,
          },
          globals,
        );
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx assets list | rm <id>
  const assets = program
    .command("assets")
    .description("Manage uploaded assets");

  assets
    .command("list")
    .description("List uploaded assets")
    .action(async () => {
      const globals = globalOpts(program);
      const tool = registry["picx_list_assets"];
      if (!tool) return fail("Tool picx_list_assets not found in registry");

      try {
        const client = resolveClient(globals);
        const result = await tool.handler({}, { client });
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  assets
    .command("rm")
    .argument("<id>", "Asset ID to delete")
    .description("Delete an asset")
    .action(async (id: string) => {
      const globals = globalOpts(program);

      if (globals.dryRun) {
        printResult(
          { summary: `Dry run — would delete asset ${id}`, data: { id }, links: [] },
          globals,
        );
        process.exit(EXIT.OK);
      }

      try {
        const client = resolveClient(globals);
        // Use the SDK directly; no dedicated ToolDef for delete
        await client.assets.delete(id);
        printResult(
          { summary: `Deleted asset ${id}`, data: { id, deleted: true } },
          globals,
        );
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });
}
