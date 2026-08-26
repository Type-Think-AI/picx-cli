# picx-cli

Generate and edit images and video from the terminal — or hand the same tools to an AI agent.

The CLI for [PicX Studio](https://picxstudio.com). Ships the `picx` binary.

> **v3 is a complete rewrite.** It shares no code with v2.x, which targeted a retired API host and no
> longer works. If you have v2 installed, `npm i -g picx-cli@latest` replaces it.

## Install

```bash
npm i -g picx-cli
```

Requires Node 20+.

## Authenticate

Get an API key at [ai.picxstudio.com/api](https://ai.picxstudio.com/api), then:

```bash
export PICX_API_KEY=pxsk_your_key
picx whoami
```

Config is resolved in this order — first hit wins:

1. `--api-key` flag
2. `PICX_API_KEY` / `PICX_API_URL` environment variables
3. `./.picxrc` (JSON, project-local)
4. `~/.config/picx/config.json`

## Generate

```bash
# an image
picx image "a cold brew can on wet slate, hard side light"

# pick a model, size and aspect
picx image "neon arcade at night" -m gemini-3-pro-image-preview -s 2K -a 16:9

# four variants, written to disk
picx image "minimal flat-lay coffee" -n 4 -o ./out

# edit — a LOCAL FILE works anywhere a URL does; it is uploaded for you
picx image edit "replace the background with a clean white studio" -i ./photo.jpg

# video (async — returns a job)
picx video "waves breaking over rocks, slow motion" --duration 8 --resolution 1080p
picx job gen_abc123 --watch
```

`picx image edit` accepts 1–5 reference images. The API rejects data URIs, so local paths are uploaded to
managed asset storage first and the resulting permanent CDN URL is used — you don't have to think about it.

## Commands

| Command | Does |
|---|---|
| `picx image <prompt>` | Text → image. `-m` `-s 1K\|2K\|4K` `-a 16:9` `-n` `-o` |
| `picx image edit <instruction>` | Edit 1–5 images. `-i <path\|url>` repeatable |
| `picx video <prompt>` | Text/image/reference → video. Returns a job |
| `picx job <id>` | Poll a generation. `--watch` streams progress |
| `picx upload <files...>` | Local file → permanent CDN URL |
| `picx assets list\|rm` | Manage uploaded assets |
| `picx models` | Model catalogue with live credit costs |
| `picx whoami` · `balance` · `usage` · `tier` | Account and quota |
| `picx mcp install` | Wire the MCP server into an AI client |
| `picx mcp doctor` | Diagnose a broken setup |

## Scripting and agents

Every command takes `--json`, and that is the intended mode for anything automated:

```bash
picx models --json | jq '.models[] | {id, name}'
picx image "hero shot" --quiet          # URLs only, one per line
picx image "hero shot" --dry-run        # print the credit cost, spend nothing
```

- **Machine payloads go to stdout, everything human goes to stderr** — so pipes stay clean.
- **Exit codes are contractual:** `0` ok · `1` usage · `2` auth · `3` insufficient credits ·
  `4` rate limited · `5` upstream · `6` timeout.

## Use it from an AI client

```bash
picx mcp install --client claude          # or claude-code, cursor, codex, vscode
picx mcp doctor
```

This writes the client's own config file, merging into any MCP servers you already have rather than
overwriting them. It backs up the file first. Add `--dry-run` to see the change without writing.

Under the hood that installs [`picx-mcp`](https://www.npmjs.com/package/picx-mcp), which exposes the same
operations as MCP tools. The CLI and the MCP server share one tool registry, so they cannot drift.

## Current limits

- **Video supports `text`, `image` and `reference` modes.** The API also has `frames`, `extend`, `lipsync`
  and `edit`, but the underlying `picx-ai` SDK does not yet carry their input fields. They are not exposed
  rather than exposed-and-broken.
- `picx tier` cannot report rate limits or the daily credit cap yet — the SDK has no endpoint for it. It
  reports what it can and does not guess.
- There is no `picx login` yet. Use `PICX_API_KEY`.

## Licence

MIT © Type-Think-AI
