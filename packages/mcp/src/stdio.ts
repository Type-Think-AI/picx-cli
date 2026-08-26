/**
 * stdio entry point for the PicX MCP server.
 *
 * Resolves the API key via @picx/core config resolution (flag → env →
 * .picxrc → ~/.config/picx/config.json), then starts the server on stdio.
 *
 * HARD RULE: never write anything to stdout. stdout is the JSON-RPC transport
 * channel — a single stray byte corrupts the protocol stream. All diagnostics
 * go to stderr.
 *
 * @module
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { resolveConfig, redactKey } from "@picx/core";
import { createPicxMcpServer } from "./server.js";

/**
 * Main entry — called by the bin shim. Resolves config, starts stdio server.
 * Exits with code 2 if no API key is found (configuration error).
 */
export async function main(): Promise<void> {
  let config;
  try {
    config = resolveConfig();
  } catch {
    process.stderr.write(
      `[picx-mcp] ERROR: No PicX API key found.\n\n` +
        `Set one of:\n` +
        `  • PICX_API_KEY environment variable\n` +
        `  • .picxrc file in project root: {"apiKey": "pxsk_..."}\n` +
        `  • ~/.config/picx/config.json: {"apiKey": "pxsk_..."}\n` +
        `  • Get a key at https://ai.picxstudio.com/api\n\n` +
        `Get a key at https://picxstudio.com/console/api-keys\n`,
    );
    process.exit(2);
  }

  if (!config.apiKey) {
    process.stderr.write(
      `[picx-mcp] ERROR: No PicX API key found.\n\n` +
        `Set one of:\n` +
        `  • PICX_API_KEY environment variable\n` +
        `  • .picxrc file in project root: {"apiKey": "pxsk_..."}\n` +
        `  • ~/.config/picx/config.json: {"apiKey": "pxsk_..."}\n` +
        `  • Get a key at https://ai.picxstudio.com/api\n\n` +
        `Get a key at https://picxstudio.com/console/api-keys\n`,
    );
    process.exit(2);
  }

  process.stderr.write(
    `[picx-mcp] Starting PicX MCP server (key: ${redactKey(config.apiKey)}, env: ${config.env})\n`,
  );

  serveStdio(() => createPicxMcpServer({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  }));
}
