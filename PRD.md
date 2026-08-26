# PicX DevKit — Feature PRD

**Product:** PicX CLI + PicX MCP server — a from-scratch developer/agent surface for the PicX Studio platform.
**Status:** PRD for review. Nothing built.
**Author:** Alex · **Date:** 2026-08-26
**Companion:** `PLAN.md` (architecture, phasing, effort). This document is the **feature catalog** — what
it does. `PLAN.md` is how it's built.

---

## 1. Decision: new codebase, same package name

Two orthogonal decisions, conflated in an earlier draft of this document:

1. **Codebase — start from zero.** No source, no structure, no command definitions carried over.
2. **Package name — keep `picx-cli`.** Ship it as `3.0.0`, a semver major.

`picx-cli@2.3.0` is not a starting point for *code*. Verified:

| Evidence | Consequence |
|---|---|
| Default host `PICX_API_URL=https://new-api.picxstudio.com` → **403** | Every command fails out of the box |
| Last publish **2026-04-15**, last repo push **2026-06-14** | Predates async image webhooks, `/v1` delivery inspection, tier endpoint |
| `app/moodboards/` contains **only `__pycache__`** — module deleted | `picx moodboards {list,get,create,update,delete,discover,featured,shared,share,like,unlike,clone,templates,albums,add-*,remove-*}` — ~18 commands — target endpoints that no longer exist |
| Reaches albums/templates through the **ungoverned** `pxsk_`-on-session-routes path | Its architecture depends on a security gap we intend to close |
| Ships a `SKILL.md` claiming JSON-by-default; actual default is Rich tables | Wrong default for the primary consumer (agents) |

But the *name* is good and there is no better one available, so it stays.

### Why not unpublish

npm mechanics make unpublishing strictly worse than superseding:

- **Version numbers are burned permanently.** npm never allows republishing an unpublished
  `name@version`. Removing `2.3.0` does not free `2.3.0`. Nothing is reclaimed.
- **Unpublishing a whole package blocks the name for 24 hours.** We would be locked out of publishing
  `3.0.0` for a day, for no gain.
- **It breaks lockfiles.** 10 downloads in the last month (0 last week) means something still installs it.
  Today those users get a CLI that installs and then 403s. After an unpublish they get a failed install.
  Strictly more damage.
- **`npm deprecate` is the designed tool**, and it takes a semver range, so 2.x can be deprecated without
  touching 3.x.

Unpublish *is* technically permitted here (0 downloads last week, well under the 300/week ceiling, single
maintainer, no dependents) — it just buys nothing and costs a day.

### Package names (npm availability checked 2026-08-26)

| Name | Status | Use |
|---|---|---|
| `picx-cli` | ours, latest `2.3.0`, maintainer `picx-stdio`, bin `picx` | **CLI → publish `3.0.0`** |
| `picx-mcp` | ✅ free | **MCP server** |
| `picx` | 🔴 taken by a third party | unavailable |
| `@picx/cli`, `@picx/mcp` | free | fallback only |

Unscoped `picx-mcp` over scoped `@picx/mcp`: it matches `picx-cli` stylistically and avoids having to
claim an npm org scope at all. Binary stays `picx`, unchanged from v2 — the one piece of continuity
worth keeping, since it is what users type and what agents put in `SKILL.md`.

🔴 **Prerequisite:** publishing `3.0.0` requires the **`picx-stdio`** npm account, the sole maintainer. If
access to it is lost, the name cannot be republished without npm support intervention. Confirm access
before Release 0.1 work starts.

### Repository: rename, don't archive

Rename `Type-Think-AI/picx-cli` → `Type-Think-AI/picx-devkit`. GitHub issues a permanent redirect for
renamed repos, for both web URLs and git remotes, so every existing link keeps working —
`web-app/README.md`, `ai-ui/src/data/cli.ts` (`CLI_REPO_URL`), the npm `repository` field and the
package homepage. Archiving and creating a fresh repo would break all of them and discard the repo's
history and its 1 star for no benefit.

