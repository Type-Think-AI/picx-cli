/**
 * PicX MCP Server factory.
 *
 * Constructs a McpServer instance with every tool, prompt, and resource from
 * @picx-devkit/tools registered. The single export is `createPicxMcpServer` —
 * call it with an API key and optionally a base URL, then connect a transport.
 *
 * @module
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { PicXClient, toUserMessage } from "@picx-devkit/core";
import {
  ALL_TOOLS,
  PROMPTS,
  RESOURCES,
} from "@picx-devkit/tools";
import type { ToolDef, ToolContext, ToolOutput } from "@picx-devkit/tools";
import type { PromptDef, ResourceDef } from "@picx-devkit/tools";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  apiKey: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Adapters — convert tool-layer shapes to MCP CallToolResult
// ---------------------------------------------------------------------------

interface CallToolResult {
  content: ContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "resource_link"; uri: string; name?: string; mimeType?: string };

function adaptOutput(output: ToolOutput): CallToolResult {
  const content: ContentBlock[] = [];

  // summary → text block
  if (output.summary) {
    content.push({ type: "text", text: output.summary });
  }

  // links → resource_link blocks (NEVER base64)
  if (output.links) {
    for (const link of output.links) {
      content.push({
        type: "resource_link",
        uri: link.url,
        ...(link.name && { name: link.name }),
        ...(link.mimeType && { mimeType: link.mimeType }),
      });
    }
  }

  return {
    content,
    // data → structuredContent (machine-readable payload)
    ...(output.data && Object.keys(output.data).length > 0 && {
      structuredContent: output.data,
    }),
  };
}

function adaptError(err: unknown): CallToolResult {
  // Execution error — isError: true, NEVER a JSON-RPC protocol error.
  const message = toUserMessage(err);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a configured PicX MCP server ready to connect to a transport.
 *
 * Usage:
 * ```ts
 * const server = createPicxMcpServer({ apiKey: "pxsk_..." });
 * await server.connect(transport);
 * ```
 */
export function createPicxMcpServer(opts: CreateServerOptions): McpServer {
  const client = new PicXClient({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });

  const server = new McpServer({
    name: "picx",
    version: "0.1.0",
    title: "PicX Studio",
  });

  // ─── Register tools ──────────────────────────────────────────────────────

  // The MCP SDK (v2.0.0) imports types from "zod/v4" while @picx-devkit/tools
  // uses the default "zod" entry (classic compat). At runtime both resolve to
  // the same zod 4.x shapes, but TypeScript sees them as incompatible:
  //   - MCP's local ZodRawShape = Record<string, z.ZodType> (from zod/v4)
  //   - Our ZodRawShape = Readonly<{ [k: string]: $ZodType }> (from zod compat)
  //   - $ZodType is the minimal interface; z.ZodType extends it with 42+ methods
  // Additionally the callback return type requires the SDK's CallToolResult
  // (which includes resultType/InputRequiredResult union), not our adapter type.
  //
  // Fix: cast the variadic arguments of the deprecated raw-shape overload.
  // The shapes ARE real ZodRawShape values — the SDK wraps them via z.object().

  for (const def of ALL_TOOLS) {
    (server.registerTool as Function)(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: {
          readOnlyHint: def.effect.readOnlyHint,
          ...(def.effect.destructiveHint !== undefined && {
            destructiveHint: def.effect.destructiveHint,
          }),
          ...(def.effect.idempotentHint !== undefined && {
            idempotentHint: def.effect.idempotentHint,
          }),
          ...(def.effect.openWorldHint !== undefined && {
            openWorldHint: def.effect.openWorldHint,
          }),
        },
      },
      async (args: Record<string, unknown>, _ctx: unknown) => {
        const toolCtx: ToolContext = {
          client,
          signal: undefined,
        };
        try {
          const output = await def.handler(args, toolCtx);
          return adaptOutput(output);
        } catch (err) {
          return adaptError(err);
        }
      },
    );
  }

  // ─── Register prompts ────────────────────────────────────────────────────

  // Same zod/v4 vs zod classic compat type mismatch as tools above.
  for (const prompt of PROMPTS) {
    (server.registerPrompt as Function)(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: prompt.argsSchema,
      },
      (args: Record<string, string>) => {
        return prompt.handler(args);
      },
    );
  }

  // ─── Register resources ──────────────────────────────────────────────────

  /**
   * Resolve a `picx://` resource URI to real data.
   *
   * An earlier draft called `client.sdk.get(uri)`, assuming the SDK exposed a
   * generic HTTP getter. It does not — `picx-ai` only offers typed resource
   * methods. So the URI scheme is dispatched explicitly here, which is better
   * anyway: an unknown URI now fails loudly instead of being forwarded verbatim
   * to an endpoint that would 404.
   */
  async function readResourceUri(href: string): Promise<unknown> {
    const url = new URL(href);
    if (url.protocol !== "picx:") {
      throw new Error(`unsupported resource scheme: ${url.protocol}`);
    }

    // new URL("picx://models") puts "models" in `hostname`, not `pathname`.
    const kind = url.hostname;

    if (kind === "models") {
      return await client.models.list();
    }

    if (kind === "assets") {
      const assetId = url.pathname.replace(/^\/+/, "").split("/")[0];
      if (!assetId) {
        throw new Error(`asset resource URI is missing an id: ${href}`);
      }
      return await client.assets.get(assetId);
    }

    throw new Error(`unknown picx resource: ${href}`);
  }

  for (const res of RESOURCES) {
    if (res.isTemplate && res.uriTemplate) {
      // Template-based resource (e.g. picx://assets/{id})
      const template = new ResourceTemplate(res.uriTemplate, { list: undefined });
      server.registerResource(
        res.name,
        template,
        res.config,
        async (uri, _params) => {
          const response = await readResourceUri(uri.href);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: res.config.mimeType ?? "application/json",
                text: JSON.stringify(response),
              },
            ],
          };
        },
      );
    } else if (res.uri) {
      // Static resource (e.g. picx://models)
      server.registerResource(
        res.name,
        res.uri,
        res.config,
        async (uri) => {
          const response = await readResourceUri(uri.href);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: res.config.mimeType ?? "application/json",
                text: JSON.stringify(response),
              },
            ],
          };
        },
      );
    }
  }

  return server;
}
