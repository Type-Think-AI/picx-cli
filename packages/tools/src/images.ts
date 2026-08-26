/**
 * Image generation and editing tools.
 *
 * Two ToolDef objects: picx_generate_image and picx_edit_image.
 * Both return ToolOutput with links[] populated from CDN URLs — never base64.
 */

import { z } from "zod";
import type { ToolDef, ToolOutput, ToolContext } from "./types.js";
import { ensureRemoteUrls } from "@picx-devkit/core";

// ---------------------------------------------------------------------------
// picx_generate_image
// ---------------------------------------------------------------------------

const generateInputSchema = {
  prompt: z.string().min(1).max(4000),
  model: z.string().optional(),
  size: z.enum(["1K", "2K", "4K"]).optional(),
  aspect_ratio: z
    .string()
    .regex(/^\d+:\d+$/)
    .optional(),
  n: z.number().int().min(1).max(10).optional(),
};

export const picx_generate_image: ToolDef<typeof generateInputSchema> = {
  name: "picx_generate_image",
  title: "Generate Image",
  description:
    "Generate one or more images from a text prompt using PicX. " +
    "Costs credits per image (amount depends on model and size). " +
    "Use for creating new images from scratch. Do NOT use for editing existing images — use picx_edit_image instead.",
  inputSchema: generateInputSchema,
  effect: { readOnlyHint: false },
  cost: { kind: "dynamic", note: "Cost depends on model and size. Check picx_list_models for pricing." },
  scope: "images:generate",
  cli: ["image"],
  async handler(args, ctx: ToolContext): Promise<ToolOutput> {
    const { client, progress, signal } = ctx;
    const n = (args.n as number | undefined) ?? 1;
    const prompt = args.prompt as string;
    const model = args.model as string | undefined;
    const size = args.size as "1K" | "2K" | "4K" | undefined;
    const aspect_ratio = args.aspect_ratio as string | undefined;

    // Fan out n>1 as parallel independent calls — each gets its own generation id.
    const requests = Array.from({ length: n }, (_, i) => {
      progress?.(`Generating image ${i + 1}/${n}…`, Math.round(((i) / n) * 100));
      return client.images.generate({
        prompt,
        ...(model ? { model } : {}),
        ...(size ? { size } : {}),
        ...(aspect_ratio ? { aspect_ratio } : {}),
      });
    });

    const results = await Promise.all(requests);

    // Each result is a single ImageResult with .url — collect into links.
    const links = results.map((res) => ({
      url: res.url,
      mimeType: "image/png",
    }));

    progress?.("Done", 100);

    return {
      summary: `Generated ${links.length} image${links.length !== 1 ? "s" : ""}.`,
      data: {
        generation_ids: results.map((r) => r.id),
        count: links.length,
        model: results[0]?.model,
      },
      links,
    };
  },
};

// ---------------------------------------------------------------------------
// picx_edit_image
// ---------------------------------------------------------------------------

const editInputSchema = {
  instruction: z.string().min(1).max(4000),
  image_urls: z.array(z.string()).min(1).max(5),
  model: z.string().optional(),
  size: z.enum(["1K", "2K", "4K"]).optional(),
};

export const picx_edit_image: ToolDef<typeof editInputSchema> = {
  name: "picx_edit_image",
  title: "Edit Image",
  description:
    "Edit one or more existing images according to an instruction. " +
    "Accepts https URLs or local file paths (local files are auto-uploaded). " +
    "Costs credits per edit. " +
    "Use for modifying, inpainting, or transforming existing images. Do NOT use for generating new images from scratch — use picx_generate_image instead.",
  inputSchema: editInputSchema,
  effect: { readOnlyHint: false },
  cost: { kind: "dynamic", note: "Cost depends on model and size." },
  scope: "images:edit",
  cli: ["image", "edit"],
  async handler(args, ctx: ToolContext): Promise<ToolOutput> {
    const { client, progress } = ctx;
    const instruction = args.instruction as string;
    const imageUrls = args.image_urls as string[];
    const model = args.model as string | undefined;
    const size = args.size as "1K" | "2K" | "4K" | undefined;

    // Resolve all inputs to https URLs — POST /v1/images/edit rejects data URIs.
    progress?.("Resolving image URLs…", 10);
    const resolvedUrls = await ensureRemoteUrls(imageUrls, client);

    progress?.("Editing…", 30);
    const result = await client.images.edit({
      instruction,
      image_urls: resolvedUrls,
      ...(model ? { model } : {}),
      ...(size ? { size } : {}),
    });

    // result is a single ImageResult with .url — no .images array.
    const links = [{
      url: result.url,
      mimeType: "image/png",
    }];

    progress?.("Done", 100);

    return {
      summary: `Edited ${resolvedUrls.length} image${resolvedUrls.length !== 1 ? "s" : ""}, produced 1 result.`,
      data: {
        generation_id: result.id,
        model: result.model,
        input_count: resolvedUrls.length,
        output_count: 1,
      },
      links,
    };
  },
};

// ---------------------------------------------------------------------------
// Default export — array for registry assembly
// ---------------------------------------------------------------------------

const imageTools: ToolDef[] = [picx_generate_image, picx_edit_image];
export default imageTools;
