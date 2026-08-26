# picx-mcp

An MCP server that hands [PicX Studio](https://picxstudio.com) image and video generation to any
MCP-compatible client — Claude Desktop, Claude Code, Cursor, Codex, VS Code.

Built on `@modelcontextprotocol/server` 2.0.0. Speaks protocol revision `2025-11-25` and negotiates
down to older revisions automatically.

## Quickest path

```bash
npm i -g picx-cli
picx mcp install --client claude    # writes the client config for you
picx mcp doctor                     # verify it
```

## Manual setup

Get an API key at [ai.picxstudio.com/api](https://ai.picxstudio.com/api), then add to your client's MCP
config:

```json
{
  "mcpServers": {
    "picx": {
      "command": "npx",
      "args": ["-y", "picx-mcp"],
      "env": { "PICX_API_KEY": "pxsk_your_key" }
    }
  }
}
```

Config file locations: Claude Desktop `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) · Claude Code `./.mcp.json` · Cursor `./.cursor/mcp.json` · VS Code `./.vscode/mcp.json`.

## Tools

| Tool | Does | Read-only |
|---|---|---|
| `picx_generate_image` | Text → image | no — spends credits |
| `picx_edit_image` | Edit 1–5 images by instruction | no |
| `picx_generate_video` | Text/image/reference → video, async | no |
| `picx_get_generation` | Poll a generation to completion | yes |
| `picx_upload_asset` | Local file → permanent CDN URL | no |
| `picx_list_assets` | Browse uploaded assets | yes |
| `picx_delete_asset` | Delete an asset | no — destructive |
| `picx_list_models` | Model catalogue with live credit costs | yes |
| `picx_get_account` | Identity and credit balance | yes |
| `picx_get_usage` | Usage over 7/30/90 days | yes |

Plus prompts `picx:product_hero`, `picx:thumbnail_ab`, `picx:model_pick`, and resources `picx://models`
and `picx://assets/{id}`.

Every tool declares its effect truthfully via MCP annotations, so a client can warn before a call that
spends credits or deletes something.

## Notes that will save you time

- **Images come back as resource links, never base64.** Inlining image bytes would consume the client's
  context window for no benefit.
- **Video is asynchronous.** `picx_generate_video` returns a job; the agent then polls
  `picx_get_generation`. No client holds a tool call open for minutes.
- **Editing a local file needs `picx_upload_asset` first.** The API rejects data URIs.
- **Credits are real.** Generation tools spend from your PicX balance, and a daily cap applies. Call
  `picx_get_account` to check the balance before a large batch.

## Environment

| Variable | Purpose |
|---|---|
| `PICX_API_KEY` | Required. Your `pxsk_` key |
| `PICX_API_URL` | Optional. Defaults to `https://api.picxstudio.com/v1` — the `/v1` suffix is mandatory |

Diagnostics go to stderr only; stdout carries the JSON-RPC stream and must stay clean.

## Current limits

Video exposes `text`, `image` and `reference`. The API also has `frames`, `extend`, `lipsync` and `edit`,
but the `picx-ai` SDK does not yet carry their input fields, so they are withheld rather than shipped
broken.

## Licence

MIT © Type-Think-AI