Repo state before the rename: 1 star, 0 forks, 0 open issues, 0 watchers, no license set (despite the
README claiming MIT — fix that on the way through).

Code is replaced wholesale via an orphan branch, so `main` carries **no** v2 code in its history, while
`v2.3.0-final` remains tagged and reachable for reference. Procedure in §10.

---

## 2. Goals / non-goals

**Goals**

1. Any MCP client (Claude web + Desktop, Claude Code, Cursor, Codex, VS Code, OpenClaw, Hermes) can create
   PicX images and video against the user's own credits.
2. A terminal user or a shell-driven agent gets the same capabilities with predictable machine output.
3. One tool definition, three delivery vehicles — CLI, stdio MCP, remote MCP — cannot drift.
4. Every generation is metered, scoped, rate-limited and logged. No ungoverned path ships.

**Non-goals for v1**

- Replacing the web app. The CLI is not a browsing UI.
- Billing/checkout. `/dodo/*` (18 endpoints) is out of scope — buying credits stays on the web.
- Admin operations. `admin-cli` (`picx-admin`) keeps that job; no overlap.
- Team/workspace management. Not modelled in the API yet.
- Local model execution. Everything routes through the platform.

---

## 3. Complete service inventory

Every row read from source in `/Users/yash/Projects/picx/web-app/api`. **Plane** determines governance:

- **`/v1`** — API-key authed, enforces scopes + rate limits + daily credit cap + request logging.
- **session** — `Depends(get_current_user)`. Accepts `pxsk_` keys, but via
  `_resolve_user_from_api_key`, which applies **no scope check, no rate limit, no credit cap, no request
  log**. Using this plane from the CLI/MCP would ship an unmetered generation path.
- **public** — no auth.

| # | Domain | Route surface | Plane | Endpoints |
|---|---|---|---|---|
| 1 | Image generation | `POST /v1/images/generate` · `/edit` | `/v1` | 2 |
| 2 | Video generation | `POST /v1/videos/generate` — modes `text·image·reference·frames·extend·lipsync·edit` | `/v1` | 1 |
| 3 | Models | `GET /v1/models` · `GET /api/v1/config/models` (public, Redis-cached — authoritative pricing) | `/v1` + public | 2 |
| 4 | Generations | `GET /v1/generations/{id}` · `/events` (SSE) | `/v1` | 2 |
| 5 | Managed assets | `POST/GET /v1/assets` · `GET/DELETE /v1/assets/{id}` | `/v1` | 4 |
| 6 | Webhook delivery | `GET /v1/generations/{id}/deliveries` · `/v1/webhooks/{id}/deliveries` · `POST /v1/webhooks/deliveries/{id}/redeliver` | `/v1` | 3 |
| 7 | Account | `GET /v1/account/me` · `/usage` · `/tier` | `/v1` | 3 |
| 8 | API platform | keys CRUD, usage, daily usage, request logs, tier, webhooks CRUD + test, async generations, cancel, list, session assets | `/api` (session) | 26 |
| 9 | **Image tools** | `POST /image-tools/{remove-background,upscale,describe,ocr,denoise,enhance,remove-watermark}` | session | 7 |
| 10 | Templates | list, catalog-stats, simple, categories, stats, get, get-prompt, create, update, delete, admin-reorder, view, like, unlike, generate-name | session | 15 |
| 11 | Albums | list, public, get, create, update, archive, pin, delete, gallery/images, share, unshare, get-by-share-id | session | 12 |
| 12 | References | list, create, get, update, delete, enhance-image | session | 6 |
| 13 | **Agent skills** | `GET /agent/skills` · `/skills/community` · `POST /agent/skills` · `GET /agent/skills/{n}` · `POST /{n}/install` · `DELETE` · `PATCH` | session | 7 |
| 14 | Agent runtime | `POST /agent/image` · `/video` · **`/audio`** · `/agent` · `GET /agent/stream/resume/{run_id}` · `POST /agent/upload-image` · approval | session | 7 |
| 15 | Groot (Hermes mode) | `/groot/{chat,sessions,skills}` — gated `GROOT_ENABLED` (default true) | session | 10 |
| 16 | Media | `GET /media/gallery/unified` · `/media-edit/*` (watermark) | session | 3 |
| 17 | Credits | `GET /user/balance` · `/history` (+ admin grant/adjust) | session | 5 |
| 18 | User | `POST /user/api-key/generate` · `GET /user/api-key` · `/me` · `/profile-types` | session | 4 |
| 19 | Discovery | tags, tags-detailed | public | 2 |
| 20 | Inspiration | public gallery | public | 1 |
| 21 | Free AI tools | alt-text, image-describer, color-palette, nano-banana prompts, keyword-research, prompt-generator, tone-setter | public | 7 |
| 22 | Social / OG / referrals / feedback / valentine | — | mixed | 15 |
| 23 | Billing | `/dodo/*` | session | 18 |
| 24 | 🔴 Deleted | `moodboards` — module is `__pycache__` only | — | 0 |

