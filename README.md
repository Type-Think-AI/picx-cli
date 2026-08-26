# PicX CLI & MCP Server

> Generate and edit images and video from the terminal — or hand the same tools to an AI agent via MCP.

[![npm picx-cli](https://img.shields.io/npm/v/picx-cli?label=picx-cli)](https://www.npmjs.com/package/picx-cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

The PicX command-line interface. 14 commands over the governed `/v1` API, designed so an AI agent can
drive it as comfortably as a human.

> **MCP server:** the TypeScript stdio server that briefly lived here is **retired**. The MCP server is
> being rebuilt in Python on FastMCP 4 as a hosted remote service at `mcp.picxstudio.com` — see
> [`docs/PLAN-MCP.md`](./docs/PLAN-MCP.md) and [`docs/MCP_ARCHITECTURE.md`](./docs/MCP_ARCHITECTURE.md).

## Install

```bash
npm i -g picx-cli
```

Requires Node 20+. Get an API key at [ai.picxstudio.com/api](https://ai.picxstudio.com/api).

```bash
export PICX_API_KEY=pxsk_your_key
picx whoami
```

## What you can do

### Generate images

```bash
picx image "a cold brew can on wet slate, hard side light"
picx image "neon arcade at night" -m gemini-3-pro-image-preview -s 2K -a 16:9
picx image "minimal flat-lay coffee" -n 4 --quiet     # 4 URLs, one per line
```

### Edit images

```bash
# A LOCAL FILE works anywhere a URL does — it is uploaded for you
picx image edit "replace the background with a clean white studio" -i ./photo.jpg
picx image edit "make it nighttime" -i https://cdn.picxstudio.com/api/generated/img.png
```

### Generate video

```bash
picx video "waves breaking over rocks, slow motion" --duration 8 --resolution 1080p
picx job gen_abc123 --watch     # poll until complete
```

### Browse 50K+ prompt templates

```bash
picx templates search "cinematic product"
picx templates search --category design --media-type video --limit 5
picx templates get 38599 --json
```

### Manage assets and account

```bash
picx upload ./photo.png         # → permanent CDN URL
picx assets list
picx models                     # 32 models with live credit pricing
picx balance                    # credits remaining
picx usage --period 30d
```

## All commands

| Command | Does |
|---|---|
| `picx image <prompt>` | Text → image. `-m` `-s 1K\|2K\|4K` `-a 16:9` `-n` `-o` `--quiet` |
| `picx image edit <instruction>` | Edit 1–5 images. `-i <path\|url>` repeatable |
| `picx video <prompt>` | Text/image/reference → video (async) |
| `picx job <id>` | Poll a generation. `--watch` streams progress |
| `picx upload <files...>` | Local file → permanent CDN URL |
| `picx assets list\|rm` | Manage uploaded assets |
| `picx models` | Model catalogue with live credit costs |
| `picx templates search [q]` | Search the 50K+ template catalogue |
| `picx templates get <id>` | Template detail with full prompt |
| `picx history` | List recent generations |
| `picx whoami` | Identity |
| `picx balance` | Credit balance |
| `picx usage` | Usage stats for a period |
| `picx tier` | Subscription tier info |
| `picx mcp install` | Wire the MCP server into a client |
| `picx mcp serve` | Start the stdio MCP server |
| `picx mcp doctor` | Diagnose a broken setup |

## For AI agents

Every command takes `--json` and that is the intended mode for automation:

```bash
picx models --json | jq '.models[] | {id, credits}'
picx image "hero shot" --quiet          # URLs only, one per line
picx image "hero shot" --dry-run        # credit cost without spending
```

**Design principles for agent consumption:**

- Machine payloads go to **stdout**, everything human goes to **stderr** — pipes stay clean
- Exit codes are contractual: `0` ok · `1` usage · `2` auth · `3` insufficient credits · `4` rate limited · `5` upstream · `6` timeout
- Errors in `--json` mode emit structured JSON: `{"error":true,"message":"...","code":"...","exit_code":N}`
- Local file paths accepted anywhere a URL is — auto-uploaded via `/v1/assets`
- Never logs or echoes an API key

## Architecture

```
picx-cli/
├─ packages/
│  ├─ core/       Config, /v1-pinned API client, error taxonomy, upload bridge
│  ├─ tools/      Tool registry — every command is a ToolDef
│  └─ cli/        Commander CLI (picx-cli on npm)
├─ tests/         Vitest, 97 passing, zero live API calls
└─ .github/       Version-gated publish workflow
```

`@picx/core` and `@picx/tools` are private workspace packages, bundled into `picx-cli` via tsup
`noExternal`. They never reach npm.

All traffic routes through `/v1`, the governed plane that enforces scopes, rate limits, the daily
credit cap and request logging. The client is pinned to `/v1` with no escape hatch.

## Configuration

Resolved in this order — first hit wins:

1. `--api-key` flag
2. `PICX_API_KEY` / `PICX_API_URL` environment variables
3. `./.picxrc` (JSON, project-local)
4. `~/.config/picx/config.json`

Default API: `https://api.picxstudio.com/v1`. Use `--env dev` for the staging API.

## Current limits

- **Video:** supports `text`, `image` and `reference` modes. The API also has `frames`, `extend`,
  `lipsync` and `edit`, but the underlying SDK doesn't carry their fields yet. They'll be added in a
  future release rather than shipped broken.
- **`picx tier`** cannot report rate limits — the SDK has no endpoint for it. Reports what it can.
- **`picx history`** — the backend endpoint (`GET /v1/generations`) does not exist yet. The command
  is wired but will return a 404 until the endpoint ships.
- No `picx login` yet. Use `PICX_API_KEY`.

## Development

```bash
git clone https://github.com/Type-Think-AI/picx-cli.git
cd picx-cli
pnpm install
pnpm exec tsc -b packages/core packages/tools packages/cli
pnpm exec vitest run    # 97 tests, all mocked — no credits spent
```

Build the publishable bundles:

```bash
pnpm -r --filter './packages/**' build
```

Test locally against prod:

```bash
export PICX_API_KEY=pxsk_your_key
node packages/cli/bin/picx.js image "test" --quiet
```

## Links

- [PicX Studio](https://picxstudio.com) — the product
- [Developer Console](https://ai.picxstudio.com) — API keys, docs, playground
- [picx-ai SDK (npm)](https://www.npmjs.com/package/picx-ai) — the underlying TypeScript SDK
- [picx-ai SDK (PyPI)](https://pypi.org/project/picx-ai/) — Python SDK

## Licence

MIT © [Type-Think-AI](https://github.com/Type-Think-AI)
