# PicX MCP Server — System Design

**Status:** design for review. No code written against this yet.
**Author:** Alex · **Date:** 2026-08-26
**Stack decision:** **FastMCP 4** (`fastmcp==4.0.0b3`), Python, as a **separate service**.
**Companions:** `PRD.md` (CLI features), `PLAN.md` (original architecture), `BUILD.md` (implementation spec)

---

## 0. Terminology, because it changes the whole conversation

**There is no "MCP 2.0".** Designing against a version that doesn't exist produces a server no client can
talk to — we already lost time to exactly that mistake earlier in this project.

Three unrelated things get called "version":

| Thing | Scheme | Current (verified 2026-08-26) |
|---|---|---|
| **The protocol** | date-stamped revisions | `2025-11-25` latest. Also live: `2024-10-07`, `2024-11-05`, `2025-03-26`, `2025-06-18` |
| **FastMCP** (PrefectHQ) | semver | **3.4.7** stable · **4.0.0b3** beta ← *we target this* |
| Official Python SDK (`mcp`) | semver | 2.1.1 |
| Official TS SDK (`@modelcontextprotocol/*`) | semver | 2.0.0 |

When we say "MCP 2.0" we mean **the sessionless (modern) protocol era**, whose current revision is
`2025-11-25`. FastMCP 4 is the framework that serves it. **Never hardcode a protocol version** — the
framework negotiates per connection.

---

## 1. Why FastMCP 4 specifically

FastMCP 4's theme is *"stateless transport without stateless application code."* That is precisely the
property a hosted, multi-replica MCP server needs, and it is the reason to accept a beta.

### 1.1 What it gives us that we would otherwise hand-roll

| Capability | What it means for PicX | Alternative cost |
|---|---|---|
| **Sessionless protocol, no session affinity** | Every modern request carries everything needed to answer it. Any replica behind an ordinary load balancer serves any request. No sticky sessions, no session store | This is the single biggest operational win. Hand-rolling means sticky routing or a shared session store |
| **Dual-era negotiation from one deployment** | Modern clients get sessionless; handshake-era clients keep working unchanged. One server, both eras | Otherwise: run two endpoints, or break older clients |
| **Background tasks** (`fastmcp-tasks`, `io.modelcontextprotocol/tasks`, `@mcp.tool(task=True)`, Docket-backed, Redis/Valkey) | **Solves video generation properly.** `client.call_tool()` returns the same way whether the tool ran inline or in the background — the agent never writes polling logic | My earlier design was 202 + agent-driven polling. Strictly worse UX |
| **Interactive tools via `InputRequiredResult`** | First-class return-and-resume. This is the *"this will cost 400 credits, confirm?"* guard, and batch confirmations | Available as primitives in the TS SDK but not as a framework pattern |
| **`UserSession`** — server-side state bound to authenticated identity; a handle is inert in another user's hands | Per-user preferences, working context, recent-asset memory across calls | Would need building, and getting the security property right is the hard part |
| **Response caching** (`cache_ttl`, `cache_scope`, `KeyValueResponseCacheStore` on Redis) | `picx_list_models` and `picx_search_templates` are ideal — hot, shared, safely stale | Hand-rolled KV cache (I had planned exactly this) |
| **Gateway routing headers** | Method, target name and opted-in argument values attached as HTTP headers on modern connections. Load balancers route without parsing JSON-RPC bodies | Meaningful for edge routing and WAF rules |
| **`OAuthProxy` + DCR + app-type + scope step-up** | Fronts an upstream OAuth provider, handles Dynamic Client Registration, distinguishes native vs web clients, and emits `InsufficientScopeError` naming the scopes needed | **Materially shortens the riskiest phase** — see §5 |
| **`ClientCredentialsOAuthProvider`** | M2M grant, no browser. For scheduled jobs and backend agents | Would need building |
| **`IdentityAssertion`** (SEP-990) | Enterprise: agent acts for an employee, IdP signs the assertion, no interactive consent | Future B2B need |
| **Path security by default** on resource templates (traversal, absolute paths, null bytes) | `picx://assets/{id}` is hardened without our code | Easy to forget by hand |

