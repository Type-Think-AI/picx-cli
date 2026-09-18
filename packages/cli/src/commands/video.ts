/**
 * `picx video <prompt>` — generate a video.
 * `picx job <id>` — check generation job status, optionally poll.
 *
 * Delegates to picx_generate_video / picx_get_generation ToolDef handlers.
 */

import { Command } from "commander";
import { resolveClient, globalOpts } from "./helpers.js";
import { printResult, fail, EXIT } from "../output.js";
import { registry } from "@picx/tools";

export function registerVideoCommand(program: Command): void {
  // picx video <prompt>
  program
    .command("video")
    .argument("[prompt]", "Generation prompt (required for every mode except lipsync)")
    .option("--mode <mode>", "Generation mode: text, image, reference, frames, extend, lipsync, edit", "text")
    .option("--duration <seconds>", "Video duration in seconds")
    .option("--resolution <res>", "Output resolution: 480p, 720p, 1080p")
    .option("--sound", "Enable sound generation (default)")
    .option("--no-sound", "Disable sound generation")
    .option("--image <url>", "Seed image URL (mode image/edit)")
    .option("--reference <url...>", "Style reference image URL(s) (mode reference)")
    .option("--start-frame <url>", "Start frame image URL (mode frames)")
    .option("--end-frame <url>", "End frame image URL (mode frames, optional)")
    .option("--source-video <url>", "Source video URL (mode extend/lipsync/edit)")
    .option("--audio <url>", "Audio track URL (mode lipsync)")
    .description("Generate a video (7 modes; lipsync needs no prompt)")
    .action(async (prompt: string | undefined, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_generate_video"];
      if (!tool) return fail("Tool picx_generate_video not found in registry");

      if (globals.dryRun) {
        printResult(
          { summary: "Dry run — no credits spent", data: { cost: tool.cost, args: { prompt, mode: opts.mode } }, links: [] },
          globals,
        );
        process.exit(EXIT.OK);
      }

      try {
        const client = resolveClient(globals);
        const result = await tool.handler(
          {
            prompt,
            mode: opts.mode,
            duration: opts.duration ? Number(opts.duration) : undefined,
            resolution: opts.resolution,
            sound: opts.sound,
            image_url: opts.image,
            reference_urls: opts.reference,
            start_frame_url: opts.startFrame,
            end_frame_url: opts.endFrame,
            source_video_url: opts.sourceVideo,
            audio_url: opts.audio,
          },
          { client },
        );
        printResult(result, globals);
        process.exit(EXIT.OK);
      } catch (err) {
        fail(err);
      }
    });

  // picx job <id>
  program
    .command("job")
    .argument("<id>", "Generation job ID")
    .option("--watch", "Poll until job completes")
    .description("Check generation job status")
    .action(async (id: string, opts) => {
      const globals = globalOpts(program);
      const tool = registry["picx_get_generation"];
      if (!tool) return fail("Tool picx_get_generation not found in registry");

      try {
        const client = resolveClient(globals);

        if (opts.watch) {
          // Poll loop
          let result = await tool.handler({ generation_id: id }, { client });
          while (result.data.status === "pending" || result.data.status === "processing") {
            if (!globals.quiet) {
              process.stderr.write(`Status: ${result.data.status as string}… polling in 3s\n`);
            }
            await sleep(3000);
            result = await tool.handler({ generation_id: id }, { client });
          }
          printResult(result, globals);
          process.exit(result.data.status === "completed" ? EXIT.OK : EXIT.UPSTREAM);
        } else {
          const result = await tool.handler({ generation_id: id }, { client });
          printResult(result, globals);
          process.exit(EXIT.OK);
        }
      } catch (err) {
        fail(err);
      }
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
