# PicX MCP — Auth & Generation Flows

**Status:** design for approval.
**Companions:** `PLAN-MCP.md` (project + phases), `MCP_ARCHITECTURE.md` (why standalone, not mounted)
**Author:** Alex · **Date:** 2026-08-26

Everything below was traced through the real code in `web-app/api`, not assumed. Line references are real.

---

## Part 0 — The one principle that governs both flows

> **The MCP server never calls a model. It never touches money. It never stores media.**
> It is a *client* of `api.picxstudio.com/v1`, which owns all three.

This is the load-bearing decision, and it's worth being explicit about *why*, because it looks like an
extra hop you could optimise away.

Our `/v1` handler already does all of this, in this order (verified in
`app/public_api/router.py:248-440`):

1. Authenticate + enforce rate limits + enforce the daily credit cap
2. Check the scope for this specific operation
3. Resolve price **from config only** — an unpriced size is rejected, never guessed
4. Apply any active credit discount
5. Check idempotency — replay returns the original result, doesn't double-charge
6. **Deduct credits *before* calling the provider**
7. Call the provider (`SharedImageGenerator`)
8. On success: persist `output_url`, mark completed
9. **On provider failure: refund the credits** (`transaction_type="api_refund"`)
10. Write a request log with `credits_used`

If the MCP server called models directly it would have to reimplement pricing, discounts, idempotency,
deduction, **refund-on-failure**, and logging — and any divergence becomes a billing bug. Billing bugs are
the worst class of bug to have: silent, and they erode trust permanently.

So the MCP server's job is narrow and safe: **translate MCP tool calls into `/v1` calls, and translate
results back.** That's it.

---

## Part 1 — Authentication

### 1.1 Two credentials, one enforcement point

We support both, because they serve genuinely different users:

