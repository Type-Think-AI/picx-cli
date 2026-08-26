/**
 * `picx image <prompt>` — generate an image.
 * `picx image edit <instruction>` — edit existing image(s).
 *
 * Delegates to picx_generate_image / picx_edit_image ToolDef handlers.
 * Accepts local file paths anywhere a URL is accepted — the tool layer
 * handles upload via /v1/assets.
 */

import { Command } from "commander";
import { resolveClient, globalOpts, writeOutputFiles } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx-devkit/tools";

export function registerImageCommand(program: Command): void {
  const image = program
    .command("image")
    .argument("<prompt>", "Generation prompt")
    .option("-m, --model <model>", "Model to use")
    .option("-s, --size <size>", "Output size: 1K, 2K, 4K")
    .option("-a, --aspect-ratio <ratio>", "Aspect ratio, e.g. 16:9")
    .option("-n, --num <count>", "Number of images to generate", "1")
    .option("-o, --out <dir>", "Write files to this directory")
    .description("Generate an image from a text prompt")
    .action(async (prompt: string, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_generate_image"];
      if (!tool) return fail("Tool picx_generate_image not found in registry");

      if (globals.dryRun) {
        printResult(
          { summary: "Dry run — no credits spent", data: { cost: tool.cost, args: { prompt, ...stripUndefined(opts) } }, links: [] },
          globals,
        );
        process.exit(EXIT.OK);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler(
          {
            prompt,
            model: opts.model,
            size: opts.size,
            aspect_ratio: opts.aspectRatio,
            num_images: Number(opts.num),
          },
          { client },
        );
        if (opts.out && result.links?.length) {
          await writeOutputFiles(result.links, opts.out);
        }
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // Subcommand: picx image edit <instruction>
  image
    .command("edit")
    .argument("<instruction>", "Edit instruction")
    .option("-i, --image <path>", "Input image path or URL (repeatable, 1-5)", collect, [])
    .option("-m, --model <model>", "Model to use")
    .option("-s, --size <size>", "Output size: 1K, 2K, 4K")
    .description("Edit existing image(s) with an instruction")
    .action(async (instruction: string, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_edit_image"];
      if (!tool) return fail("Tool picx_edit_image not found in registry");

      if (!opts.image.length) {
        process.stderr.write("Error: at least one --image is required\n");
        process.exit(EXIT.USAGE);
      }
      if (opts.image.length > 5) {
        process.stderr.write("Error: at most 5 images allowed\n");
        process.exit(EXIT.USAGE);
      }

      if (globals.dryRun) {
        printResult(
          { summary: "Dry run — no credits spent", data: { cost: tool.cost, args: { instruction, images: opts.image } }, links: [] },
          globals,
        );
        process.exit(EXIT.OK);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler(
          {
            instruction,
            images: opts.image,
            model: opts.model,
            size: opts.size,
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

/** Commander repeatable option collector. */
function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

/** Strip keys with undefined values for clean payloads. */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
