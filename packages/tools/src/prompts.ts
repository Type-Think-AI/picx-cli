/**
 * MCP Prompts and Resources for PicX DevKit.
 *
 * Prompts guide models through multi-step PicX workflows.
 * Resources expose PicX data surfaces to MCP clients.
 *
 * `argsSchema` follows the same ZodRawShape convention as tools — a PLAIN
 * OBJECT of zod schemas, not `z.object({...})`. The SDK wraps it.
 * Verified against @modelcontextprotocol/server@2.0.0.
 */

import { z } from "zod";
import type { ZodRawShape } from "zod";

// ---------------------------------------------------------------------------
// Types — shaped for McpServer.registerPrompt / McpServer.registerResource
// ---------------------------------------------------------------------------

/** A single message in a prompt result. */
export type PromptMessage = {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
};

/** The value a prompt callback returns. */
export type PromptResult = {
  messages: PromptMessage[];
};

/**
 * Prompt definition.
 *
 * Shaped to feed:
 *   server.registerPrompt(name, { title?, description?, argsSchema }, cb)
 *
 * where `argsSchema` is a ZodRawShape (plain object of zod schemas).
 */
export type PromptDef<S extends ZodRawShape = ZodRawShape> = {
  /** Prompt name, namespaced. e.g. `picx:product_hero`. */
  name: string;
  /** Short human title for clients that render one. */
  title: string;
  /** Description the MODEL reads to decide whether to invoke this prompt. */
  description: string;
  /** Argument schema — a ZodRawShape, NOT z.object(). */
  argsSchema: S;
  /** The callback that produces prompt messages. */
  handler: (args: Record<string, string>) => PromptResult;
};

/**
 * Resource definition.
 *
 * Shaped to feed:
 *   server.registerResource(name, uriOrTemplate, config, cb)
 *
 * `uri` is a literal URI for static resources.
 * `uriTemplate` is a URI template string for dynamic resources (ResourceTemplate).
 */
export type ResourceDef = {
  /** Resource name for registration. */
  name: string;
  /** Literal URI (static) or URI template string (dynamic). Exactly one must be set. */
  uri?: string;
  uriTemplate?: string;
  /** Config passed as the third arg to registerResource. */
  config: {
    title?: string;
    description?: string;
    mimeType?: string;
  };
  /** Whether this is a template-based resource. */
  isTemplate: boolean;
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const productHeroPrompt: PromptDef = {
  name: "picx:product_hero",
  title: "Product Hero Image",
  description:
    "Guides the model through creating a product hero image: upload a reference, generate a hero shot, then produce 3 platform crops (1:1, 16:9, 9:16).",
  argsSchema: {
    product_url: z
      .string()
      .optional()
      .describe("URL of the product page or existing product image to use as reference"),
    product_image: z
      .string()
      .optional()
      .describe("Local file path or direct image URL of the product"),
    brand_notes: z
      .string()
      .optional()
      .describe("Optional brand guidelines, color palette, or style notes"),
  },
  handler(args) {
    const ref = args.product_url || args.product_image || "[product reference]";
    const brandClause = args.brand_notes
      ? `\n\nBrand notes to follow: ${args.brand_notes}`
      : "";

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are creating a product hero image for marketing. Follow these steps IN ORDER:

1. UPLOAD REFERENCE
   - Call picx_upload_asset with the product reference: ${ref}
   - Store the returned asset URL for the next step.

2. GENERATE HERO
   - Call picx_list_models to find an appropriate image generation model. Do NOT assume any model id exists — read the list.
   - Call picx_generate_image with the uploaded asset as the reference image. Use a prompt that places the product in an aspirational lifestyle context suitable for a landing page hero.${brandClause}
   - Store the hero image URL.

3. PRODUCE PLATFORM CROPS
   Generate 3 crops from the hero using picx_edit_image (or picx_generate_image with img2img if edit supports it):
   - 1:1 square (Instagram feed, app icon)
   - 16:9 landscape (website hero banner, YouTube thumbnail)
   - 9:16 portrait (Stories, Reels, TikTok)

   For each crop, pass the hero URL as the source image and request the target aspect ratio.

4. DELIVER RESULTS
   Return all 4 images (original hero + 3 crops) as resource links with labels indicating their aspect ratio and suggested platform use.

Important:
- Never fabricate a model id. Always call picx_list_models first.
- Never guess credit costs. The model listing includes pricing.
- All images must be returned as URLs, never base64.`,
          },
        },
      ],
    };
  },
};

export const thumbnailAbPrompt: PromptDef = {
  name: "picx:thumbnail_ab",
  title: "Thumbnail A/B Variants",
  description:
    "Generates N thumbnail variants for A/B testing on a given topic. Useful for YouTube, blog posts, or ad creatives.",
  argsSchema: {
    topic: z.string().describe("The subject or title for the thumbnails"),
    count: z
      .string()
      .default("8")
      .describe("Number of variants to generate (default 8)"),
  },
  handler(args) {
    const count = parseInt(args.count ?? "8", 10) || 8;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are generating ${count} thumbnail variants for A/B testing.

Topic: "${args.topic}"

Follow these steps IN ORDER:

1. PICK A MODEL
   - Call picx_list_models to see available image generation models.
   - Choose a model that supports fast generation at 16:9 or similar landscape aspect ratios.
   - Do NOT assume any model id exists. Read the returned list.

2. PLAN VARIANTS
   Devise ${count} distinct visual approaches. Vary these dimensions across the set:
   - Composition (close-up vs wide, centered vs rule-of-thirds)
   - Color temperature and dominant hue
   - Typography style emphasis (bold vs minimal, if text is included in prompt)
   - Emotional tone (curiosity, urgency, calm, excitement)
   - Background treatment (solid, gradient, contextual scene)

3. GENERATE ALL ${count} VARIANTS
   For each variant, call picx_generate_image with:
   - A unique prompt capturing that variant's visual strategy
   - Aspect ratio suitable for thumbnails (16:9 preferred)
   - The model id you selected in step 1

   Generate them sequentially. Label each with its variant number and strategy summary.

4. DELIVER RESULTS
   Present all ${count} thumbnails as resource links in a numbered list. For each, note:
   - Variant number
   - Visual strategy used
   - Suggested use case (e.g. "high-contrast — best for mobile feeds")

Important:
- Never fabricate a model id. Always use picx_list_models first.
- Never guess credit costs.
- Return images as URLs, never base64.`,
          },
        },
      ],
    };
  },
};

