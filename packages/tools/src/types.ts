/**
 * The single tool contract shared by the MCP server and the CLI.
 *
 * A tool is defined ONCE here and mounted in three places — stdio MCP, remote
 * MCP on a Worker, and a CLI subcommand. That is the whole reason this package
 * exists: `picx generate` and `picx_generate_image` cannot drift if they are
 * literally the same object.
 *
 * `inputSchema` is a ZodRawShape — a PLAIN OBJECT of zod schemas, not
 * `z.object({...})`. `McpServer.registerTool` wraps it itself; passing an
 * already-wrapped object is the most common mistake against this SDK.
 * Verified against @modelcontextprotocol/server@2.0.0.
 */

import type { ZodRawShape } from "zod";
import type { PicXClient } from "@picx/core";

/** What a tool handler may do to the world. Mirrors MCP's ToolAnnotations. */
export type ToolEffect = {
  /** True only if the tool cannot change state and cannot spend credits. */
  readOnlyHint: boolean;
  /** True if the tool can destroy user data (delete asset, etc.). */
  destructiveHint?: boolean;
  /** True if calling twice with the same args is equivalent to calling once. */
  idempotentHint?: boolean;
  /** True if the tool reaches systems outside PicX. */
  openWorldHint?: boolean;
};

/** Credit cost declaration, so a caller can pre-flight affordability. */
export type ToolCost =
  | { kind: "free" }
  /** Cost depends on model+size and must be read from the live model config. */
  | { kind: "dynamic"; note: string }
  | { kind: "fixed"; credits: number };

export type ToolContext = {
  client: PicXClient;
  /** Emit progress. No-op on transports that cannot carry it. */
  progress?: (message: string, pct?: number) => void;
  signal?: AbortSignal;
};

/**
 * A tool's return value, transport-agnostic.
 *
 * Handlers return this shape; each mount point adapts it. The MCP adapter turns
 * `links` into resource links (NEVER base64 — that destroys the client's context
 * window), while the CLI adapter prints them or writes files.
 */
export type ToolOutput = {
  /** Human-readable summary. One or two lines. */
  summary: string;
  /** Machine payload. What `--json` prints and what MCP returns as structured content. */
  data: Record<string, unknown>;
  /** Produced media, as URLs. */
  links?: { url: string; mimeType?: string; name?: string }[];
};

/**
 * The tool definition.
 *
 * @typeParam S - the input shape; handler args are inferred from it.
 */
export type ToolDef<S extends ZodRawShape = ZodRawShape> = {
  /** MCP tool name, snake_case, `picx_` prefixed. e.g. `picx_generate_image`. */
  name: string;
  /** Short human title for clients that render one. */
  title: string;
  /**
   * Description the MODEL reads to decide whether to call this. Write it for a
   * model, not a human: say what it does, what it costs, and when NOT to use it.
   */
  description: string;
  inputSchema: S;
  effect: ToolEffect;
  cost: ToolCost;
  /** Required PicX API scope, if any. */
  scope?:
    | "images:generate"
    | "images:edit"
    | "videos:generate"
    | "audio:generate"
    | "agent:run"
    | "uploads:write";
  /** The CLI subcommand path that mounts this tool, e.g. ["image"] or ["image","edit"]. */
  cli?: string[];
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutput>;
};

/** A registry is just a name-keyed set of definitions. */
export type ToolRegistry = Record<string, ToolDef>;

/** Build a registry, failing loudly on duplicate names rather than silently overwriting. */
export function buildRegistry(defs: ToolDef[]): ToolRegistry {
  const out: ToolRegistry = {};
  for (const def of defs) {
    if (out[def.name]) {
      throw new Error(`duplicate tool name: ${def.name}`);
    }
    if (!def.name.startsWith("picx_")) {
      throw new Error(`tool name must be picx_-prefixed: ${def.name}`);
    }
    out[def.name] = def;
  }
  return out;
}
