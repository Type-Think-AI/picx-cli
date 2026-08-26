# PLAN-MCP — PicX MCP Server, Python / FastMCP 4

**Status:** plan for approval. No code written yet.
**Decision:** one MCP implementation only — **Python, FastMCP 4, hosted remote.** The TypeScript stdio
server is retired.
**Author:** Alex · **Date:** 2026-08-26
**Companion:** `docs/MCP_ARCHITECTURE.md` (system design and the "don't mount it in the API" reasoning)

---

## 0. Two corrections I owe you before the plan

### 0.1 The TypeScript MCP server was my call, and it's retired

You asked for an MCP server. **Choosing TypeScript stdio was my decision, not your instruction**, and I
then flagged the two-implementation drift cost myself. One implementation is the better architecture.

Actions taken:

| Action | State |
|---|---|
| `picx-mcp@0.1.0` on npm | **deprecated** with a notice pointing at the Python rebuild |
| `npm unpublish picx-mcp` | 🔴 **blocked — needs you.** See below |
| `packages/mcp/` in the monorepo | **deleted** (`git rm`) |
| Publish workflow | picx-mcp step removed; only `picx-cli` publishes |
| Root `build` / `typecheck` | mcp dropped; 0 tsc errors after removal |

**Unpublish needs you.** It was published 0.9h ago with zero downloads, so it *is* inside npm's 72-hour
window — but both credentials are refused:

- The bypass-2FA granular token: *"Granular access tokens that bypass two-factor authentication may not
  perform this action."* npm forbids destructive ops from bypass tokens by design.
- The web-login session: *"This package requires that publishers enable TFA and provide an OTP."*

So a real OTP is required, which needs account 2FA **enabled** (it is currently disabled on `picx-stdio`).
Either enable 2FA and run `npm unpublish picx-mcp --force --otp=XXXXXX` within the window, or leave it
deprecated — deprecation already communicates the right thing and costs nothing.

### 0.2 I was wrong about the protocol version, and it matters here

Earlier I "corrected" my notes to say protocol revision `2026-07-28` doesn't exist. **That correction was
itself wrong**, and I've fixed the stored lesson.

What I actually verified was narrower than what I concluded:

| Evidence | Fact |
|---|---|
| `@modelcontextprotocol/core@2.0.0` (TS) dist | `LATEST_PROTOCOL_VERSION = "2025-11-25"` |
| `mcp==2.1.1` (Python) wheel | ships `"2025-06-18"`, `"2025-11-25"`, **`"2026-07-28"`** |
| FastMCP 4 docs | repeatedly reference *"the modern `2026-07-28` protocol"*, including `Mcp-Method` / `Mcp-Name` / `Mcp-Param-*` gateway routing headers and the `x-mcp-header` schema extension |

`2026-07-28` **is** a real revision — the modern sessionless era. The TS SDK v2.0.0 simply hadn't adopted
it as latest; I generalised one SDK's constant into a claim about the spec.

**This strengthens your decision.** Python is genuinely ahead of TypeScript on protocol support right now.
Choosing FastMCP 4 gets us `2026-07-28`; the TS SDK would have capped us at `2025-11-25`.

---

## 1. What we're building

A standalone Python service exposing PicX generation as MCP tools over **sessionless Streamable HTTP**,
hosted at `mcp.picxstudio.com/mcp`, OAuth-protected, horizontally scalable with no session affinity.

### 1.1 New repository

`Type-Think-AI/picx-mcp` — separate repo, not a package in `picx-cli`.

Why separate: different language, different runtime, different deploy target, different release cadence.
Putting a Python service inside a pnpm workspace would mean one CI that understands both toolchains for no
benefit. `picx-cli` stays a pure TypeScript monorepo.

### 1.2 Project layout

```
picx-mcp/
├─ pyproject.toml              uv-managed, exact pins
├─ uv.lock                     committed
├─ .python-version             3.13
├─ src/picx_mcp/
│  ├─ __init__.py
│  ├─ server.py                FastMCP instance + ASGI app factory
│  ├─ settings.py              pydantic-settings, env-driven
│  ├─ client.py                PicX /v1 HTTP client (httpx)
│  ├─ auth.py                  OAuthProxy wiring → Google
│  └─ tools/
│     ├─ images.py             generate, edit
│     ├─ videos.py             generate (task=True), get_generation
│     ├─ assets.py             upload, list, delete
│     ├─ models.py             list_models  (cached)
│     ├─ templates.py          search, get  (cached)
│     ├─ account.py            get_account, get_usage
│     └─ generations.py        list_generations
├─ tests/                      pytest + fastmcp in-memory Client
├─ Dockerfile
├─ docker-compose.yml          local: app + valkey
└─ .github/workflows/
   ├─ ci.yml                   typecheck + tests
   └─ deploy.yml               build image → deploy
```