### 1.2 Beta risk, and how we hold it

FastMCP's own note: *"FastMCP 4 is in beta. Pin an exact version and expect sharp edges."*

Mitigations:
- **Pin exactly:** `fastmcp==4.0.0b3`, `fastmcp-tasks==4.0.0b3` (versioned in lockstep). No ranges.
- The blast radius is a **standalone service**. A sharp edge degrades MCP, never `api.picxstudio.com`.
- Keep the tool handlers thin — they call `/v1` over HTTP. If FastMCP 4 disappoints, the handlers port to
  3.4.7 or to the TS server with little rework, because the business logic isn't in the framework.

### 1.3 Removals that affect design

FastMCP 4 removes `ctx.sample()`, `ctx.sample_step()` and `ctx.list_roots()` from **every** protocol era —
deliberately, so incompatible code fails loudly on upgrade. The sessionless protocol has no live
back-channel to call into.

We were never going to use Sampling or Roots (both deprecated per SEP-2577), so this costs us nothing. It
does confirm the direction: **anything needing the client mid-execution uses return-and-resume
(`InputRequiredResult`)**, not a callback.

Also: code constructing MCP protocol models directly must use **snake_case** field names under SDK v2.

---

## 2. Do NOT mount MCP inside the main FastAPI backend

The instinct is reasonable — "the functions are already there" — and FastMCP supports both
`FastMCP.from_fastapi(app)` and `app.mount("/mcp", mcp.http_app(path="/"))`. **Still don't.** Four
blockers, three verified against our own code.

### Blocker 1 — the governance boundary 🔴 (the decisive one)

`app/auth/security.py:180` accepts `pxsk_` keys on *session* routes via `_resolve_user_from_api_key`, a
path that applies **no scope check, no rate limit, no daily credit cap, and writes no request log**. The
`/v1` plane enforces all four.

An **out-of-process** MCP server is an ordinary HTTP client pinned to `/v1` — it *cannot* reach the
ungoverned path. An **in-process** mounted server can call any internal service function directly,
bypassing the entire `/v1` dependency chain. We would hand every Claude user an unmetered generation path,
and the bypass would be invisible in request logs.

Process isolation is not incidental. It is the enforcement mechanism.

### Blocker 2 — FastMCP's authors advise against it, and we're the case they name

> Generating MCP servers from OpenAPI is a great way to get started … but in practice LLMs achieve
> **significantly better performance** with well-designed and curated MCP servers than with auto-converted
> OpenAPI servers. This is especially true for complex APIs with many endpoints and parameters. We
> recommend using the FastAPI integration for bootstrapping and prototyping, **not for mirroring your API
> to LLM clients.**

They link *"Stop Converting Your REST APIs to MCP"*. We have **217 route decorators**. An agent handed 217
auto-named tools like `list_products_products_get` picks wrong constantly — and unreliable tool selection
reads to users as a broken product.

### Blocker 3 — CORS conflict, documented, matching our config exactly

FastMCP: *"If your FastAPI app uses `CORSMiddleware` and you're mounting an OAuth-protected FastMCP
server, avoid adding application-wide CORS middleware … can cause conflicts (such as 404 errors on
`.well-known` routes or OPTIONS requests)."*

`app/main.py:219` — app-wide `CORSMiddleware`, `allow_credentials=True`, origin regex over
`*.picxstudio.com` + localhost. Broken `.well-known` routes would break OAuth discovery, the exact
mechanism the zero-key connect UX depends on.

### Blocker 4 — lifespan incompatibility

Mounting requires `FastAPI(lifespan=mcp_app.lifespan)` or `combine_lifespans(...)`. Our app uses
deprecated `@app.on_event("startup")`/`("shutdown")` (`app/main.py:284`, `:418`) — not lifespan context
managers, and they don't compose with a mounted app's lifespan. Fixing it means refactoring the most
deployment-sensitive code in the backend, in service of an architecture we're rejecting anyway.

### Also