**Notable:** three tools listed as fiction in `ai-ui/src/data/mcp.ts` have real backing after all —
`picx.upscale` → `/image-tools/upscale`, `picx.caption` → partially `/media-edit` watermark,
and `/image-tools/*` supplies six *more* operations nobody had specced. Conversely `picx.brand_kit`,
`picx.publish` and `picx.edit_chain` still map to nothing.

---

## 4. Feature catalog

Status legend: **A** = buildable today on `/v1`, no backend work · **B** = needs a `/v1` endpoint that
doesn't exist · **C** = exists only on the ungoverned session plane; needs a governed equivalent or an
explicit exception.

### F1 · Image generation — **A** · P0

| CLI | MCP tool |
|---|---|
| `picx image "<prompt>" [-m] [-s 1K\|2K\|4K] [-a 16:9] [-n 4] [-o ./out] [--wait]` | `picx_generate_image` |
| `picx image edit "<instruction>" -i <url\|./file> [-i …] [-s]` | `picx_edit_image` |

- `prompt` ≤4000 chars. `size` ∈ `1K·2K·4K`. `aspect_ratio` matches `\d+:\d+`.
- Edit takes **1–5** `image_urls`, http/https only. **Data URIs are rejected** — so any local path is
  auto-uploaded through `/v1/assets` first. This single affordance removes the sharpest edge in the API.
- `-n` > 1 fans out parallel requests, each its own generation id.
- Sync by default (5–20s). `--async --callback <url>` switches to the 202 contract.
- Writes files to `-o` and prints CDN URLs. CDN URLs are permanent.

### F2 · Video generation — **A** · P0

| CLI | MCP tool |
|---|---|
| `picx video "<prompt>" [--mode …] [--duration 1-60] [--resolution 480p\|720p\|1080p] [--sound] [--no-sound]` | `picx_generate_video` |
| `picx job <id> [--watch]` | `picx_get_generation` |

Seven modes, each with required inputs enforced server-side:

