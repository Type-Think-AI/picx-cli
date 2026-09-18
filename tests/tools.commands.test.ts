/**
 * tools.commands.test.ts — handler behaviour for the tools added in the
 * picx-ai 0.4.0 bring-up: templates (search/get) and the delivery-inspection /
 * redelivery tools. Uses a mock PicXClient — never hits the live API.
 */

import { describe, it, expect } from "vitest";
import { picx_search_templates, picx_get_template } from "../packages/tools/src/templates.js";
import {
  picx_generation_deliveries,
  picx_webhook_deliveries,
  picx_redeliver_webhook,
} from "../packages/tools/src/webhooks.js";

// ---------------------------------------------------------------------------
// Mock client factory — records the args each resource method was called with.
// ---------------------------------------------------------------------------

function makeCtx(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown> = {};
  const client = {
    baseUrl: "https://api.picxstudio.com/v1",
    templates: {
      list: async (params: unknown) => {
        calls.templatesList = params;
        return (
          (overrides.templatesList as unknown) ?? {
            templates: [
              { id: "tpl_1", title: "A", prompt: null, media_type: "image", topic: null, tags: [], target_model: null, preview_url: null, thumbnail_url: null, is_featured: false, likes: 3 },
            ],
            total: 42,
            limit: 30,
            offset: 0,
          }
        );
      },
      get: async (id: string) => {
        calls.templatesGet = id;
        return (
          (overrides.templatesGet as unknown) ?? {
            id,
            title: "A template",
            prompt: null,
            media_type: "image",
            topic: null,
            tags: ["cinematic"],
            target_model: "gemini-3.1-flash-image-preview",
            preview_url: null,
            thumbnail_url: null,
            is_featured: true,
            likes: 10,
          }
        );
      },
    },
    generations: {
      deliveries: async (id: string) => {
        calls.genDeliveries = id;
        return { deliveries: [{ id: "del_1", event_type: "generation.completed", retry_count: 0, created_at: "2026-09-18T00:00:00Z" }], total: 1 };
      },
    },
    webhooks: {
      deliveries: async (id: string, params: unknown) => {
        calls.whDeliveries = { id, params };
        return { deliveries: [], total: 0 };
      },
      redeliver: async (id: string) => {
        calls.whRedeliver = id;
        return { event_id: "evt_9", event_type: "generation.completed", outcome: "delivered", status_code: 200 };
      },
    },
  };
  return { ctx: { client } as any, calls };
}

// ---------------------------------------------------------------------------
// templates.search
// ---------------------------------------------------------------------------

describe("picx_search_templates", () => {
  it("passes only the provided filters to templates.list", async () => {
    const { ctx, calls } = makeCtx();
    await picx_search_templates.handler(
      { q: "sneaker", media_type: "video", tags: ["a", "b"], featured: true, limit: 50, offset: 10 },
      ctx,
    );
    expect(calls.templatesList).toEqual({
      q: "sneaker",
      media_type: "video",
      tags: ["a", "b"],
      featured: true,
      limit: 50,
      offset: 10,
    });
  });

  it("omits empty tag arrays rather than sending tags=[]", async () => {
    const { ctx, calls } = makeCtx();
    await picx_search_templates.handler({ tags: [] }, ctx);
    expect(calls.templatesList).not.toHaveProperty("tags");
  });

  it("flags total as an estimate and reports has_more when the page is full", async () => {
    const full = Array.from({ length: 30 }, (_, i) => ({ id: `tpl_${i}` }));
    const { ctx } = makeCtx({ templatesList: { templates: full, total: 999, limit: 30, offset: 0 } });
    const out = await picx_search_templates.handler({ limit: 30 }, ctx);
    expect(out.data.total_is_estimate).toBe(true);
    expect(out.data.has_more).toBe(true);
  });

  it("reports has_more false on a short page", async () => {
    const { ctx } = makeCtx({ templatesList: { templates: [{ id: "tpl_1" }], total: 999, limit: 30, offset: 0 } });
    const out = await picx_search_templates.handler({ limit: 30 }, ctx);
    expect(out.data.has_more).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// templates.get
// ---------------------------------------------------------------------------

describe("picx_get_template", () => {
  it("fetches by string id and returns the template", async () => {
    const { ctx, calls } = makeCtx();
    const out = await picx_get_template.handler({ template_id: "tpl_abc" }, ctx);
    expect(calls.templatesGet).toBe("tpl_abc");
    expect((out.data.template as any).id).toBe("tpl_abc");
  });

  it("surfaces a null prompt (premium/gated row) without erroring", async () => {
    const { ctx } = makeCtx();
    const out = await picx_get_template.handler({ template_id: "tpl_premium" }, ctx);
    expect((out.data.template as any).prompt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deliveries + redeliver
// ---------------------------------------------------------------------------

describe("picx_generation_deliveries", () => {
  it("calls generations.deliveries with the generation id", async () => {
    const { ctx, calls } = makeCtx();
    const out = await picx_generation_deliveries.handler({ generation_id: "gen_5" }, ctx);
    expect(calls.genDeliveries).toBe("gen_5");
    expect(out.data.total).toBe(1);
    expect(Array.isArray(out.data.deliveries)).toBe(true);
  });
});

describe("picx_webhook_deliveries", () => {
  it("passes only provided filters to webhooks.deliveries", async () => {
    const { ctx, calls } = makeCtx();
    await picx_webhook_deliveries.handler(
      { webhook_id: "wh_1", outcome: "failed", limit: 10 },
      ctx,
    );
    expect(calls.whDeliveries).toEqual({ id: "wh_1", params: { outcome: "failed", limit: 10 } });
  });
});

describe("picx_redeliver_webhook", () => {
  it("calls webhooks.redeliver with the delivery id and reports the outcome", async () => {
    const { ctx, calls } = makeCtx();
    const out = await picx_redeliver_webhook.handler({ delivery_id: "del_9" }, ctx);
    expect(calls.whRedeliver).toBe("del_9");
    expect(out.summary).toContain("delivered");
    expect(out.data.event_id).toBe("evt_9");
  });

  it("is not read-only (triggers an outbound delivery)", () => {
    expect(picx_redeliver_webhook.effect.readOnlyHint).toBe(false);
  });
});