Coupled release cycles (an MCP tweak needs a full Koyeb API deploy, dashboard-only), and blast radius — an
MCP bug could degrade the API that serves the actual product.

---

## 3. Architecture

```
┌──────────────────────────── CLIENTS ────────────────────────────┐
│ Claude web/Desktop · Claude Code · Cursor · Codex · VS Code ·   │
│ OpenClaw · scheduled agents (client-credentials)                │
└────────────┬──────────────────────────────┬─────────────────────┘
             │ stdio (local, shipped)       │ Streamable HTTP (sessionless)
             ▼                              ▼
   ┌────────────────────┐      ┌──────────────────────────────────┐
   │ picx-mcp (npm)     │      │ mcp.picxstudio.com/mcp           │
   │ 0.1.0 — TS, LIVE   │      │ FastMCP 4.0.0b3 · Python         │
   │ API-key auth       │      │ ── stateless, N replicas ──       │
   │ 13 tools           │      │ OAuthProxy · tasks · caching     │
   └────────┬───────────┘      └──────┬───────────────────────────┘
            │                         │
            │                    ┌────┴─────┬──────────────┐
            │                    ▼          ▼              ▼
            │              ordinary LB   Redis/Valkey   REQUEST_STATE_KEY
            │              (no affinity) (tasks+cache+  (shared, ≥32 bytes,
            │                             sessions)      every replica)
            │                         │
            └────────────┬────────────┘
                         │  both call, over HTTP
                         ▼
            ┌────────────────────────────────┐
            │  api.picxstudio.com/v1         │
            │  GOVERNED PLANE                │
            │  scopes · rate limits ·        │
            │  daily credit cap · req logs   │
            └───────────────┬────────────────┘
                            ▼
            ┌────────────────────────────────┐
            │  FastAPI — OAuth upstream      │
            │  (Google login reused)          │
            │  + token→session-key exchange  │
            └────────────────────────────────┘
```

### 3.1 Two servers, and the honest cost

We now have **two MCP implementations**: the shipped TypeScript `picx-mcp` (stdio, local) and this Python
FastMCP 4 service (remote, hosted). That is a real cost and I won't paper over it — **drift between two
tool definitions is the most likely way this product silently breaks.** It is exactly the class of bug
that shipped four broken commands in `picx-cli@3.0.0`: the CLI and the tool layer were authored separately
and disagreed on parameter names.

**Mitigation — a language-neutral tool manifest, generated, single-sourced:**

```
packages/tools/src/*.ts   ← the ONE source of truth (already exists)
          │
          │  build step: emit JSON Schema per tool
          ▼
   tools/manifest.json     ← committed, versioned, CI-diffed
          │
    ┌─────┴─────┐
    ▼           ▼
 TS server   Python server   ← both LOAD it; neither redefines tools
 (stdio)     (FastMCP 4)
```

CI check: regenerate the manifest and fail if it differs from the committed copy, and fail if the Python
server's registered tool names/schemas don't match it. Drift becomes a red build instead of a silent
production bug.

**Division of labour:**

| | TS `picx-mcp` (stdio) | Python FastMCP 4 (remote) |
|---|---|---|
| Audience | local dev, Claude Code, Cursor | hosted clients, Claude web, teams |
| Auth | `PICX_API_KEY` env var | OAuth 2.1, zero-key |
| Tasks / long video | poll | **native background tasks** |
| Caching, sessions | none | Redis-backed |
| Already shipped | ✅ | ❌ to build |

Keep the TS stdio server — it works, it's published, and a local process reading an env var needs none of
the remote machinery. Don't build a Python stdio server too.

---

## 4. Transport & tool decisions

