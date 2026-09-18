/**
 * Video generation + job polling tools.
 *
 * Owner: A3
 */

import { z } from "zod";
import type { ToolDef, ToolOutput, ToolContext } from "./types.js";

// ---------------------------------------------------------------------------
// Video modes (picx-ai@0.4.0)
// ---------------------------------------------------------------------------
// The seven modes the PicX API accepts, authoritative from
// api/app/public_api/schemas.py: ^(text|image|reference|frames|extend|lipsync|edit)$.
// picx-ai@0.4.0 exposes VideoCreateParams fields for all of them
// (start_frame_url, end_frame_url, source_video_url, audio_url), so every mode
// is wired here. Per-mode required fields:
//   text      → prompt only
//   image     → prompt + image_url
//   reference → prompt + reference_urls
//   frames    → prompt + start_frame_url (end_frame_url optional)
//   extend    → prompt + source_video_url
//   lipsync   → source_video_url + audio_url (prompt NOT required)
//   edit      → prompt + source_video_url + image_url

const VIDEO_MODES = [
  "text",
  "image",
  "reference",
  "frames",
  "extend",
  "lipsync",
  "edit",
] as const;

type VideoMode = (typeof VIDEO_MODES)[number];

// ---------------------------------------------------------------------------
// Per-mode required-field validation
// ---------------------------------------------------------------------------
// Mirrors the server rules so a malformed call fails fast with a clear message
// before a request is spent, rather than surfacing as a 422.

function validateModeInputs(
  mode: VideoMode,
  args: Record<string, unknown>,
): void {
  const has = (k: string) => {
    const v = args[k];
    return v !== undefined && v !== null && v !== "";
  };
  const requireUrl = (k: string) => {
    if (!has(k)) throw new Error(`mode '${mode}' requires '${k}'.`);
    const v = args[k];
    if (typeof v === "string" && !/^https?:\/\//i.test(v)) {
      throw new Error(`'${k}' must be an http:// or https:// URL.`);
    }
  };

  // prompt is required for EVERY mode except lipsync, whose spoken content
  // comes from audio_url.
  if (mode !== "lipsync" && !has("prompt")) {
    throw new Error(`mode '${mode}' requires 'prompt'.`);
  }

  switch (mode) {
    case "image":
      requireUrl("image_url");
      break;
    case "reference":
      if (!has("reference_urls"))
        throw new Error("mode 'reference' requires 'reference_urls'.");
      break;
    case "frames":
      requireUrl("start_frame_url");
      // end_frame_url is optional; validate its format only if present.
      if (has("end_frame_url")) requireUrl("end_frame_url");
      break;
    case "extend":
      requireUrl("source_video_url");
      break;
    case "lipsync":
      requireUrl("source_video_url");
      requireUrl("audio_url");
      break;
    case "edit":
      requireUrl("source_video_url");
      requireUrl("image_url");
      break;
    // 'text' mode only needs prompt (already validated above)
  }

  // reference_urls array entries must all be http(s) URLs.
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
    "Generate a video using PicX. Supports 7 modes: text (prompt-only), image",
    "(prompt + image_url), reference (prompt + reference_urls), frames (prompt +",
    "start_frame_url, optional end_frame_url), extend (prompt + source_video_url),",
    "lipsync (source_video_url + audio_url, NO prompt required), and edit (prompt +",
    "source_video_url + image_url). Always returns 202 with a job handle — the video",
    "is NOT ready immediately. Call picx_get_generation to poll for completion. Costs",
    "credits; the amount depends on model, duration, and resolution.",
  ].join(" "),
  inputSchema: {
    prompt: z.string().max(4000).optional().describe(
      "Text prompt. Required for every mode except 'lipsync', where the spoken content comes from audio_url.",
    ),
    model: z.string().max(100).optional(),
    mode: z
      .enum(["text", "image", "reference", "frames", "extend", "lipsync", "edit"])
      .default("text"),
    duration: z.number().int().min(1).max(60).default(5),
    resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
    aspect_ratio: z.string().max(10).optional(),
    sound: z.boolean().default(true),
    image_url: z.string().max(2048).optional().describe(
      "Seed image URL. Required for mode 'image' and mode 'edit'.",
    ),
    reference_urls: z.array(z.string().max(2048)).max(10).optional().describe(
      "Style/character reference image URLs. Required for mode 'reference'.",
    ),
    start_frame_url: z.string().max(2048).optional().describe(
      "First-frame image URL. Required for mode 'frames'.",
    ),
    end_frame_url: z.string().max(2048).optional().describe(
      "Last-frame image URL. Optional for mode 'frames'.",
    ),
    source_video_url: z.string().max(2048).optional().describe(
      "Source clip URL. Required for modes 'extend', 'lipsync', and 'edit'.",
    ),
    audio_url: z.string().max(2048).optional().describe(
      "Audio track URL to drive the lips. Required for mode 'lipsync'.",
    ),
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
      mode,
      duration: args.duration ?? 5,
      resolution: args.resolution ?? "720p",
      sound: args.sound ?? true,
    };
    // prompt is optional for lipsync; only send it when provided.
    if (args.prompt) body.prompt = args.prompt;
    if (args.model) body.model = args.model;
    if (args.aspect_ratio) body.aspect_ratio = args.aspect_ratio;
    if (args.image_url) body.image_url = args.image_url;
    if (args.reference_urls) body.reference_urls = args.reference_urls;
    if (args.start_frame_url) body.start_frame_url = args.start_frame_url;
    if (args.end_frame_url) body.end_frame_url = args.end_frame_url;
    if (args.source_video_url) body.source_video_url = args.source_video_url;
    if (args.audio_url) body.audio_url = args.audio_url;

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
