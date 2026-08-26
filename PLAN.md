# PicX DevKit — MCP Server + CLI

**Goal:** a user connects PicX to Claude, Claude Code, Cursor, Codex or any MCP client and generates
images and video with their PicX credits, without touching an API key.

**Status:** plan. Nothing in this document is built yet.
**Author:** Alex · **Date:** 2026-08-26
**Reference target:** [higgsfield.ai/mcp](https://higgsfield.ai/mcp) and [higgsfield.ai/cli](https://higgsfield.ai/cli)

---

## 1. What Higgsfield actually ships

Worth being precise, because their product decisions are the bar we are being measured against.

| Piece | What they do | Why it matters to us |
|---|---|---|
| Remote MCP endpoint | One URL: `https://mcp.higgsfield.ai/mcp`. Paste into Claude → Customize → Connectors. | Streamable HTTP, **not** `/sse`. Our `src/data/mcp.ts` currently advertises `/sse` — legacy transport. |
| **No API key** | "Add the MCP server URL and authenticate through your Higgsfield account." | This is the whole UX win. It means they run an OAuth authorization server. We do not have one. |
| CLI as the Claude Code path | "If you are using Claude Code or Codex, it's better to use the CLI." `npm i -g @higgsfield/cli` → `higgsfield auth login` (browser) → `npx skills add higgsfield-ai/skills`. | Two products, one auth story. CLI is for agents living in a terminal; remote MCP is for hosted chat clients. |
| Skills catalog | ~7 named skills (UGC factory, Ad Multiplier, Faceless content, Website building, Stickman cartoon…) installed as a bundle, each with a duration estimate. | The skills are the marketing surface. Tools are plumbing; skills are what people click. |
| Deep links | Every skill card links to `claude.ai/new?q=<urlencoded prompt> with Higgsfield MCP`. | Zero-cost acquisition channel. Trivial for us to copy. |
| Async is explicit | "All generation runs asynchronously, so your agent polls for results." | They did not solve long-running-tool elegantly either. Polling is acceptable. |
| History as input | "Browse your full generation history, reference any past image as a starting point." | Requires a list-generations tool. **We have no `/v1` endpoint for this** (see §4). |
| Onboarding is a prompt | Step 1 is literally "copy and send this to Claude Code" — the install instructions are a prompt, not a doc. | Cheapest onboarding surface there is. Copy it. |

They ship 3 things: a remote MCP server, a CLI, and a skills bundle. All three share one account and one
credit pool. That is the shape to build.

---

## 2. Verified inventory — what PicX has today

Everything in this section was read from source, not assumed.

### 2.1 The `/v1` public plane — governed, API-key authed

`app/public_api/router.py` + `app/public_api/assets.py`, mounted at `/v1`.
Auth: `get_api_key_user` → `Authorization: Bearer pxsk_…`. Enforces **scopes, per-minute + per-day rate
limits, and a daily credit cap** from the tier table.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/images/generate` | Sync 200, **or** async 202 when `callback_url`/`webhook` present |
| POST | `/v1/images/edit` | Same dual contract. `image_urls`: 1–5, http/https only — **data URIs rejected** |
| POST | `/v1/videos/generate` | Always 202. Modes: `text·image·reference·frames·extend·lipsync·edit` |
| GET | `/v1/models` | Model catalog + credit costs |
| GET | `/v1/account/me` · `/usage` · `/tier` | Balance, usage, tier limits |
| GET | `/v1/generations/{id}` | Poll status |
| GET | `/v1/generations/{id}/events` | SSE progress stream |
| GET | `/v1/generations/{id}/deliveries` | Webhook delivery inspection |
| GET | `/v1/webhooks/{id}/deliveries` | Delivery history |
| POST | `/v1/webhooks/deliveries/{id}/redeliver` | Manual redelivery |
| POST | `/v1/assets` | **Managed upload** — local file → https URL. Required to make `edit` usable |
| GET · GET · DELETE | `/v1/assets` · `/{id}` · `/{id}` | Asset list / get / delete |

Scopes (`ALLOWED_SCOPES`): `images:generate`, `images:edit`, `videos:generate`, `audio:generate`,
`agent:run`, `uploads:write`.

### 2.2 The `/api` console plane — session authed

`app/api_platform/router.py`, mounted at `/api`. Key management, usage, request logs, webhook CRUD,
async generation, session-scoped assets. Uses `ApiKeyService.resolve_session_key_id` so a signed-in user's
console activity is attributed to an implicit session key with scopes
`["images:generate","images:edit","videos:generate"]`.

**This implicit-session-key mechanism is the single most reusable thing in the codebase for MCP OAuth.**
It already solves "authenticated user, no key they had to create."

### 2.3 The session plane — much wider than `/v1`

Albums, templates, moodboards, references, media, discovery, agent. All `Depends(get_current_user)`.

### 2.4 🔴 Governance gap — read this before designing anything

`app/auth/security.py:180` — `get_current_user` accepts `pxsk_` keys:

```python
if token.startswith("pxsk_"):
    user = await _resolve_user_from_api_key(token, session)
    if user:
        return user
```

`_resolve_user_from_api_key` resolves a `User` and caches it for 300s. It does **not** check scopes, does
**not** apply rate limits, does **not** apply the daily credit cap, and does **not** write a request log.

So an API key used against `/albums/*` or `/templates/*` bypasses every control that `/v1` enforces. This
is how `picx-cli@2.3.0` reaches albums and moodboards at all.

**Consequence for this project:** MCP tools and CLI commands must route through `/v1`, or through a new
governed endpoint. Reaching for the session plane because it has more features would ship an
ungoverned, unmetered, unlogged generation path to every Claude user we onboard. Flag for Nema as a
standalone security item — it exists today, independent of this work.

### 2.5 Auth surface

No OAuth **authorization server**. Grepped all of `app/` for `.well-known/oauth-authorization-server`,
dynamic client registration, `authorization_endpoint`, `code_challenge` — zero hits. Google OAuth exists
for *login* (we are an OAuth *client*), which is a different role. Remote MCP with the no-API-key UX
requires us to become an authorization server. **This is the largest single item in the plan.**

### 2.6 SDKs — reusable

| Package | Version | Shape |
|---|---|---|
| `picx-ai` (npm) | 0.3.1 | ESM+CJS via tsup, zero runtime deps, Node ≥20. Resources: `Images`, `Videos`, `Assets`, `Generations`, `Models`, `AccountResource`, `Webhooks`, plus a `GenerationJob` poller |
| `picx-ai` (PyPI) | 0.3.1 | Python ≥3.9 |

Zero runtime deps and a built-in job poller make the JS SDK an ideal foundation. The MCP server and CLI
should both be thin adapters over it, not re-implementations. `base_url` must include `/v1`.

### 2.7 `ai-ui` — pages exist, contents are aspirational

| File | State |
|---|---|
| `src/app/mcp/page.tsx` + `src/components/views/McpView.tsx` (304 lines) | Full setup page. ComingSoonBanner. FAQ honestly says "Not yet." |
| `src/data/mcp.ts` | `MCP_SERVER_URL = "https://mcp.picxstudio.com/sse"` — host does not resolve. 9 tools, of which `edit_chain`, `upscale`, `caption`, `brand_kit`, `publish` map to **nothing** |
| `src/data/cli.ts` | Extensive, and self-aware: header comment is a "PROVENANCE / ACCURACY WARNING" documenting its own inaccuracies. Credit table was corrected against live model config (marketing had understated by up to 2×) |
| `src/data/skills.ts` | 5 planned skills, correctly marked as never having run |
| `src/data/docs.ts` | 🔴 Documents `POST /v1/projects`, `/v1/shots`, `/v1/shots/{id}/takes`, `/v1/deliver`. **None exist.** |
| `content/docs/**` (17 real `.md` files) | Accurate. Includes `developer-tools/async-image-generation.md` |

Verified externally: `@picx/mcp` on npm → **404**. `mcp.picxstudio.com` → **does not resolve**.
`Type-Think-AI/picx-cli` repo → 200. `picx-cli` npm → v2.3.0, published 2026-04-15,
default `PICX_API_URL=https://new-api.picxstudio.com` → **403**.

---

## 3. Architecture

### 3.1 Decision: one monorepo, one tool registry, three delivery vehicles

The mistake to avoid is writing the tool definitions twice — once for stdio and once for the remote
server. Define them once; mount them in three places.

```
                       ┌──────────────────────────────┐
                       │  packages/core               │
                       │  config · auth · api client  │
                       │  (wraps picx-ai SDK)         │
                       └───────────┬──────────────────┘
                                   │
                       ┌───────────▼──────────────────┐
                       │  packages/tools              │
                       │  ONE tool registry:          │
                       │  name · schema · handler     │
                       └──┬──────────┬────────────┬───┘
                          │          │            │
              ┌───────────▼──┐  ┌────▼─────────┐  ┌▼──────────────┐
              │ packages/cli │  │ packages/mcp │  │ apps/mcp-edge │
              │ `picx` bin   │  │ stdio server │  │ CF Worker     │
              │ npm picx-cli │  │ npm picx-mcp │  │ remote HTTP   │
              └──────────────┘  └──────────────┘  └───────────────┘
                     │                 │                  │
              Claude Code        Cursor · local      Claude web ·
              Codex · scripts    stdio clients       Cowork · hosted
```

CLI commands are generated from the same registry, so `picx generate` and the `picx_generate_image` tool
cannot drift.

### 3.2 Decision: remote MCP runs on Cloudflare Workers, not FastAPI

| | CF Worker (chosen) | FastAPI mount |
|---|---|---|
| Reuses the TS SDK | ✅ | ❌ rewrite in Python |
| Shares registry with CLI | ✅ same code | ❌ second implementation |
| Deploy control | ✅ wrangler from CLI | ❌ Koyeb is dashboard-only — cannot deploy from an agent session |
| Cold start / latency at edge | ✅ | ⚠️ |
| Needs OAuth token storage | ⚠️ needs KV/DO | ✅ has the DB |
| Governance | ⚠️ must call `/v1`, cannot shortcut | ✅ inline |

Chosen: **Worker**, calling `https://api.picxstudio.com/v1` through `picx-ai`. The "must call `/v1`"
downside is actually the point — the Worker physically cannot reach the ungoverned session plane, so
§2.4 can't be reintroduced by accident.

The OAuth authorization server stays in FastAPI, where users, keys and credits live. Worker holds no
long-lived secret: it exchanges an OAuth access token for a scoped session key per request.

### 3.3 Decision: transport is Streamable HTTP at `/mcp`

Per MCP 2026-07-28: stateless, no `initialize` handshake, `server/discover` mandatory, results carry
`resultType: "complete" | "input_required"`. Roots/Sampling/Logging are deprecated — not adopted.

`MCP_SERVER_URL` changes from `https://mcp.picxstudio.com/sse` → `https://mcp.picxstudio.com/mcp`.
Keep a `/sse` alias returning 410 with a pointer, for anyone who copied the old page.

### 3.4 Repo

New repo `Type-Think-AI/picx-devkit`, public, MIT (matches SDK licensing and Higgsfield's public CLI repo).

```
picx-devkit/
├─ packages/
│  ├─ core/          config resolution · credential store · api client · errors · output fmt
│  ├─ tools/         tool registry (name, description, zod schema, handler)
│  ├─ cli/           `picx` binary → npm picx-cli@3.0.0
│  └─ mcp/           stdio server → npm picx-mcp
├─ apps/
│  └─ mcp-edge/      CF Worker → mcp.picxstudio.com
├─ skills/           SKILL.md bundles → npx skills add Type-Think-AI/picx-skills
├─ docs/             source of truth, synced into ai-ui/content/docs
└─ pnpm-workspace.yaml
```

pnpm + tsup + vitest + changesets, matching `picx-sdk-js`. Per house rule: **no lint/test gate in the
publish workflow.**

### 3.5 Decision: new codebase, same package name

Two separate decisions, conflated in earlier drafts of this section:

- **Code:** start from zero. `app/moodboards/` contains only `__pycache__` — the module was deleted — so
  ~18 of v2's commands target endpoints that no longer exist, on top of a default host that 403s and an
  architecture that depends on the ungoverned `pxsk_`-on-session-routes path from §2.4. Nothing is carried over.
- **Name:** keep `picx-cli`, ship `3.0.0`. Unpublishing would burn the version numbers without freeing
  them, block the name for 24h, and break existing lockfiles — see `PRD.md` §1.

| Package | npm status (checked 2026-08-26) |
|---|---|
| `picx-cli` → publish `3.0.0` | ours; latest `2.3.0`, maintainer `picx-stdio`, bin `picx` |
| `picx-mcp` | ✅ free |
| `picx` | 🔴 taken by a third party — unavailable |

Binary stays `picx`, unchanged from v2 — the one piece of continuity worth keeping.
Repo `Type-Think-AI/picx-cli` is **renamed** to `picx-devkit` (GitHub redirects permanently, so existing
links survive), not archived. Full cutover procedure in `PRD.md` §10.

---

## 4. MCP tool surface

Replaces the 9 fictional tools in `src/data/mcp.ts`. Naming follows `picx_verb_noun` (underscores —
better tolerated across clients than dots).

### Phase 1 — real today, no backend work

| Tool | Endpoint | Scope | Notes |
|---|---|---|---|
| `picx_list_models` | `GET /v1/models` | — | Cache 5 min. Agent picks model, or we pick |
| `picx_generate_image` | `POST /v1/images/generate` | `images:generate` | Sync. `prompt` ≤4000, `model?`, `size? 1K\|2K\|4K`, `aspect_ratio?` |
| `picx_edit_image` | `POST /v1/images/edit` | `images:edit` | `instruction`, `image_urls[1..5]` https only |
| `picx_upload_asset` | `POST /v1/assets` | `uploads:write` | **Load-bearing.** Edit rejects data URIs, so every "edit this local file" flow goes through here first |
| `picx_generate_video` | `POST /v1/videos/generate` | `videos:generate` | 202 → returns job handle |
| `picx_get_generation` | `GET /v1/generations/{id}` | — | Poll |
| `picx_list_assets` | `GET /v1/assets` | — | Reference prior work |
| `picx_get_account` | `GET /v1/account/me` + `/tier` | — | Balance + limits in one call, so the agent can pre-check affordability |

### Phase 2 — needs backend work (§6)

| Tool | Needs |
|---|---|
| `picx_list_generations` | 🔴 **No `GET /v1/generations` list endpoint exists.** Only `/api/generations` (session). Higgsfield's "browse your full history" is unbuildable without it |
| `picx_list_albums` / `picx_save_to_album` | Albums are session-plane only. Needs `/v1/albums` read+append |
| `picx_search_templates` | Templates are session-plane. Needs `/v1/templates` read |
| `picx_run_skill` | Skill runner (§5) |

### Prompts and resources

MCP prompts are underused by competitors and cheap for us:

- `picx:product_hero` — product URL → lit hero + 3 crops
- `picx:thumbnail_ab` — 8 thumbnail variants
- `picx:model_pick` — describe intent → recommended model + cost

Resources: `picx://models` (catalog), `picx://assets/{id}`. Return generated images as resource links
rather than base64 — Claude renders them and we don't blow the context window.

### Async handling — three layers

Images are sync (~5–20s) and need nothing. Video is the problem: minutes, and no MCP client will hold a
tool call open that long.

1. **Baseline — poll.** 202 returns `{id, status, poll_url}`; agent calls `picx_get_generation`.
   This is exactly what Higgsfield does, so it is competitively sufficient.
2. **Better — webhook + KV.** Worker registers itself as `callback_url`, verifies
   `X-PicX-Signature: t=…,v1=…`, writes the result to KV keyed by generation id.
   Poll then returns instantly instead of hitting the API. Correlate on the **`id` inside the signed
   body**, never a URL path param — the signature covers the body, not the URL.
   Envelope keys are `id` and `event`.
3. **Best — tasks extension.** `io.modelcontextprotocol/tasks` for genuine long-running semantics.
   Client support is thin; do it once clients catch up.

---

## 5. CLI surface

```bash
# auth
picx login                      # device-code flow, opens browser, no key pasting
picx logout
picx auth status                # who am I, which scopes, balance

# generate
picx generate "<prompt>" [-m model] [-s 1K|2K|4K] [-a 16:9] [-n 4] [-o ./out]
picx edit "<instruction>" -i <url|./file> [-s 2K]     # local files auto-upload via /v1/assets
picx video "<prompt>" [--mode text|image|frames|lipsync|extend] [--duration 8] [--resolution 720p]
picx job <id> [--watch]         # --watch consumes the SSE events stream

# assets / account
picx upload ./photo.png
picx assets list|get|delete
picx models [--json]
picx usage [--period 7d|30d|90d]
picx me

# agent integration
picx mcp install --client claude|cursor|claude-code|codex|vscode   # writes the client's config for them
picx mcp serve                  # stdio server, for a client that prefers spawning a process
picx skills install             # fetch the SKILL.md bundle

# ergonomics
--json                          # machine output on every command
--quiet                         # url-only, pipe-friendly
```

Design rules:

- **`--json` on everything.** v2 defaulted to Rich tables with opt-in JSON; that is backwards for the
  primary consumer, which is an agent.
- **Exit codes are contractual.** `0` ok · `1` usage · `2` auth · `3` insufficient credits ·
  `4` rate limited · `5` upstream. An agent can branch on these without parsing prose.
- **Local file paths accepted anywhere a URL is.** Auto-upload through `/v1/assets`. This one affordance
  removes the single sharpest edge in the current API.
- **`picx mcp install` writes the config.** Higgsfield makes users hand-edit
  `claude_desktop_config.json`. We shouldn't.

Distribution: `npm i -g picx-cli` (Node ≥20). Node, not Python: the client configs, the SDK, the Worker
and the skills bundle are all JS, and `npx` gives us zero-install invocation.

---

## 6. Backend work required in `web-app/api`

This is the part that cannot be done from the new repo.

### P0 — OAuth 2.1 authorization server (the no-API-key UX)

Without this, our setup instructions read "create an API key, copy it, paste it into a JSON file," and
Higgsfield's read "click Connect." That gap is the product.

New endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/oauth-authorization-server` | AS metadata (RFC 8414) |
| `GET /.well-known/oauth-protected-resource` | Resource metadata (RFC 9728) — how MCP clients discover the AS |
| `POST /oauth/register` | Dynamic client registration (RFC 7591) — MCP clients self-register |
| `GET /oauth/authorize` | Consent screen. Reuses existing Google login |
| `POST /oauth/token` | Code → token exchange, PKCE S256 **required** |
| `POST /oauth/revoke` | Revocation |
| `GET /oauth/device` + `POST /oauth/device/token` | Device-code flow for `picx login` |

Token → capability mapping: mint an access token bound to `(user_id, scopes, client_id)` and resolve it
server-side to the user's session key via the existing `resolve_session_key_id`. **The Worker never sees
a `pxsk_`.** Revoking the OAuth grant kills MCP access without touching the user's real keys.

Consent screen must show scopes in credit terms, not API terms: "Claude will be able to generate images
and video using your PicX credits (you have 4,600)."

### P1 — close the `/v1` gaps

- `GET /v1/generations` — paginated list, filters `type`, `status`, `since`. Blocks `picx_list_generations`.
- `GET /v1/albums` + `POST /v1/albums/{id}/items` — governed read/append so agent output lands in the
  user's album and shows up in the web app. Without it, MCP generations are invisible in the product.
- `GET /v1/templates` — governed template search.

### P2 — governance and attribution

- Close §2.4: make `_resolve_user_from_api_key` enforce scopes, rate limits, credit cap and request
  logging, or stop accepting `pxsk_` on session routes entirely. Coordinate with Nema; breaking change
  for `picx-cli@2.x`.
- Add `client_id` / `source` to request logs so we can report "credits spent via MCP vs console vs SDK."
  Needed for the Higgsfield-style "424k+ / 134%" usage numbers and for pricing decisions later.

---

## 7. `ai-ui` work

`ai-ui` is where this ships to users.

| File | Change |
|---|---|
| `src/data/mcp.ts` | Replace 9 fictional tools with the real Phase-1 list. `MCP_SERVER_URL` → `.../mcp`. Add `claude-code`, `codex`, `vscode` client snippets |
| `src/components/views/McpView.tsx` | Drop `ComingSoonBanner`. Add "Connect" deep link to `claude.ai/customize/connectors?modal=add-custom-connector`. Restore the tool switches **only if** a real policy endpoint exists — the code comment there is right that a switch writing nowhere is a defect |
| `src/data/cli.ts` | Rewrite against v3. Delete the provenance-warning block once accurate. Keep the corrected credit table — it is the only trustworthy pricing source in the repo |
| `src/data/docs.ts` | 🔴 Delete or rewrite `/v1/projects`, `/v1/shots`, `/v1/deliver`. Documenting endpoints that 404 is worse than documenting nothing |
| `src/data/skills.ts` | Point at real published skills |
| `content/docs/` | New: `developer-tools/mcp-server.md`, `developer-tools/cli.md`, `getting-started/connect-claude.md`, `developer-tools/skills.md` |
| New `/connect` route | One-screen client picker + copy-paste onboarding prompt, mirroring Higgsfield's step 1 |
| `src/app/mcp/page.tsx` FAQ | 9 answers currently say "not yet" — all need rewriting on launch, and the FAQPage JSON-LD must be updated in lockstep |

Also worth copying: `claude.ai/new?q=…` deep links on every skill card. Free distribution.

---

## 8. Skills catalog

The tools are commodity; the skills are the product. Ship as `Type-Think-AI/picx-skills`, installable
via `npx skills add Type-Think-AI/picx-skills`, per agentskills.io SKILL.md spec (frontmatter: `name`,
`description`, `license`, `compatibility`, `metadata`, `allowed-tools`; progressive disclosure;
`scripts/` + `references/`).

Launch set — chosen because each is achievable with Phase-1 tools only:

| Skill | Does | Tools |
|---|---|---|
| `product-hero` | Product photo → lit hero + 3 platform crops | upload · edit · generate |
| `thumbnail-ab` | 8 YouTube thumbnail variants, one grid contact sheet | generate ×8 |
| `social-pack` | One concept → 1:1, 9:16, 16:9 set | generate ×3 |
| `headshot-cleanup` | Selfie → studio headshot, background replaced | upload · edit |
| `catalog-refresh` | Folder of products re-shot on a new background | upload · edit, batched |
| `ugc-clip` | Still + script → short vertical video | generate · video · poll |

Each carries an honest duration and credit estimate. `catalog-refresh` and `ugc-clip` must state credit
cost up front — the daily credit cap is real (we hit the 6,000 ceiling during the Doodle AI image run)
and a skill that dies halfway through a 40-product catalogue is worse than one that refuses to start.

---

## 9. Security

| Risk | Mitigation |
|---|---|
| Prompt injection → credit drain | Per-session credit ceiling in the Worker, independent of the account cap. Ask before any call over N credits via `resultType: "input_required"` |
| §2.4 ungoverned key path | Worker only ever calls `/v1`. Fix the API path separately |
| Token leakage in client configs | OAuth tokens, not `pxsk_`. Short-lived access + refresh. Revocable per client |
| SSRF via `image_urls` | Already handled — `validate_public_url` + blocked hosts. Do not re-implement in the Worker |
| Webhook forgery | Verify `X-PicX-Signature` HMAC over `{timestamp}.{raw_body}`, reject skew >5 min |
| Public repo leaking secrets | Secret scan before first push, as with `doodle-ai` |
| Worker secrets | Cloudflare Secrets Store. **Secret must exist before the binding is added to `wrangler.json`** — error 10182 otherwise, and it blocks every later deploy including git-connected ones |

Full scan is Nema's — hand off before public launch.

---

## 10. Phases and effort

Estimates are engineering days for one person, excluding review and marketing.

### Phase 0 — Foundation · 2–3 d
Scaffold monorepo, `packages/core` (config, credential store, api client over `picx-ai`), CI, changesets.
**Exit:** `pnpm build` green, core unit-tested.

### Phase 1 — CLI core on API keys · 4–5 d
Tool registry + all status-**A** commands from `PRD.md` (F1 F2 F5 F10 F11 F16), `--json`, exit codes,
auto-upload of local paths, `picx mcp install`. Publish `picx-cli@3.0.0`, then deprecate `<3.0.0`.
**Exit:** end-to-end generate/edit/video/poll against `dev-api`, verified with a real key.

### Phase 2 — stdio MCP server · 3–4 d
`picx-mcp`, 8 Phase-1 tools, 3 prompts, 2 resources. Verified in Claude Desktop, Cursor, Claude Code.
**Exit:** `picx-mcp` published; tool call generates a real image from Claude Desktop.

### Phase 3 — OAuth authorization server · 6–8 d ⚠️ largest risk
FastAPI: AS + protected-resource metadata, DCR, authorize/consent, token, revoke, device flow.
Token → session-key resolution. Consent UI.
**Exit:** `picx login` completes in a browser with no key pasted; token revocation cuts access.
*Risk: this is the only phase where a wrong call is expensive to unwind. Consent scope model and token
lifetime should be reviewed before code.*

### Phase 4 — remote MCP Worker · 4–5 d
`mcp.picxstudio.com`, Streamable HTTP, OAuth-protected, webhook receiver + KV result cache, per-session
credit ceiling, observability.
**Exit:** paste one URL into Claude web → connect → generate. No API key anywhere.

### Phase 5 — `/v1` gap closure · 3–4 d
`GET /v1/generations`, `/v1/albums` read+append, `/v1/templates`. Wire `picx_list_generations`,
`picx_list_albums`, `picx_save_to_album`.
**Exit:** agent output appears in the user's album in the web app.

### Phase 6 — skills catalog · 4–5 d
6 skills, `picx-skills` repo, `npx skills add`, per-skill credit estimates.
**Exit:** `npx skills add` then a one-line prompt produces a finished product-hero set.

### Phase 7 — `ai-ui` launch surface · 3–4 d
Rewrite `mcp.ts` / `cli.ts` / `docs.ts` / `skills.ts`, drop ComingSoon banners, 4 new doc pages,
`/connect` route, `claude.ai/new` deep links, FAQ + JSON-LD.
**Exit:** `ai.picxstudio.com/mcp` describes something that works.

### Phase 8 — governance & attribution · 2–3 d
Close §2.4, add `client_id`/`source` to request logs, per-surface usage reporting.

| | Days |
|---|---|
| Minimum shippable (0,1,2,7-partial) | **12–16** |
| Full Higgsfield parity (0–7) | **29–38** |
| Including governance (0–8) | **31–41** |

### Two sequencing options

- **Ship API-key MCP first (Phases 0,1,2,7 ≈ 12–16 d).** Real product in ~3 weeks. Setup instructions
  say "paste your key" — worse UX than Higgsfield, but honest and it kills the ComingSoon banners.
  OAuth lands in a second release.
- **Wait for OAuth (Phases 0–4 ≈ 19–25 d).** Launch at parity, one URL and a Connect button.
  Nothing ships for ~5 weeks.

My recommendation: **the first.** Phase 3 is the riskiest work in the plan and putting it on the critical
path for the launch of everything else is how this becomes a project with no ship date. Phases 1–2 also
de-risk 3 by proving the tool surface before we bind an OAuth scope model to it.

---

## 11. Decisions needed before Phase 0

| # | Decision | My recommendation |
|---|---|---|
| 1 | Repo name | `picx-devkit`, public, MIT |
| 2 | Reuse v2 code or start clean | **Start clean.** Rename the repo to `picx-devkit`, orphan-branch `main`, keep `v2.3.0-final` tagged |
| 3 | Package names | Keep `picx-cli` → publish `3.0.0`. Sibling `picx-mcp`. Never unpublish — deprecate `<3.0.0` |
| 4 | MCP hostname | `mcp.picxstudio.com/mcp` |
| 5 | Ship API-key MCP first, or wait for OAuth | Ship first |
| 6 | Node or Python CLI | Node — everything else in the chain is JS |
| 7 | Fix §2.4 now or after launch | After launch, but before the public announcement |
| 8 | `src/data/docs.ts` fictional endpoints | Delete now, independent of this project |

---

## 12. Open questions I could not resolve from the code

1. **Video model catalog.** `/v1/models` returns models but I did not call it with a live key. Video mode
   × model compatibility (which models support `lipsync`, `extend`, `frames`) needs confirming before
   `picx_generate_video`'s schema is finalized.
2. **Credit costs per video mode.** The `cli.ts` credit table covers images only. Video pricing is needed
   for the pre-flight affordability check.
3. **Session-key scope breadth.** `SESSION_KEY_SCOPES` omits `uploads:write`, but `picx_upload_asset` is
   load-bearing for every edit flow. If OAuth resolves to a session key, that scope must be added or
   uploads will 403.
4. **Tier limits.** `max_credits_per_day` is read from a DB table I did not query. The per-session ceiling
   in the Worker should be a fraction of it, so I need the real number.