export const modelPickPrompt: PromptDef = {
  name: "picx:model_pick",
  title: "Model Picker",
  description:
    "Walks the model through selecting the best PicX model for a stated intent, querying live model data rather than assuming availability or pricing.",
  argsSchema: {
    intent: z
      .string()
      .describe("Free-text description of what you want to generate or accomplish"),
    budget_credits: z
      .string()
      .optional()
      .describe("Optional maximum credit budget for this generation"),
  },
  handler(args) {
    const budgetClause = args.budget_credits
      ? `\n\nBudget constraint: spend no more than ${args.budget_credits} credits per generation.`
      : "";

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You need to pick the best PicX model for this intent:

"${args.intent}"${budgetClause}

Follow these steps IN ORDER:

1. QUERY AVAILABLE MODELS
   - Call picx_list_models to get the full, live model catalogue.
   - Do NOT assume any model exists, has any particular capability, or costs any particular amount.
   - Read the complete response before deciding.

2. EVALUATE CANDIDATES
   For each model in the catalogue, assess:
   - Does it support the modality needed (image, video, audio)?
   - Does it support the required features (img2img, inpainting, style control, etc.)?
   - What are its resolution/aspect-ratio options?
   - What is its credit cost per generation?${args.budget_credits ? "\n   - Does it fit within the stated budget?" : ""}
   - What is its typical generation speed?

3. RECOMMEND
   Present your top 1-3 recommendations ranked by fit. For each:
   - Model id (exact, from the list)
   - Why it fits the stated intent
   - Credit cost per generation
   - Any limitations or trade-offs
   - Suggested parameters (aspect ratio, style preset, etc.)

4. CONFIRM
   State which single model you recommend as the best fit, and the exact parameters you would pass to the generation tool.

Important:
- NEVER fabricate or hardcode a model id. The only valid ids are those returned by picx_list_models.
- NEVER guess or state credit costs from memory. Use only the live data.
- If no model fits the intent well, say so rather than forcing a poor match.`,
          },
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export const modelsResource: ResourceDef = {
  name: "picx_models",
  uri: "picx://models",
  config: {
    title: "PicX Model Catalogue",
    description:
      "The full list of available PicX generation models with capabilities, pricing, and supported parameters. Returns JSON.",
    mimeType: "application/json",
  },
  isTemplate: false,
};

export const assetResource: ResourceDef = {
  name: "picx_asset",
  uriTemplate: "picx://assets/{id}",
  config: {
    title: "PicX Asset",
    description:
      "A single uploaded asset by id. Returns the asset metadata and access URL as JSON.",
    mimeType: "application/json",
  },
  isTemplate: true,
};

// ---------------------------------------------------------------------------
// Registries for easy bulk registration by the MCP server package
// ---------------------------------------------------------------------------

export const prompts: PromptDef[] = [
  productHeroPrompt,
  thumbnailAbPrompt,
  modelPickPrompt,
];

export const resources: ResourceDef[] = [modelsResource, assetResource];