| Mode | Required |
|---|---|
| `text` | prompt |
| `image` | prompt + `--image` |
| `reference` | prompt + `--reference` (≤10) |
| `frames` | prompt + `--start-frame` |
| `extend` | prompt + `--source-video` |
| `lipsync` | `--source-video` + `--audio` (**prompt not required — only mode where it's optional**) |
| `edit` | prompt + `--source-video` |

Always 202. `--watch` consumes `GET /v1/generations/{id}/events` (SSE) for live progress; MCP polls
instead, since no client holds a tool call open for minutes.

### F3 · Audio generation — **C** · P2
`POST /agent/audio` exists and the `audio:generate` scope is already in `ALLOWED_SCOPES`, but there is no
`/v1/audio/generate`. Ship `picx audio` / `picx_generate_audio` only after a governed endpoint exists.

### F4 · Image tools — **C** · P1 · biggest cheap win

```
picx tool upscale <img> [--factor 2|4]
picx tool remove-bg <img>
picx tool enhance <img>
picx tool denoise <img>
picx tool remove-watermark <img>
picx tool describe <img>
picx tool ocr <img>
```

Seven operations, already implemented, currently only on `/image-tools/*` (session plane). MCP tools
`picx_upscale`, `picx_remove_background`, `picx_describe_image`, `picx_ocr`. `describe` and `ocr` are
*read* operations, which makes them the highest-value MCP tools of the set — they let an agent look at
an image before deciding what to do with it. **Requires `/v1/image-tools/*` mirror.**

### F5 · Assets — **A** · P0

```
picx upload <file...>        # → permanent https URL
picx assets list [--limit] [--type]
picx assets get <id>
picx assets rm <id>
```
MCP: `picx_upload_asset`, `picx_list_assets`. `upload` is load-bearing for F1-edit, F2 image/frames modes,
and every F4 operation.

### F6 · Templates — **C** · P1
The platform's prompt library — the thing that makes a cold agent good instead of generic.

```
picx templates search [-q] [--category] [--tags] [--media-type] [--featured] [--model]
picx templates get <id>
picx templates prompt <id>          # just the prompt text, for piping
picx templates categories
picx templates use <id> [--vars k=v]   # resolve prompt → generate
picx templates create|update|delete
```
MCP: `picx_search_templates`, `picx_get_template_prompt`, `picx_use_template`.
`picx templates use` is the headline: agent searches for "cinematic product shot", gets a proven prompt,
generates. **Requires `/v1/templates` read.**

### F7 · Albums — **C** · P1 · required for coherence
Without this, MCP/CLI generations are **invisible in the web app** — the user makes something in Claude and
can't find it at picxstudio.com. That is a product defect, not a missing nice-to-have.

```
picx albums list [--archived] [--pinned]
picx albums get <id>
picx albums create "<title>"
picx albums add <id> <asset-url...>
picx albums share <id> / unshare <id>
```
MCP: `picx_list_albums`, `picx_save_to_album`. Generation commands take `--album <id>` to route output.
**Requires `/v1/albums` read + item append.**

### F8 · References — **C** · P2
Named, reusable image groups (brand assets, a recurring character) with `usage_mode` ∈ `person·style`.
This is our answer to Higgsfield's Soul character training, using infrastructure we already have.

```
picx refs list|get|create|update|delete
picx refs enhance <id>
```
MCP: `picx_list_references`, `picx_use_reference`. Consistent-character workflows are the single most
requested thing in this category. **Requires `/v1/references`.**

### F9 · Generation history — **B** · P1
`GET /v1/generations` (list) **does not exist** — only `/api/generations` on the session plane. Higgsfield's
"browse your full history, reference any past image as a starting point" is unbuildable until it does.

```
picx history [--type image|video] [--status] [--since 7d] [--limit]
picx history last [--json]     # most recent generation, for scripting
```
MCP: `picx_list_generations`.

### F10 · Models & pricing — **A** · P0

```
picx models [--type image|video] [--json]
picx models cost <model> --size 2K      # credits before you spend them
```
MCP: `picx_list_models`. Read from `/v1/models`; cross-check `/api/v1/config/models`, which is the
authoritative pricing source. **Do not hardcode credit costs** — `ai-ui/src/data/cli.ts` documents that
the marketing page understated Nano Banana 2 as 20/20/40 against a real 35/53/105, i.e. customers saw
prices up to ~2× cheaper than billed.

### F11 · Account & credits — **A** (partial **C**) · P0

```
picx whoami
picx balance
picx usage [--period 7d|30d|90d]
picx tier                    # rate limits + daily credit cap
```
`/v1/account/{me,usage,tier}` covers this. `picx credits history` needs `/user/history` (session) or a
`/v1` mirror.

### F12 · Webhooks — **A** · P1

```
picx webhooks list|create|delete|test
picx webhooks deliveries <webhook-id>
picx deliveries <generation-id>
picx redeliver <delivery-id>
picx webhooks verify --secret <s> --signature <h> --body <f>   # local HMAC check
```
`verify` is the one people always hand-roll wrongly. Signature is HMAC over `{timestamp}.{raw_body}`,
header `X-PicX-Signature: t={ts},v1={hmac}`; envelope keys are **`id`** and **`event`** (not
`event_id`/`event_type`). Correlate on the `id` **inside the signed body**, never a URL path param — the
signature does not cover the URL, so a replayed delivery would verify against the wrong item.
CRUD is on `/api` (session); delivery inspection is on `/v1`.

### F13 · Skills — **C** · P1 · the marketing surface
`/agent/skills` already exists: list, community list, create, get, **install**, delete, patch —
user-scoped, filesystem-backed, name-validated `^[a-z0-9][a-z0-9-]{0,79}$`. So skills are not greenfield;
there is a server registry to build against.

```
picx skills list [--community]
picx skills install <name>
picx skills run <name> [--input k=v]
picx skills push ./my-skill
picx mcp skills sync                 # server registry → local client dir
```
MCP: `picx_list_skills`, `picx_run_skill`, plus MCP **prompts** for the launch set.

Launch skills — chosen because each needs only F1/F2/F5 (status **A**):

| Skill | Output | Credits (est.) |
|---|---|---|
| `product-hero` | lit hero + 3 platform crops | ~4 gens |
| `thumbnail-ab` | 8 thumbnail variants + contact sheet | ~8 gens |
| `social-pack` | one concept → 1:1, 9:16, 16:9 | ~3 gens |
| `headshot-cleanup` | selfie → studio headshot | ~2 gens |
| `catalog-refresh` | folder re-shot on new background | N gens |
| `ugc-clip` | still + script → vertical video | 1 img + 1 vid |

Every skill declares a credit estimate **and refuses to start if the estimate exceeds remaining daily
allowance**. The 6,000/day cap is real — it stopped a Doodle AI batch mid-run. A skill that dies halfway
through a 40-product catalogue is worse than one that declines up front.

### F14 · Agent integration — **A** · P0 · the actual product

```
picx mcp install --client claude|claude-code|cursor|codex|vscode|openclaw
picx mcp serve                 # stdio
picx mcp doctor                # diagnose a broken connection
picx login                     # device-code, browser, no key pasting
picx logout / picx auth status
```
`mcp install` writes the client's config file. Higgsfield makes users hand-edit
`claude_desktop_config.json`; we shouldn't. `mcp doctor` will carry disproportionate support value.

### F15 · Discovery & free tools — public · P3
`picx discover tags`, `picx inspiration`, `picx prompt improve`, `picx alt-text <img>`, `picx palette <img>`.
No auth, no credits. Cheap, and a legitimate way to let an unauthenticated agent try the platform.

### F16 · Output & scripting contract — P0
Applies to every command; specced once so it can't be re-litigated per command.

- `--json` on **everything**. v2 defaulted to Rich tables with opt-in JSON — backwards when the primary
  consumer is an agent.
- `--quiet` prints URLs only, one per line, pipe-friendly.
- Errors go to **stderr**; machine payloads to **stdout**. Always separable.
- Exit codes are contractual: `0` ok · `1` usage · `2` auth · `3` insufficient credits · `4` rate limited ·
  `5` upstream · `6` timeout. An agent branches on these without parsing prose.
- Local file paths accepted anywhere a URL is; auto-uploaded.
- `--dry-run` prints the credit cost and exits without spending.
- Config precedence: flag → env (`PICX_API_KEY`, `PICX_API_URL`) → `./.picxrc` → `~/.config/picx/config.json`.
- Default host `https://api.picxstudio.com/v1`; `--env dev` → `dev-api.picxstudio.com`.
  **The `/v1` suffix is mandatory — the bare host 404s.**

---

## 5. MCP tool surface summary

Kept deliberately small. A 30-tool server makes model tool-selection worse, and unreliable selection reads
to the user as a broken product.

**v1 — 10 tools (all status A):**
`picx_list_models` · `picx_generate_image` · `picx_edit_image` · `picx_generate_video` ·
`picx_get_generation` · `picx_upload_asset` · `picx_list_assets` · `picx_get_account` ·
`picx_describe_image` · `picx_upscale`

**v2 — +6 (needs §6):**
`picx_list_generations` · `picx_search_templates` · `picx_use_template` · `picx_save_to_album` ·
`picx_use_reference` · `picx_run_skill`

**Prompts:** `picx:product_hero` · `picx:thumbnail_ab` · `picx:model_pick`
**Resources:** `picx://models` · `picx://assets/{id}` — return images as **resource links**, not base64,
so Claude renders them without destroying the context window.

Deleted from the current spec because they map to nothing: `picx.edit_chain`, `picx.brand_kit`,
`picx.publish`, `picx.caption`.

---

## 6. Backend dependencies

| # | Endpoint | Unblocks | Priority |
|---|---|---|---|
| 1 | `GET /v1/generations` (list, paginated, filters) | F9 · history, "reference my past work" | P1 |
| 2 | `GET /v1/templates` + `/{id}/prompt` | F6 · templates | P1 |
| 3 | `GET /v1/albums` + `POST /v1/albums/{id}/items` | F7 · output visible in web app | P1 |
| 4 | `POST /v1/image-tools/*` (7 ops) | F4 · upscale, describe, ocr… | P1 |
| 5 | `GET/POST /v1/references` | F8 · consistent characters | P2 |
| 6 | `POST /v1/audio/generate` | F3 · audio | P2 |
| 7 | OAuth 2.1 AS — metadata, DCR, authorize, token, revoke, device flow | zero-key connect (see `PLAN.md` §6) | P0 for parity |
| 8 | Add `uploads:write` to `SESSION_KEY_SCOPES` | 🔴 else every OAuth-authed upload 403s | P0 |
| 9 | Close the `_resolve_user_from_api_key` governance gap | removes the unmetered path | P1 |
| 10 | `client_id`/`source` on request logs | per-surface usage reporting | P2 |

Item 8 is small and easy to miss: `SESSION_KEY_SCOPES = ["images:generate","images:edit","videos:generate"]`
omits `uploads:write`, and uploads are load-bearing for every edit and tool flow.

---

## 7. Releases

| Release | Contents | Depends on |
|---|---|---|
| **0.1 — CLI core** | F1 F2 F5 F10 F11 F16 · publish `picx-cli@3.0.0`, deprecate `<3.0.0` | `picx-stdio` npm access |
| **0.2 — MCP stdio** | F14 + the 10 v1 tools | 0.1 |
| **0.3 — Library** | F6 F7 F4 F9 F12 | backend 1–4 |
| **0.4 — Remote MCP** | `mcp.picxstudio.com`, zero-key connect | backend 7, 8 |
| **0.5 — Skills** | F13 + 6 launch skills | 0.3 |
| **1.0** | F8, docs, `ai-ui` surfaces rewritten | all |

0.1 + 0.2 is a genuinely useful product with **zero** backend changes.

---

## 8. Success metrics

- Time from "npm i" to first generated image — target **< 3 min**.
- % of MCP sessions producing ≥1 successful generation — target **> 60%**.
- Credits spent via MCP/CLI as a share of total (needs backend 10).
- `mcp doctor` invocations per install — a proxy for setup friction.
- Tool-selection accuracy: does the model pick the right tool unprompted? Regression-test per client.

---

## 9. Open questions

1. **Video pricing.** No credit table for video anywhere in the repo. Needed for `--dry-run` and skill
   pre-flight checks.
2. **Video mode × model compatibility.** Which models support `lipsync`, `extend`, `frames`? Needs a live
   `/v1/models` call with a real key.
3. **Real `max_credits_per_day`.** Read from a DB tier table I did not query. The per-session ceiling in the
   remote MCP should be a fraction of it.
4. **Groot exposure.** `/groot/*` is enabled by default. Is Hermes agent mode something the CLI should
   surface, or internal?
5. **`/user/api-key/generate` vs `/api/keys`.** Two key-issuing paths. Which does `picx login` use?
6. **`picx-stdio` npm account access** — sole maintainer of `picx-cli`. Blocking for Release 0.1.
7. **Deprecation wording** for `picx-cli@"<3.0.0"` — see §10.2.

---

## 10. Cutover procedure

Ordered so that nothing is destroyed before its replacement exists, and so no step is irreversible until
the last one.

### 10.1 Repository — preserve, then clear

```bash
# 1. Tag v2 so it stays reachable forever, before anything is removed.
cd /path/to/picx-cli
git fetch --all --tags
git tag -a v2.3.0-final <sha-of-current-main> -m "Final v2 CLI. Superseded by v3 — new codebase."
git branch legacy/v2 <sha-of-current-main>
git push origin v2.3.0-final legacy/v2
```

Then rename on GitHub — **Settings → Repository name** → `picx-devkit`. GitHub keeps a permanent redirect
for the old path, so existing clones, links and the npm `repository` field keep resolving.

```bash
# 2. Clean-slate main: orphan branch carries no v2 code in its history.
git checkout --orphan main-v3
git rm -rf . --cached
# ... scaffold the monorepo (see PLAN.md §3.4) ...
git add -A
git commit -m "feat: picx-devkit monorepo — CLI v3 + MCP server, clean rewrite

Complete rewrite. No source carried over from v2.
v2 preserved at tag v2.3.0-final and branch legacy/v2."
git branch -M main-v3 main
git push --force-with-lease origin main
```

`--force-with-lease` rather than `--force`: refuses to overwrite if anything landed on the remote in the
meantime. Also set the license to MIT — the repo currently has none, while the README claims MIT.

### 10.2 npm — deprecate 2.x, then publish 3.0.0

**Do not `npm unpublish`.** See §1. Sequence:

```bash
# 1. Verify maintainer access BEFORE anything else.
npm whoami                       # must be picx-stdio (or an org member with publish rights)
npm owner ls picx-cli

# 2. Publish 3.0.0 FIRST, so the deprecation message points at something that exists.
cd packages/cli
npm publish --access public      # version 3.0.0

# 3. Verify.
npm view picx-cli version        # → 3.0.0
npm view picx-cli dist-tags      # → latest: 3.0.0

# 4. Deprecate only the 2.x range. Semver range — leaves 3.x untouched.
npm deprecate picx-cli@"<3.0.0" \
  "picx-cli v2 is no longer functional: it targets a retired API host. Upgrade with 'npm i -g picx-cli@latest' (v3). See https://github.com/Type-Think-AI/picx-devkit"
```

Publish before deprecate, not after — a deprecation notice telling people to upgrade to a version that
isn't on the registry yet is worse than no notice.

Note that npm's `latest` tag moves to `3.0.0` on publish, so `npm i -g picx-cli` resolves to v3
immediately. Existing lockfiles pinned to `2.3.0` keep resolving — they get a deprecation warning on
install rather than a hard failure. That is the whole reason for choosing deprecate over unpublish.

### 10.3 Downstream references to update

| Location | Current | Change |
|---|---|---|
| `ai-ui/src/data/cli.ts` | `INSTALL_COMMAND = "npm i -g github:Type-Think-AI/picx-cli"` | `npm i -g picx-cli` — install from the registry, not from GitHub |
| `ai-ui/src/data/cli.ts` | `CLI_REPO_URL` | → `picx-devkit` (old URL redirects, but update it anyway) |
| `ai-ui/src/data/cli.ts` | provenance-warning header block | delete once the file is accurate |
| `ai-ui/src/data/mcp.ts` | `MCP_SERVER_URL`, 9 fictional tools | real endpoint + real tool list |
| `web-app/README.md` | `picx-cli` repo reference | → `picx-devkit` |
| npm `repository` field | `git+https://github.com/Type-Think-AI/picx-cli.git` | → `picx-devkit` |

### 10.4 Rollback

Until step 10.2/2 (`npm publish`), everything is reversible: the GitHub rename can be reverted, and
`legacy/v2` plus `v2.3.0-final` restore the code. After publish, `3.0.0` is permanent — npm never allows
reusing a version number — so the rollback is to publish `3.0.1` with a fix, never to unpublish.