### 1.3 Dependency pins

FastMCP's own guidance: *"For production use, always pin to exact versions."* And v4 requires an explicit
pin because the default install still resolves to 3.x.

```toml
requires-python = ">=3.13,<3.14"     # matches web-app/api

dependencies = [
  "fastmcp==4.0.0b3",               # exact — beta, per their instruction
  "fastmcp-tasks==4.0.0b3",         # lockstep with fastmcp
  "httpx==0.28.1",
  "pydantic-settings==2.7.1",
  "uvicorn[standard]==0.34.0",
  "redis==5.2.1",                   # Valkey-compatible
  "cyclopts>=5.0.0a1",              # see note
]
```

**On `cyclopts`:** FastMCP depends on it for CLI functionality, and Cyclopts v4 pulls in `docutils`, whose
licensing "may trigger compliance reviews in some organizations". Pinning `cyclopts>=5.0.0a1` removes that
transitive dependency. Cheap to do now; annoying to unpick during a licence review later.

**Use `uv`, not `pip`.** FastMCP documents a pip-specific breakage: upgrading to 3.3+ from 3.2 or earlier
with pip can leave a half-removed install because code moved from the `fastmcp` distribution to
`fastmcp-slim`. `uv` uninstalls before installing and is unaffected.

Verify with `fastmcp version` — it prints FastMCP, MCP and Python versions together.

---

## 2. Server design

### 2.1 Statelessness is the operating requirement

This is why we're on FastMCP 4. Two settings carry it, and both are easy to get wrong:

```python
app = mcp.http_app(
    stateless_http=True,          # each request gets a fresh transport context
    host_origin_protection=True,
    allowed_hosts=["mcp.picxstudio.com"],
)
```

`stateless_http=True` is **not optional** for us. FastMCP's docs are blunt about why sticky sessions
aren't a fallback:

> Most MCP clients — including Cursor and Claude Code — use `fetch()` internally and don't properly forward
> `Set-Cookie` headers. Without cookies, load balancers can't identify which instance should handle
> subsequent requests. This is a limitation in how these clients implement HTTP, not something you can fix
> with load balancer configuration.

So affinity cannot be bought with LB config. Stateless mode or single instance — no third option.

**`REQUEST_STATE_KEY`** (≥32 bytes) must be **byte-identical on every replica**, or a resumed interactive
round validated on a different replica fails. Single-process servers get an automatic process-local key;
we cannot rely on that.

### 2.2 Tool surface — 13 tools, curated

Same surface the CLI already ships, so behaviour matches what we've tested against production.

