/**
 * Video generation + job polling tools.
 *
 * Owner: A3
 */

import { z } from "zod";
import type { ToolDef, ToolOutput, ToolContext } from "./types.js";

// ---------------------------------------------------------------------------
// SDK-supported modes (picx-ai@0.3.1)
// ---------------------------------------------------------------------------
// ⚠️  UNSUPPORTED MODES — DO NOT EXPOSE UNTIL SDK CARRIES THEM (target v0.4.0)
// ─────────────────────────────────────────────────────────────────────────────
// The PicX API itself accepts 7 modes: text, image, reference, frames, extend,
// lipsync, edit. However picx-ai@0.3.1 only exposes VideoCreateParams for
// THREE of them. The remaining four (frames, extend, lipsync, edit) require
// new fields (start_frame_url, end_frame_url, source_video_url, audio_url)
// that do not exist in the SDK's type surface. Exposing those modes here would
// let a caller construct a request that the SDK cannot serialize, producing a
// confusing runtime error rather than a clear type error.
//
// When picx-ai@0.4.0 ships with the extended VideoCreateParams, re-add:
//   - mode "frames"  → requires start_frame_url (+ optional end_frame_url)
//   - mode "extend"  → requires source_video_url
//   - mode "lipsync" → requires source_video_url + audio_url (prompt optional)
//   - mode "edit"    → requires source_video_url
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_MODES = ["text", "image", "reference"] as const;

type VideoMode = (typeof VIDEO_MODES)[number];

// ---------------------------------------------------------------------------
// Per-mode required-field validation
// ---------------------------------------------------------------------------

function validateModeInputs(
  mode: VideoMode,
  args: Record<string, unknown>,
): void {
  const has = (k: string) => {
    const v = args[k];
    return v !== undefined && v !== null && v !== "";
  };

  // prompt is required for ALL three supported modes
  if (!has("prompt")) {
    throw new Error(`mode '${mode}' requires 'prompt'.`);
  }

  switch (mode) {
    case "image":
      if (!has("image_url"))
        throw new Error("mode 'image' requires 'image_url'.");
      break;
    case "reference":
      if (!has("reference_urls"))
        throw new Error("mode 'reference' requires 'reference_urls'.");
      break;
    // 'text' mode only needs prompt (already validated above)
  }

  // Media URL format validation
  if (mode === "image") {
    const v = args["image_url"];
    if (typeof v === "string" && v.length > 0) {
      if (!/^https?:\/\//i.test(v)) {
        throw new Error("'image_url' must be an http:// or https:// URL.");
      }
    }
  }

  // reference_urls array entries
  const refs = args["reference_urls"];
  if (Array.isArray(refs)) {
    for (const u of refs) {
      if (typeof u === "string" && !/^https?:\/\//i.test(u)) {
        throw new Error(
          "All entries in 'reference_urls' must be http:// or https:// URLs.",
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// picx_generate_video
// ---------------------------------------------------------------------------

export const picxGenerateVideo: ToolDef = {
  name: "picx_generate_video",
  title: "Generate Video",
  description: [
    "Generate a video using PicX. Supports 3 modes: text (prompt-only), image",
    "(prompt + source image), reference (prompt + reference images).",
    "Always returns 202 with a job handle — the video is NOT ready",
    "immediately. Call picx_get_generation to poll for completion. Costs credits;",
    "the amount depends on model, duration, and resolution.",
  ].join(" "),
  inputSchema: {
    prompt: z.string().max(4000),
    model: z.string().max(100).optional(),
    mode: z
      .enum(["text", "image", "reference"])
      .default("text"),
    duration: z.number().int().min(1).max(60).default(5),
    resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
    aspect_ratio: z.string().max(10).optional(),
    sound: z.boolean().default(true),
    image_url: z.string().max(2048).optional(),
    reference_urls: z.array(z.string().max(2048)).max(10).optional(),
  },
  effect: { readOnlyHint: false },
  cost: { kind: "dynamic", note: "Depends on model, duration, and resolution" },
  scope: "videos:generate",
  cli: ["video"],

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
    const mode = (args.mode ?? "text") as VideoMode;

    // Pre-flight mode validation — fail fast before spending a request
    validateModeInputs(mode, args);

    // Build the request body, stripping undefined optionals
    const body: Record<string, unknown> = {
      prompt: args.prompt,
      mode,
      duration: args.duration ?? 5,
      resolution: args.resolution ?? "720p",
      sound: args.sound ?? true,
    };
    if (args.model) body.model = args.model;
    if (args.aspect_ratio) body.aspect_ratio = args.aspect_ratio;
    if (args.image_url) body.image_url = args.image_url;
    if (args.reference_urls) body.reference_urls = args.reference_urls;

    const res = await ctx.client.videos.create(body as any);

    const id = res.id ?? (res as any).generation_id;
    const baseUrl = ctx.client.baseUrl;

    return {
      summary: `Video generation queued (mode=${mode}, id=${id}). Poll picx_get_generation to check status.`,
      data: {
        id,
        status: res.status ?? "queued",
        poll_url: `${baseUrl}/generations/${id}`,
        events_url: `${baseUrl}/generations/${id}/events`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// picx_get_generation
// ---------------------------------------------------------------------------

export const picxGetGeneration: ToolDef = {
  name: "picx_get_generation",
  title: "Get Generation Status",
  description: [
    "Poll the status of a generation job (image or video). Returns the current",
    "status and, when the job reaches a terminal state (completed/failed), the",
    "result URLs. IMPORTANT: after calling picx_generate_video, the video is NOT",
    "immediately available — you MUST poll this endpoint until status is",
    "'completed' before presenting results to the user. Typical video generation",
    "takes 30-120 seconds.",
  ].join(" "),
  inputSchema: {
    generation_id: z.string().min(1),
  },
  effect: { readOnlyHint: true },
  cost: { kind: "free" },
  cli: ["job"],

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
    const id = args.generation_id as string;

    const res = await ctx.client.generations.get(id);

    const output: ToolOutput = {
      summary: `Generation ${id}: ${res.status}`,
      data: { ...res },
    };

    // Attach result link when terminal and output_url is available
    if (res.status === "completed" && res.output_url) {
      output.links = [{ url: res.output_url, mimeType: "video/mp4" }];
    }

    return output;
  },
};

// ---------------------------------------------------------------------------
// Default export — the registry array
// ---------------------------------------------------------------------------

const videoTools: ToolDef[] = [picxGenerateVideo, picxGetGeneration];
export default videoTools;