| Decision | Value | Why |
|---|---|---|
| Endpoint | `https://mcp.picxstudio.com/mcp` | Streamable HTTP. **Not `/sse`** — legacy transport. `ai-ui/src/data/mcp.ts` currently advertises `/sse` and must be corrected; serve `/sse` as **410 Gone** with a pointer |
| Protocol | negotiated per connection, never hardcoded | Modern clients sessionless; handshake-era still served |
| Video / long work | `@mcp.tool(task=True)` + Redis-backed Docket | Client polls transparently |
| Images | inline (5–20s) | Fast enough that a task handle adds latency for no gain |
| Media | resource links, never base64 | base64 destroys the client's context window |
| Confirmation | `InputRequiredResult` above a credit threshold | Abuse containment + user trust |
| Cache | `cache_ttl=300, cache_scope="public"` on `list_models`, `search_templates` | Hot, shared, safely stale |
| Tool count | **13 curated**, matching the manifest | Not 217 auto-converted |

---

## 5. Auth — where FastMCP 4 actually saves us

My earlier estimate was **6–8 days** to hand-build an OAuth 2.1 authorization server. FastMCP 4's
`OAuthProxy` changes the shape: it fronts an **upstream** provider and handles Dynamic Client
Registration, the native-vs-web application-type distinction, and scope step-up challenges.

We already have an upstream identity provider — **Google OAuth**, used for PicX login today.

**Revised design:** FastMCP's `OAuthProxy` faces MCP clients and delegates identity to Google. What
remains ours in FastAPI is much smaller than a full AS:

| Component | Owner | Notes |
|---|---|---|
| MCP-facing OAuth (metadata, DCR, PKCE, app-type, step-up) | **FastMCP `OAuthProxy`** | Framework |
| Upstream identity | **Google** (existing) | Already configured |
| Consent screen (credit-terms wording) | Ours | Small |
| **Token → session-key exchange** | **Ours, FastAPI** | The real remaining work. Resolve an authenticated identity to the user's implicit session key via existing `ApiKeyService.resolve_session_key_id` |
| Per-client attribution | Ours | `client_id`/`source` on request logs |

**The Python service never holds a `pxsk_`.** It presents an identity; the API resolves it to a scoped
session key. Revoking a grant kills MCP access without touching the user's real API keys.

### 5.1 🔴 One-line blocker to fix first

```python
SESSION_KEY_SCOPES = ["images:generate", "images:edit", "videos:generate"]
```

`uploads:write` is missing. Uploads are load-bearing for **every** edit and image-tool flow, because
`/v1/images/edit` rejects data URIs. If OAuth resolves to a session key, **every upload 403s.** One line,
total blocker — fix before any auth work is tested.

### 5.2 Consent wording

Scopes in credit terms, not API terms:

> **Claude** will be able to generate images and video using your PicX credits.
> You have **2,182 credits**. You can revoke this at any time.

### 5.3 Abuse containment

- **Per-session credit ceiling** in the MCP service, independent of the account daily cap.
- `InputRequiredResult` confirmation above a credit threshold — now a first-class pattern.
- Reuse the API's `validate_public_url` SSRF guard; do not reimplement.
- Verify `X-PicX-Signature` HMAC over `{timestamp}.{raw_body}`, reject skew > 5 min, correlate on the `id`
  **inside the signed body** — never a URL path param, since the signature doesn't cover the URL.

---

## 6. Deployment

Statelessness is the point: **no session affinity**, so ordinary load balancing and horizontal replicas.

| Concern | Approach |
|---|---|
| Runtime | Python 3.13, `fastmcp==4.0.0b3`, `fastmcp-tasks==4.0.0b3`, `uvicorn` |
| Hosting | Container platform with an ordinary LB. **Prefer one we can deploy from CI** — Koyeb is dashboard-only today, which would make iteration slow. Fly / Render / Cloud Run all fit |
| Replicas | ≥2 from day one, precisely to prove no affinity is needed |
| Redis / Valkey | **Required, not optional** — backs tasks, response cache, and session state. In-memory defaults are process-local and break the moment there are two replicas |
| `REQUEST_STATE_KEY` | ≥32 bytes, **identical on every replica**. Without it, a resumed interactive round fails on a different replica |
| Secrets | `REQUEST_STATE_KEY`, Google client id/secret, Redis URL, API base URL |
| Host/origin validation | Framework-provided; set allowed hostnames explicitly |
| Observability | Gateway routing headers make method/tool visible to the LB without body parsing — use for metrics and WAF |