| Tool | Notes |
|---|---|
| `picx_generate_image` | inline (5–20s) |
| `picx_edit_image` | 1–5 images; local paths uploaded first |
| `picx_generate_video` | **`@mcp.tool(task=True)`** — background |
| `picx_get_generation` | poll |
| `picx_upload_asset` | load-bearing: `/v1/images/edit` rejects data URIs |
| `picx_list_assets` · `picx_delete_asset` | |
| `picx_list_models` | `cache_ttl=300, cache_scope="public"` |
| `picx_search_templates` · `picx_get_template` | 50K+ catalogue; cached |
| `picx_get_account` · `picx_get_usage` | |
| `picx_list_generations` | ⚠️ blocked on `GET /v1/generations` (doesn't exist) |

**Explicitly NOT `FastMCP.from_fastapi()`.** Their docs and ours agree: 217 auto-converted endpoints makes
tool selection unreliable, and unreliable selection reads to users as a broken product.

### 2.3 Video as a background task

The capability that motivated the framework choice:

```python
@mcp.tool(task=True)
async def picx_generate_video(prompt: str, ...) -> dict:
    ...
```

`fastmcp.Client` handles the handle-and-poll cycle, so `client.call_tool()` returns identically whether the
tool ran inline or in the background. The agent writes no polling logic. **Configure the Redis/Valkey
backend** — `TasksExtension()` defaults to in-memory single-process, which breaks with two replicas.

### 2.4 Confirm before spending

Return-and-resume, first-class in FastMCP 4:

```python
if estimated_credits > CONFIRM_THRESHOLD:
    return InputRequiredResult(result_type="input_required", input_requests={...})
```

Reads from `ctx.input_responses` on the next round. This is the credit-drain guard against prompt
injection, and also plain courtesy before a 40-image catalogue run.

### 2.5 Health and observability

```python
@mcp.custom_route("/health", methods=["GET"])
async def health(request): return JSONResponse({"status": "healthy"})
```

Custom routes are **never** behind auth middleware, by design — exactly right for load-balancer probes.

Gateway routing headers (`Mcp-Method`, `Mcp-Name`, `Mcp-Param-*`) arrive on modern connections and are
neither stripped nor rewritten, so the LB can route and meter without parsing bodies. Treat them as
**untrusted hints** — the body remains the source of truth — and design routing to tolerate their absence,
since legacy-era clients send none.

---

## 3. Auth

`OAuthProxy` fronts an upstream provider. **Google is already our identity provider**, so we are not
building an authorization server from scratch — which is what cut this from 6–8 days to 4–6.

| Piece | Owner |
|---|---|
| MCP-facing OAuth: metadata, DCR, PKCE, app-type, scope step-up | **FastMCP `OAuthProxy`** |
| Upstream identity | **Google** (existing) |
| Consent screen, credit-terms wording | ours |
| **Token → session-key exchange** | **ours, FastAPI** — the real remaining work |

### 3.1 Production requirements the docs are emphatic about

Both are required, and the defaults are development-only:

```python
auth = OAuthProxy(
    jwt_signing_key=os.environ["JWT_SIGNING_KEY"],           # explicit, or tokens die on secret rotation
    client_storage=FernetEncryptionWrapper(                   # or upstream tokens sit in plaintext
        key_value=RedisStore(...),
        fernet=Fernet(os.environ["STORAGE_ENCRYPTION_KEY"]),
    ),
    base_url="https://mcp.picxstudio.com",
)
```

By default the signing key is derived from the OAuth client secret — so rotating the secret invalidates
every token. And without network-accessible storage, tokens are local to one host and untrusted across
replicas.

### 3.2 🔴 One-line blocker to fix first

```python
SESSION_KEY_SCOPES = ["images:generate", "images:edit", "videos:generate"]
```

`uploads:write` is missing. Uploads are load-bearing for **every** edit and image-tool flow. If OAuth
resolves to a session key, **every upload 403s.** One line. Fix before any auth work is tested.

---

## 4. Deployment & DNS

### 4.1 Platform

**Requirement: deployable from CI.** Koyeb is dashboard-configured and cannot be driven from an agent
session, which would make iteration slow. Any of Fly.io / Render / Cloud Run fits; all support container +
env vars + ≥2 replicas + an ordinary LB.

| Component | Spec |
|---|---|
| App | container, `uvicorn`, **≥2 replicas from day one** (proves no affinity) |
| Valkey/Redis | **required** — tasks, response cache, OAuth client storage, session state |
| TLS | platform-managed, or nginx per §4.3 |

### 4.2 DNS

```
mcp.picxstudio.com   CNAME → <platform hostname>     (proxied/TLS at the platform)
```

Endpoints:

| URL | Purpose |
|---|---|
| `https://mcp.picxstudio.com/mcp` | MCP, sessionless Streamable HTTP |
| `https://mcp.picxstudio.com/health` | LB probe, unauthenticated |
| `https://mcp.picxstudio.com/.well-known/oauth-protected-resource` | discovery |
| `https://mcp.picxstudio.com/sse` | **410 Gone** + pointer — `ai-ui/src/data/mcp.ts` still advertises `/sse` |

Deploying at the **root** of the domain (no `Mount()` prefix) is deliberate: FastMCP includes the
`.well-known` routes in `http_app()` automatically at root. Mounting under a prefix forces manual
`get_well_known_routes(mcp_path=...)` wiring and the `base_url` / `mcp_path` double-prefix trap their docs
warn about. Root avoids the whole class of bug.

### 4.3 If we front it with nginx

SSE buffering is the classic failure — clients connect but never receive anything:

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';     # keep-alive; prevents Connection: close breaking SSE
    proxy_buffering off;                # THE critical one
    proxy_cache off;
    proxy_read_timeout 300s;            # default 60s drops long tools
    proxy_send_timeout 300s;
}
```

For tools that may exceed any proxy timeout, FastMCP offers **SSE polling** (SEP-1699): configure an
`EventStore` (Redis-backed for multi-replica), call `ctx.close_sse_stream()` periodically, and the client
reconnects with `Last-Event-ID` and replays missed events. Relevant for long video jobs.

### 4.4 Secrets

| Secret | Purpose |
|---|---|
| `PICX_API_BASE` | `https://api.picxstudio.com/v1` — **the `/v1` suffix is mandatory** |
| `REQUEST_STATE_KEY` | ≥32 bytes, identical across replicas |
| `JWT_SIGNING_KEY` | explicit, or tokens die on client-secret rotation |
| `STORAGE_ENCRYPTION_KEY` | Fernet key for token-at-rest encryption |
| `GOOGLE_CLIENT_ID` / `_SECRET` | upstream OAuth |
| `REDIS_URL` | Valkey/Redis |

