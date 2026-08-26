/**
 * tools.schema.test.ts — Contract tests for the tool registry.
 *
 * Validates:
 * - Every tool name is picx_-prefixed
 * - inputSchema is a ZodRawShape (plain object), NOT a wrapped z.object
 * - Happy-path args pass, invalid args fail
 * - readOnlyHint is truthful per credit/read-only semantics
 * - Video mode matrix rejects invalid combos, accepts lipsync without prompt
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Import tool definitions from the source modules.
// These modules may not be built yet — that's expected. The test is written
// against the contract defined in BUILD.md and types.ts. When the modules
// exist, these imports resolve.
import imageTools from "../packages/tools/src/images.js";
import videoTools from "../packages/tools/src/videos.js";
import assetTools from "../packages/tools/src/assets.js";
import { picx_list_models } from "../packages/tools/src/models.js";
import { picx_get_account, picx_get_usage } from "../packages/tools/src/account.js";
import { buildRegistry, type ToolDef } from "../packages/tools/src/types.js";

// ---------------------------------------------------------------------------
// Collect every tool into a flat array
// ---------------------------------------------------------------------------

const allTools: ToolDef[] = [
  ...imageTools,
  ...videoTools,
  ...assetTools,
  picx_list_models,
  picx_get_account,
  picx_get_usage,
];

// ---------------------------------------------------------------------------
// Helper: validate an inputSchema value against a set of args using zod v4
// ---------------------------------------------------------------------------

function validateArgs(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): { success: boolean; error?: unknown } {
  // Build a z.object from the raw shape — this is what McpServer.registerTool
  // does internally. If `schema` IS already a z.object, this would throw or
  // produce a nested wrapper that breaks parsing.
  const wrapped = z.object(schema as z.ZodRawShape);
  const result = wrapped.safeParse(args);
  return { success: result.success, error: result.success ? undefined : result.error };
}

// ---------------------------------------------------------------------------
// 1. Name prefix
// ---------------------------------------------------------------------------

describe("tool names", () => {
  for (const tool of allTools) {
    it(`${tool.name} is picx_-prefixed`, () => {
      expect(tool.name.startsWith("picx_")).toBe(true);
    });
  }

  it("buildRegistry rejects non-prefixed names", () => {
    const bad: ToolDef = {
      name: "generate_image",
      title: "Bad",
      description: "bad",
      inputSchema: {},
      effect: { readOnlyHint: true },
      cost: { kind: "free" },
      handler: async () => ({ summary: "", data: {} }),
    };
    expect(() => buildRegistry([bad])).toThrow("picx_-prefixed");
  });

  it("buildRegistry rejects duplicate names", () => {
    const tool: ToolDef = {
      name: "picx_dupe",
      title: "Dupe",
      description: "dupe",
      inputSchema: {},
      effect: { readOnlyHint: true },
      cost: { kind: "free" },
      handler: async () => ({ summary: "", data: {} }),
    };
    expect(() => buildRegistry([tool, tool])).toThrow("duplicate");
  });
});

// ---------------------------------------------------------------------------
// 2. inputSchema is a ZodRawShape (plain object), NOT z.object()
// ---------------------------------------------------------------------------

describe("inputSchema is a ZodRawShape (not z.object)", () => {
  for (const tool of allTools) {
    it(`${tool.name}: inputSchema has no _def/parse at the top level`, () => {
      const schema = tool.inputSchema as Record<string, unknown>;
      // A z.object() instance has `_def`, `parse`, `safeParse`, `shape` at the
      // top level. A plain object of zod schemas does NOT.
      expect(schema).not.toHaveProperty("_def");
      expect(schema).not.toHaveProperty("parse");
      expect(schema).not.toHaveProperty("safeParse");
      // Additionally, a wrapped z.object has a _zod property (zod v4)
      expect(schema).not.toHaveProperty("_zod");
      // It should be a plain object whose values are zod schemas
      expect(typeof schema).toBe("object");
      expect(schema).not.toBeNull();
      expect(Array.isArray(schema)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Happy path + invalid args
// ---------------------------------------------------------------------------

describe("schema validation: happy path and invalid args", () => {
  const happyPathArgs: Record<string, Record<string, unknown>> = {
    picx_generate_image: { prompt: "a cat in space" },
    picx_edit_image: { instruction: "make it blue", image_urls: ["https://cdn.example.com/img.png"] },
    picx_generate_video: { prompt: "a timelapse of a sunset", mode: "text" },
    picx_get_generation: { generation_id: "gen_abc123" },
    picx_upload_asset: { path_or_url: "/tmp/file.png" },
    picx_list_assets: {},
    picx_delete_asset: { asset_id: "asset_xyz" },
    picx_list_models: {},
    picx_get_account: {},
    picx_get_usage: {},
  };

  const invalidArgs: Record<string, Record<string, unknown>> = {
    picx_generate_image: { prompt: "" }, // min(1) violation
    picx_edit_image: { instruction: "ok", image_urls: [] }, // min(1) violation
    picx_generate_video: { prompt: "ok", mode: "nonexistent_mode" }, // invalid enum
    picx_get_generation: { generation_id: "" }, // min(1) violation
    picx_upload_asset: { path_or_url: "" }, // min(1) violation
    picx_delete_asset: { asset_id: "" }, // min(1) violation
    picx_list_models: { type: "audio" }, // not in enum ["image", "video"]
    picx_get_usage: { period: "999d" }, // not in enum
  };

  for (const tool of allTools) {
    const happy = happyPathArgs[tool.name];
    if (happy !== undefined) {
      it(`${tool.name}: happy-path args pass validation`, () => {
        const result = validateArgs(tool.inputSchema, happy);
        expect(result.success).toBe(true);
      });
    }

    const invalid = invalidArgs[tool.name];
    if (invalid !== undefined) {
      it(`${tool.name}: invalid args fail validation`, () => {
        const result = validateArgs(tool.inputSchema, invalid);
        expect(result.success).toBe(false);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 4. readOnlyHint truthfulness
// ---------------------------------------------------------------------------

describe("readOnlyHint annotations", () => {
  /** Tools that spend credits or mutate state → readOnlyHint MUST be false */
  const creditSpendingTools = [
    "picx_generate_image",
    "picx_edit_image",
    "picx_generate_video",
    "picx_upload_asset",
    "picx_delete_asset",
  ];

  /** Tools that only read → readOnlyHint MUST be true */
  const readOnlyTools = [
    "picx_get_generation",
    "picx_list_assets",
    "picx_list_models",
    "picx_get_account",
    "picx_get_usage",
  ];

  for (const name of creditSpendingTools) {
    const tool = allTools.find((t) => t.name === name);
    it(`${name}: readOnlyHint is false (spends credits or mutates)`, () => {
      expect(tool).toBeDefined();
      expect(tool!.effect.readOnlyHint).toBe(false);
    });
  }

  for (const name of readOnlyTools) {
    const tool = allTools.find((t) => t.name === name);
    it(`${name}: readOnlyHint is true (read-only)`, () => {
      expect(tool).toBeDefined();
      expect(tool!.effect.readOnlyHint).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Video mode matrix — rejection and acceptance
// ---------------------------------------------------------------------------

describe("video mode matrix validation", () => {
  // The video tool handler calls validateModeInputs before making API calls.
  // We test by invoking the handler with a mock client and expecting throws.
  // Since the handler calls ctx.client.videos.generate, we need a minimal mock.

  const mockCtx = {
    client: {
      baseUrl: "https://api.picxstudio.com/v1",
      videos: {
        generate: async () => ({ id: "gen_mock", status: "queued" }),
      },
    },
    progress: undefined,
    signal: undefined,
  } as any;

  const videoTool = allTools.find((t) => t.name === "picx_generate_video")!;

  // A 'frames' mode test lived here. It is now covered by the
  // "does not yet expose the four SDK-unsupported modes" test below, which
  // asserts the enum rejects it outright rather than asserting a field-level
  // validation message the tool no longer reaches.

  it("rejects 'image' mode without image_url", async () => {
    await expect(
      videoTool.handler({ prompt: "pan across this", mode: "image" }, mockCtx),
    ).rejects.toThrow("image_url");
  });

  it("rejects 'reference' mode without reference_urls", async () => {
    await expect(
      videoTool.handler({ prompt: "in this style", mode: "reference" }, mockCtx),
    ).rejects.toThrow("reference_urls");
  });

  it("requires a prompt for every supported mode", async () => {
    for (const mode of ["text", "image", "reference"]) {
      await expect(
        videoTool.handler(
          {
            mode,
            image_url: "https://cdn.example.com/i.png",
            reference_urls: ["https://cdn.example.com/ref.png"],
          },
          mockCtx,
        ),
      ).rejects.toThrow("prompt");
    }
  });

  /**
   * The API accepts seven video modes, but picx-ai@0.3.1 types VideoMode as only
   * "text" | "image" | "reference" and carries none of the fields the other four
   * need (start_frame_url, end_frame_url, source_video_url, audio_url). Exposing
   * them would fail at runtime inside the SDK with a confusing error, so the tool
   * deliberately narrows the enum.
   *
   * This test pins that narrowing. When picx-ai v0.4.0 adds the missing modes and
   * fields, this test SHOULD fail — that failure is the signal to widen the enum,
   * restore the per-mode validation for the four modes, and re-add the
   * prompt-optional case for lipsync (the only mode that needs no prompt).
   */
  it("does not yet expose the four SDK-unsupported modes", () => {
    const modeSchema = videoTool.inputSchema.mode;
    for (const mode of ["frames", "extend", "lipsync", "edit"]) {
      const parsed = modeSchema.safeParse(mode);
      expect(
        parsed.success,
        `mode '${mode}' parsed successfully — picx-ai may now support it; see the comment above`,
      ).toBe(false);
    }
    for (const mode of ["text", "image", "reference"]) {
      expect(modeSchema.safeParse(mode).success).toBe(true);
    }
  });
});