### 6.1 Routing map

| Host / path | Serves | Auth |
|---|---|---|
| `api.picxstudio.com/v1/*` | governed REST API | `pxsk_` key |
| `api.picxstudio.com/oauth/*` | token → session-key exchange, consent | mixed |
| `mcp.picxstudio.com/mcp` | remote MCP, sessionless Streamable HTTP | OAuth bearer |
| `mcp.picxstudio.com/.well-known/oauth-protected-resource` | resource metadata → names the AS | public |
| `mcp.picxstudio.com/sse` | **410 Gone** + pointer | — |
| `npx picx-mcp` | local stdio (TS, shipped) | `PICX_API_KEY` |

---

## 7. Phases

| Phase | Work | Days | Notes |
|---|---|---|---|
| **0** | `uploads:write` scope fix · `GET /v1/generations` (unblocks `picx history`) | 1 | Do first regardless |
| **1** | **Spike:** FastMCP 4 service, 3 curated tools (`generate_image`, `list_models`, `search_templates`), API-key auth, 2 replicas + Redis. Prove sessionless behaviour | 2 | De-risks the beta before committing |
| **2** | Tool manifest generator + CI drift check (§3.1) | 2 | Do before the second registry grows |
| **3** | Full 13-tool parity, loaded from the manifest | 3 | |
| **4** | `@mcp.tool(task=True)` for video, Redis Docket backend | 2 | Replaces poll-based design |
| **5** | `OAuthProxy` → Google, consent screen, **token → session-key exchange** | **4–6** | Was 6–8 hand-rolled |
| **6** | Deploy: domain, secrets, ≥2 replicas, `/sse` → 410, observability | 2 | |
| **7** | Response caching, per-session credit ceiling, `InputRequiredResult` confirmations | 2 | |
| **8** | Correct `ai-ui`: real endpoint + tool list, drop ComingSoon, `/connect` route, delete fictional `docs.ts` endpoints | 3–4 | |
| **9** | Governance: close the `_resolve_user_from_api_key` bypass; `client_id`/`source` in request logs | 2–3 | Nema's territory |

**Total: 23–29 days.** Phase 5 remains the highest-risk item but is ~2 days cheaper than hand-rolling.
Phases 0–1 are worth doing this week regardless of everything downstream.

---

## 8. Decisions

| # | Decision | Call |
|---|---|---|
| 1 | Framework | **FastMCP 4** (`4.0.0b3`), pinned exactly |
| 2 | Mount in the main FastAPI app? | **No** — governance boundary, CORS, lifespan, and their own guidance |
| 3 | `FastMCP.from_fastapi()` over 217 endpoints? | **No** — 13 curated tools |
| 4 | Keep the TS stdio server? | **Yes** — shipped, working, right tool for local |
| 5 | Drift control across two servers | **Generated tool manifest + CI check.** Non-negotiable given our history |
| 6 | Redis | **Required**, not optional |
| 7 | Auth | `OAuthProxy` → Google upstream; token→session-key exchange stays ours |
| 8 | Hosting | Container platform deployable **from CI**, ≥2 replicas |
| 9 | Beta exposure | Standalone service only; never in the API's process |

## 9. Open questions

1. **Where do we host it?** Koyeb is dashboard-only and can't be deployed from an agent session, which
   makes Phase 5 iteration slow. Worth choosing something CI-deployable.
2. **Redis: new instance or shared?** Tasks + cache + session state. Sizing depends on video volume.
3. **Does `OAuthProxy` fronting Google satisfy MCP client DCR expectations end-to-end?** Phase 1 should
   test this specifically — it's the assumption that saves 2+ days.
4. **Video pricing and mode × model compatibility** — still unverified; needed for pre-flight cost checks
   and the confirmation threshold.
5. **Real `max_credits_per_day`** from the tier table, to size the per-session ceiling.
6. **MCP Apps** (interactive UI in-conversation) is now available to us via FastMCP. Product question: is
   a model picker or result grid rendered inline in Claude worth building?