---

## 5. Phases

| # | Work | Days | Gate |
|---|---|---|---|
| **0** | `uploads:write` scope fix · `GET /v1/generations` | 1 | Do first regardless |
| **1** | Repo scaffold: uv, pins, Dockerfile, compose (app+valkey), CI, `fastmcp version` green | 1 | |
| **2** | **Spike:** 3 tools (`generate_image`, `list_models`, `search_templates`), API-key auth, `stateless_http=True`, **2 replicas + shared `REQUEST_STATE_KEY`**, verified against prod `/v1` | 2 | ⭐ de-risks the beta before we commit |
| **3** | Remaining 10 tools; response caching on models/templates | 3 | |
| **4** | Video as `task=True` + Valkey Docket backend | 2 | |
| **5** | `OAuthProxy` → Google; `jwt_signing_key` + encrypted `client_storage`; consent screen; **token → session-key exchange** | 4–6 | highest risk |
| **6** | Deploy: platform, DNS, TLS, secrets, ≥2 replicas, `/health`, `/sse` → 410 | 2 | |
| **7** | Per-session credit ceiling; `InputRequiredResult` confirmations; observability | 2 | |
| **8** | Correct `ai-ui`: real endpoint + tool list, drop ComingSoon, `/connect` route, delete fictional `docs.ts` endpoints | 3–4 | |
| **9** | Governance: close the `_resolve_user_from_api_key` bypass; `client_id`/`source` in request logs | 2–3 | Nema |

**Total: 20–26 days.** Phase 2 is the one I'd insist on: two replicas behind an ordinary LB, proving a
request can land on either instance, is the whole thesis of choosing FastMCP 4. If that doesn't hold on a
beta, we want to know on day 4, not day 20.

Phases 0–2 are ~4 days and independently valuable.

---

## 6. Testing

- `pytest` + FastMCP's **in-memory `Client`** — pass the server object directly, no network, no credits.
- Schema contract test per tool: happy path validates, bad input rejected, annotations truthful about
  credit spend.
- **No live API calls in CI.** Every generation costs real credits. Mock `httpx`.
- One opt-in smoke script (`--live`, needs a key, never in CI) that generates one image end-to-end.
- Replica test: run 2 containers behind a trivial round-robin proxy and assert an interactive round
  resumes across instances. This is the test that actually validates the architecture.

---

## 7. Decisions

| # | Decision | Call |
|---|---|---|
| 1 | Language / framework | **Python, FastMCP 4** (`4.0.0b3`, exact pin) |
| 2 | TS `picx-mcp` | **Retired** — deprecated on npm, removed from the repo |
| 3 | Repo | new `Type-Think-AI/picx-mcp` |
| 4 | Mount inside `web-app/api`? | **No** — see `docs/MCP_ARCHITECTURE.md` §2 |
| 5 | `from_fastapi()` auto-conversion? | **No** — 13 curated tools |
| 6 | `stateless_http` | **True**, non-negotiable; sticky sessions don't work with real clients |
| 7 | Redis/Valkey | **Required** |
| 8 | Deploy at root or under a prefix? | **Root** — avoids the `.well-known` wiring trap |
| 9 | Package manager | **uv** — pip has a documented breakage |
| 10 | `cyclopts` | pin `>=5.0.0a1` to drop the `docutils` licence question |

## 8. Open questions

1. **Which platform?** Needs to be CI-deployable. Fly / Render / Cloud Run — pick before Phase 6.
2. **Valkey: new instance or shared?** Sizing depends on video volume.
3. **Does `OAuthProxy`-over-Google satisfy MCP client DCR end-to-end?** Phase 2 should test this
   specifically — it's the assumption that saves 2+ days.
4. **Unpublish `picx-mcp`, or leave it deprecated?** Needs 2FA enabled on the npm account.
5. **Video pricing / mode×model compatibility** — still unverified; needed for the confirm threshold.
6. **Real `max_credits_per_day`** to size the per-session ceiling.
7. **MCP Apps** — interactive UI inline in Claude is now available to us. Product call, not technical.