| | **API key** (`pxsk_…`) | **Google OAuth** |
|---|---|---|
| Who | developers, CI, scripted agents, self-hosters | everyday users on hosted clients |
| Obtained from | [ai.picxstudio.com/api](https://ai.picxstudio.com/api) | nothing to obtain — click Approve |
| Where it lives | env var / `.picxrc` / `~/.config/picx` | short-lived token, server-side |
| Best for | Claude Code, Cursor, terminals, cron | Claude web, Cowork, hosted agents |
| Revocation | delete the key | revoke the grant — **real keys untouched** |

**The critical design property: both paths converge on the same enforcement.** Whatever the credential,
the request lands on `/v1` and passes through `get_api_key_user`, which enforces scopes, per-minute and
per-day rate limits, the daily credit cap, and request logging (`app/api_platform/deps.py`).

```
API key ────────────────────────────────┐
                                        ├──▶ /v1 enforcement ──▶ generation
Google OAuth ──▶ access token ──▶ session key ┘
                 (resolve_session_key_id)
```

There is no second, weaker path. That is deliberate — see `MCP_ARCHITECTURE.md` §2 for the ungoverned
session-plane bypass this design exists to avoid.

### 1.2 Flow A — API key (available immediately, Phase 2)

```
Developer                    MCP client              PicX MCP server         api.picxstudio.com/v1
    │                             │                         │                          │
    │ 1. get key at               │                         │                          │
    │    ai.picxstudio.com/api    │                         │                          │
    │                             │                         │                          │
    │ 2. paste into client config │                         │                          │
    │────────────────────────────▶│                         │                          │
    │    {"env":{"PICX_API_KEY"}} │                         │                          │
    │                             │ 3. tools/call           │                          │
    │                             │  Authorization: Bearer  │                          │
    │                             │────────────────────────▶│                          │
    │                             │                         │ 4. forward the key       │
    │                             │                         │─────────────────────────▶│
    │                             │                         │                          │ 5. scope, rate,
    │                             │                         │                          │    cap, log
    │                             │                         │◀─────────────────────────│
    │                             │◀────────────────────────│                          │
```

The MCP server holds **no** credential of its own here. It forwards the caller's key. A key it never
stores is a key it cannot leak.

### 1.3 Flow B — Google OAuth, the "click Approve" path (Phase 5)

This is the one you want to feel instant. The whole flow is **one screen and one click** for a user
already signed in to PicX — which most are, because the cookie is scoped to `.picxstudio.com`.

```
User          Claude (web)         MCP server                 PicX API / Google
 │                 │                    │                            │
 │ "connect PicX"  │                    │                            │
 │────────────────▶│                    │                            │
 │                 │ 1. GET /.well-known/oauth-protected-resource    │
 │                 │───────────────────▶│                            │
 │                 │◀─── AS location ───│                            │
 │                 │                    │                            │
 │                 │ 2. POST /register  │  (Dynamic Client Reg.)     │
 │                 │───────────────────▶│                            │
 │                 │◀── client_id ──────│                            │
 │                 │                    │                            │
 │                 │ 3. open /authorize?…PKCE S256                   │
 │◀── browser ─────│───────────────────▶│───────────────────────────▶│
 │                 │                    │                            │
 │ 4a. ALREADY SIGNED IN (cookie on .picxstudio.com) → skip to 5     │
 │ 4b. not signed in → Google login (one click, account chooser)     │
 │                 │                    │                            │
 │ 5. CONSENT SCREEN — one screen, one button                        │
 │    ┌──────────────────────────────────────────────┐               │
 │    │  Claude wants to use PicX                    │               │
 │    │                                              │               │
 │    │  • Generate images and video                 │               │
 │    │  • Upload and read your assets               │               │
 │    │  • Browse templates                          │               │
 │    │                                              │               │
 │    │  Spends from your balance: 2,182 credits     │               │
 │    │  Daily cap applies. Revoke any time.         │               │
 │    │                                              │               │
 │    │        [ Approve ]        [ Cancel ]         │               │
 │    └──────────────────────────────────────────────┘               │
 │─── Approve ────────────────────────────────────────▶              │
 │                 │                    │                            │
 │                 │ 6. code ──▶ POST /token (PKCE verify)            │
 │                 │◀── access + refresh token ──────────────────────│
 │                 │                    │                            │
 │                 │ 7. tools/call with Bearer <access token>        │
 │                 │───────────────────▶│                            │
 │                 │                    │ 8. token ─▶ session key    │
 │                 │                    │───────────────────────────▶│
 │                 │◀───────────────────│◀──────────────────────────│
```

**Speed comes from steps 4a and 5.** A signed-in user sees exactly one screen. `OAuthProxy` (FastMCP 4)
handles discovery, DCR, PKCE and the native-vs-web application-type distinction; Google handles identity;
we own only the consent screen and the token→session-key exchange.

### 1.4 Token → session key, and why the Worker never holds a `pxsk_`

```python
# Ours, in FastAPI. Presented with a verified identity, return a scoped capability.
api_key_id = await ApiKeyService.resolve_session_key_id(session, user.id)
```

`resolve_session_key_id` already exists — the console uses it so a signed-in user's activity is attributed
to an implicit session key. We reuse it rather than inventing a parallel concept.

Consequences worth stating:

- **The MCP service never sees a real `pxsk_`.** It presents a token; the API resolves it.
- **Revoking the grant kills MCP access only.** The user's actual API keys keep working.
- **Per-client attribution is free** — we can finally answer "credits spent via MCP vs console vs SDK".

### 1.5 🔴 The blocker that will break every upload on day one

```python
# app/api_platform/key_service.py:25
SESSION_KEY_SCOPES = ["images:generate", "images:edit", "videos:generate"]
```

`uploads:write` is missing.

Why it's fatal rather than cosmetic: `/v1/images/edit` **rejects data URIs**, so *every* "edit this local
file" flow must first `POST /v1/assets`. With OAuth resolving to a session key, that upload 403s — and the
failure appears as "editing is broken", not "a scope is missing".

**One line. Fix it in Phase 0, before any auth work is tested.**

### 1.6 Enforcement values (real, from `tier_service.py`)

| Limit | Default |
|---|---|
| Requests / minute | 60 |
| Requests / day | 10,000 |
| **Max credits / day** | **13,000** |

The MCP server adds a **per-session credit ceiling** as a fraction of the daily cap — a separate control,
because one prompt-injected conversation should not be able to spend a whole day's allowance.

---

## Part 2 — Generation flow

### 2.1 Image generation, end to end (verified)

```
MCP client            MCP server              /v1/images/generate           provider · storage
    │                      │                          │                            │
    │ tools/call           │                          │                            │
    │ picx_generate_image  │                          │                            │
    │─────────────────────▶│                          │                            │
    │                      │ POST /v1/images/generate │                            │
    │                      │─────────────────────────▶│                            │
    │                      │                          │ 1. auth · rate · daily cap │
    │                      │                          │ 2. scope images:generate   │
    │                      │                          │ 3. price from config —     │
    │                      │                          │    unpriced size REJECTED  │
    │                      │                          │ 4. apply discount          │
    │                      │                          │ 5. idempotency check       │
    │                      │                          │ 6. DEDUCT CREDITS          │
    │                      │                          │───────────────────────────▶│
    │                      │                          │                            │ SharedImageGenerator
    │                      │                          │                            │ → R2 / CDN
    │                      │                          │◀───────────────────────────│
    │                      │                          │ 7a. ok → persist output_url│
    │                      │                          │ 7b. fail → REFUND CREDITS  │
    │                      │                          │ 8. request log             │
    │                      │◀─────────────────────────│                            │
    │◀─────────────────────│  resource_link (never base64)                          │
```

**Steps 6 and 7b are the reason we don't call providers directly.** Deduct-then-refund with an
`api_refund` transaction type is real money logic with an audit trail. Reimplementing it in the MCP server
would eventually diverge, and the divergence would be a billing bug.

### 2.2 Image vs video: different shapes, deliberately

| | Image | Video |
|---|---|---|
| Duration | 5–20s | minutes |
| `/v1` contract | **200 sync** (or 202 with a delivery target) | **always 202** |
| MCP treatment | inline tool call | **`@mcp.tool(task=True)`** |
| Agent experience | result returns directly | `client.call_tool()` returns identically — FastMCP handles handle-and-poll |

For video, `fastmcp-tasks` (Docket, Valkey-backed) means the agent writes **no polling logic**. That is a
materially better developer experience than the 202-plus-poll design I originally drafted.

⚠️ `TasksExtension()` defaults to in-memory single-process. **Configure the Valkey backend** or background
tasks break the moment there are two replicas.

### 2.3 Local file → editable URL

The single sharpest edge in the API, smoothed once, centrally:

```
"edit ./photo.jpg"
   → picx_upload_asset → POST /v1/assets → permanent CDN URL
   → picx_edit_image  → POST /v1/images/edit  (https URL, accepted)
```

Because `/v1/images/edit` rejects data URIs, the tool description must tell the *model* this, so it
chains the two calls without being asked. Requires `uploads:write` (§1.5).

### 2.4 Confirm before spending

```python
if estimated_credits > CONFIRM_THRESHOLD:      # e.g. 200
    return InputRequiredResult(...)            # "This will cost ~840 credits. Proceed?"
```

Two jobs at once: containment against prompt-injected credit drain, and plain courtesy before a
40-product catalogue run. First-class in FastMCP 4 via return-and-resume.

### 2.5 Media never crosses as base64

Results come back as **resource links**. Inlining image bytes would consume the client's context window
for no benefit, and CDN URLs are permanent anyway.

---

## Part 3 — Phases, expanded

Ten phases. Each has an explicit exit gate, because "done" on a beta framework needs to mean something
testable.

### Phase 0 — Unblock the backend · 1 day
- `uploads:write` → `SESSION_KEY_SCOPES` (§1.5)
- `GET /v1/generations` (list, paginated, filter `type`/`status`/`since`) — unblocks `picx_list_generations` and `picx history`
- Confirm video pricing per mode and mode×model compatibility — needed for the confirm threshold
- Read real `max_credits_per_day` from the tier table

**Gate:** an OAuth-shaped session key can upload; `GET /v1/generations` returns 200.

### Phase 1 — Repo scaffold · 1 day
`Type-Think-AI/picx-mcp`: uv, `.python-version` 3.13, exact pins (`fastmcp==4.0.0b3`,
`fastmcp-tasks==4.0.0b3`, `cyclopts>=5.0.0a1`), Dockerfile, `docker-compose.yml` (app + valkey), CI
(typecheck + pytest), MIT licence, README.

**Gate:** `fastmcp version` prints 4.0.0b3; CI green; container boots.

### Phase 2 — Statelessness spike ⭐ · 2 days
The phase that validates the entire framework choice. Three tools only:
`picx_generate_image`, `picx_list_models`, `picx_search_templates`. API-key auth (Flow A). `/health`.

```python
app = mcp.http_app(stateless_http=True, host_origin_protection=True,
                   allowed_hosts=["mcp.picxstudio.com"])
```

**Gate — all four, or we reconsider the framework:**
1. Two replicas behind round-robin; alternating requests both succeed
2. A real image generates against production `/v1` with a real key
3. An interactive round (`InputRequiredResult`) **resumes on the other replica** with a shared `REQUEST_STATE_KEY`
4. `Mcp-Method` / `Mcp-Name` headers observable at the proxy

### Phase 3 — Full tool surface · 3 days
All 13 tools, matching the CLI's tested surface. `cache_ttl=300, cache_scope="public"` on `list_models`
and `search_templates`. Truthful annotations — `readOnlyHint` false for anything spending credits.

**Gate:** 13 tools registered; contract test per tool; a Claude Code session completes generate → edit → upload.

### Phase 4 — Video as a background task · 2 days
`@mcp.tool(task=True)`, `TasksExtension` on **Valkey** (not in-memory).

**Gate:** a video generates via a task handle; `client.call_tool()` returns the finished result with no
client-side polling; a worker restart mid-task does not lose the job.

### Phase 5 — OAuth, the click-Approve path 🔴 · 4–6 days
Highest risk. `OAuthProxy` → Google. **Both production requirements from their docs:**
explicit `jwt_signing_key` (else tokens die on client-secret rotation) and
`FernetEncryptionWrapper(RedisStore(...))` for `client_storage` (else upstream tokens sit in plaintext and
aren't trusted across replicas). Plus our consent screen (§1.3 step 5) and the token→session-key exchange.

**Gate:** from a clean browser, Claude web connects with **zero keys pasted**; a signed-in user sees exactly
one consent screen; revoking the grant blocks MCP while the user's real API keys still work.

### Phase 6 — Deploy + DNS · 2 days
CI-deployable platform (not Koyeb — dashboard-only). `mcp.picxstudio.com` CNAME, TLS, secrets, **≥2
replicas**, `/health` probe, `/sse` → **410 Gone** (`ai-ui` still advertises it). Deploy at domain **root**
so `.well-known` routes are automatic — mounting under a prefix invites the `base_url`/`mcp_path`
double-prefix trap.

**Gate:** `https://mcp.picxstudio.com/mcp` reachable; health green; a rolling deploy drops no requests.

### Phase 7 — Safety rails · 2 days
Per-session credit ceiling (fraction of the 13,000/day cap); `InputRequiredResult` above the threshold;
`validate_public_url` reused for SSRF (not reimplemented); webhook HMAC over `{timestamp}.{raw_body}`,
skew > 5 min rejected, correlated on the `id` **inside the signed body** — never a URL path param, since
the signature doesn't cover the URL.

**Gate:** a scripted injection attempt cannot exceed the session ceiling; a replayed webhook is rejected.

### Phase 8 — `ai-ui` truth pass · 3–4 days
The customer-facing surface currently lies. Fix: `mcp.ts` real endpoint + 13 real tools (drop the 9
fictional ones), remove ComingSoon banners, add a **`/connect`** one-screen onboarding route, rewrite
`cli.ts` against v3, and **delete the fictional `docs.ts` endpoints** (`/v1/projects`, `/v1/shots`,
`/v1/deliver` — none exist). Update the FAQ *and* its JSON-LD in lockstep.

**Gate:** every command and tool documented on `ai.picxstudio.com` actually exists.

### Phase 9 — Governance · 2–3 days · Nema
Close the `_resolve_user_from_api_key` bypass (scopes, rate limits, credit cap, request logging on session
routes) and add `client_id`/`source` to request logs for per-surface reporting.

**Gate:** no ungoverned generation path; a usage report can split MCP vs console vs SDK.

### Totals

| Slice | Days |
|---|---|
| Phase 0–2 (proves the architecture) | **4** |
| Phase 0–4 (working, API-key MCP) | **9** |
| Phase 0–6 (hosted, zero-key) | **15–17** |
| All ten | **20–26** |

---

## Part 4 — Why this is the highlight feature

Positioning, since it needs to be sellable:

**The pitch:** *"Your PicX credits, inside Claude. One click, no API key."*

What makes it defensible rather than a checkbox:

| Advantage | Why it holds |
|---|---|
| **Zero-key onboarding** | One screen, one click. Most competitors make you paste a key into a JSON file |
| **Credits, not a separate plan** | Same balance as the web app. Nothing new to buy, nothing to reconcile |
| **50K+ template catalogue as a tool** | An agent can *search proven prompts* instead of inventing one. Nobody else has this |
| **Auto-refund on failure** | Already true in `/v1`. A failed generation costs nothing. Rare, and reassuring |
| **Video without polling code** | `task=True` means the agent just waits. Competitors document "poll for results" |
| **Honest limits** | We ship what works and say what doesn't. Tools that half-work destroy agent trust fastest |

**Order of proof:** Phase 2 proves the architecture (4 days). Phase 4 gives a demoable product on API
keys (9 days). Phase 5 gives the actual pitch (15–17 days). Ship the demo before the pitch — a working
API-key MCP server is a real product, not a stepping stone.

---

## Part 5 — Open questions

1. **Platform.** Must be CI-deployable. Fly / Render / Cloud Run. Decide before Phase 6.
2. **Confirm threshold.** 200 credits? Should it scale with the user's balance rather than be fixed?
3. **Video pricing** per mode — still unverified, and Phase 7's threshold depends on it.
4. **Valkey** — new instance or shared? Backs tasks, cache, OAuth client storage, session state.
5. **Does `OAuthProxy`-over-Google satisfy MCP client DCR end-to-end?** Test in Phase 2, not Phase 5 —
   it's the assumption that saves 2+ days.
6. **MCP Apps** — FastMCP can return interactive UI inline (a model picker, a result grid). Genuinely
   differentiating. Product call.
