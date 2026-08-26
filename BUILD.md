# BUILD.md — implementation spec

**Read this before writing any code.** Every signature below was extracted from the published package
tarballs on 2026-08-26, not from memory. Where this document and your training data disagree, **this
document wins**.

Companions: `PRD.md` (features), `PLAN.md` (architecture).

---

## 0. Verified ground truth

### 0.1 MCP protocol version — do not get this wrong

```
LATEST_PROTOCOL_VERSION             = "2025-11-25"
DEFAULT_NEGOTIATED_PROTOCOL_VERSION = "2025-03-26"
SUPPORTED_PROTOCOL_VERSIONS         = ["2024-10-07","2024-11-05","2025-03-26","2025-06-18","2025-11-25"]
```

🔴 **There is no protocol version `2026-07-28`.** That is the npm release date of SDK v2.0.0. Earlier
drafts of our planning notes stated it as a spec version; it is wrong. Never emit it in version
negotiation. Never hardcode a version at all — import the constant.

### 0.2 Packages

| Package | Version | Notes |
|---|---|---|
| `@modelcontextprotocol/server` | `2.0.0` | deps: `zod@^4.2.0`, `@modelcontextprotocol/core@2.0.0` |
| `@modelcontextprotocol/core` | `2.0.0` | types + protocol |
| `@modelcontextprotocol/client` | `2.0.0` | test harness only |
| `@modelcontextprotocol/node` | `2.0.0` | node-specific helpers |
| `@modelcontextprotocol/sdk` | `1.30.0` | 🔴 **legacy v1 monolith — do NOT use** |
| `zod` | `^4.2.0` | v4, not v3. Schema API differs |
| `picx-ai` | `0.3.1` | our own SDK, zero runtime deps |

Subpath exports of `@modelcontextprotocol/server`:
`.` · `./stdio` · `./validators/ajv` · `./validators/cf-worker` · `./_shims`

### 0.3 Verified API signatures

```ts
// Construction
new McpServer(serverInfo: Implementation, options?: ServerOptions)
//   Implementation = { name: string; version: string; title?: string }

// Tools — NOTE: inputSchema is a ZodRawShape (a PLAIN OBJECT of zod schemas),
// NOT z.object({...}). The SDK wraps it for you. Passing z.object() is the
// single most common mistake here.
server.registerTool(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: ZodRawShape;          // { prompt: z.string(), size: z.enum([...]) }
    outputSchema?: ZodRawShape | StandardSchemaWithJSON;
    annotations?: ToolAnnotations;      // { readOnlyHint, destructiveHint, idempotentHint, openWorldHint }
    icons?: Icon[];
    _meta?: Record<string, unknown>;
  },
  cb: (args, ctx) => Promise<CallToolResult>
): RegisteredTool

server.registerPrompt(name, { title?, description?, argsSchema }, cb): RegisteredPrompt
server.registerResource(name, uriOrTemplate: string | ResourceTemplate, config, cb): RegisteredResource

server.connect(transport: Transport): Promise<void>
server.close(): Promise<void>
server.isConnected(): boolean
server.sendToolListChanged(): void
server.toolInputSchemaJson(name: string): Record<string, unknown> | undefined
```

```ts
// stdio — from "@modelcontextprotocol/server/stdio"
serveStdio(factory: McpServerFactory, options?: ServeStdioOptions): StdioServerHandle
// or drive manually with: new StdioServerTransport()

// HTTP / Cloudflare Worker — from "@modelcontextprotocol/server"
createMcpHandler(factory: McpServerFactory, options?: CreateMcpHandlerOptions): McpHttpHandler
//   CreateMcpHandlerOptions.legacy?: 'stateless' | 'reject'
//     'stateless' (default) — serves 2025-era non-envelope traffic per-request; GET/DELETE → 405
//     'reject'              — modern-only; legacy requests get unsupported-protocol-version
//   CreateMcpHandlerOptions.onError?: (err) => void   // reporting only, never alters the response
WebStandardStreamableHTTPServerTransport   // web-standard Request/Response
PerRequestHTTPServerTransport              // per-request node transport
```

```ts
// OAuth — the RESOURCE SERVER side ships in the SDK. We only build the AS.
requireBearerAuth(options: BearerAuthOptions): (request: Request) => Promise<AuthInfo | Response>
verifyBearerToken(authorizationHeader, options: BearerAuthOptions): Promise<AuthInfo>
bearerAuthChallengeResponse(error, options?): Response
buildOAuthProtectedResourceMetadata(options: AuthMetadataOptions): OAuthProtectedResourceMetadata
getOAuthProtectedResourceMetadataUrl(serverUrl: URL): string
oauthMetadataResponse(request, options: AuthMetadataOptions): Response | undefined

// Security helpers — USE THESE, don't hand-roll
validateHostHeader(hostHeader, allowedHostnames): HostHeaderValidationResult
hostHeaderValidationResponse(req, allowedHostnames): Response | undefined
validateOriginHeader(originHeader, allowedOriginHostnames): OriginValidationResult
originValidationResponse(req, allowedOriginHostnames): Response | undefined
localhostAllowedHostnames(): string[]
localhostAllowedOrigins(): string[]
```

```ts
// Multi-Round-Trip Requests (replaces server→client calls)
inputRequired(spec: InputRequiredSpec): InputRequiredResult
inputResponse(...)
isInputRequiredResult(result): result is InputRequiredResult

// Tasks — IN CORE, not a separate extension package
Task, TaskStatus, TaskMetadata, TaskCreationParams, CreateTaskResult,
GetTaskRequest, GetTaskResult, GetTaskPayloadRequest, ListTasksRequest,
CancelTaskRequest, TaskStatusNotification, RELATED_TASK_META_KEY,
isTaskAugmentedRequestParams

// Discovery
DiscoverRequest, DiscoverResult

// Present for backward compat — DO NOT ADOPT (deprecated per SEP-2577)
ListRootsRequest, CreateMessageRequest /* sampling */, SetLevelRequest /* logging */
```

### 0.4 PicX API ground truth

- Base URL **must** include `/v1`: `https://api.picxstudio.com/v1`. Bare host 404s.
- Auth: `Authorization: Bearer pxsk_…`
- Webhook envelope keys: **`id`** and **`event`** — NOT `event_id`/`event_type`.
- Signature: `X-PicX-Signature: t={ts},v1={hmac}` over `{timestamp}.{raw_body}`. Correlate on the `id`
  **inside the signed body**, never a URL path param.
- `POST /v1/images/edit` rejects data URIs. Local files must go through `POST /v1/assets` first.
- Scopes: `images:generate`, `images:edit`, `videos:generate`, `audio:generate`, `agent:run`, `uploads:write`.

---

## 1. Repo layout and file ownership

One owner per file. **Never edit a file you do not own** — if you need a change in someone else's file,
state it in your report instead.

```
picx-cli/
├─ package.json                      [OWNER: lead]
├─ pnpm-workspace.yaml               [OWNER: lead]
├─ tsconfig.base.json                [OWNER: lead]
├─ packages/
│  ├─ core/
│  │  ├─ package.json                [lead]
│  │  ├─ src/index.ts                [lead]
│  │  ├─ src/config.ts               [A1]  config resolution + credential store
│  │  ├─ src/client.ts               [lead] PicX API client (wraps picx-ai)
│  │  ├─ src/errors.ts               [A1]  error taxonomy → exit codes
│  │  └─ src/upload.ts               [A2]  local path → https URL via /v1/assets
│  ├─ tools/
│  │  ├─ package.json                [lead]
│  │  ├─ src/index.ts                [lead] registry assembly
│  │  ├─ src/types.ts                [lead] ToolDef contract
│  │  ├─ src/images.ts               [A2]  generate_image, edit_image
│  │  ├─ src/videos.ts               [A3]  generate_video, get_generation
│  │  ├─ src/assets.ts               [A4]  upload_asset, list_assets
│  │  ├─ src/models.ts               [A5]  list_models
│  │  ├─ src/account.ts              [A5]  get_account
│  │  └─ src/prompts.ts              [A6]  MCP prompts + resources
│  ├─ mcp/
│  │  ├─ package.json                [lead]
│  │  ├─ src/server.ts               [A7]  McpServer factory + registration
│  │  ├─ src/stdio.ts                [A7]  serveStdio entry
│  │  └─ bin/picx-mcp.js             [A7]  #!/usr/bin/env node
│  └─ cli/
│     ├─ package.json                [lead]
│     ├─ src/index.ts                [A8]  commander wiring
│     ├─ src/commands/*.ts           [A8]  image, video, assets, models, account
│     ├─ src/commands/mcp.ts         [A9]  mcp install/serve/doctor
│     ├─ src/output.ts               [A9]  --json / --quiet / exit codes
│     └─ bin/picx.js                 [A8]
└─ tests/                            [A10] vitest, contract tests
```

---

## 2. Task assignments

Each task is self-contained. Every agent: read this file first, own only your files, `export` clean
types, do not run `pnpm install` (the lead does that once).

| Agent | Task | Files |
|---|---|---|
| **A1** | Config + errors. Precedence flag → env (`PICX_API_KEY`, `PICX_API_URL`) → `./.picxrc` → `~/.config/picx/config.json`. Error taxonomy mapping HTTP status → exit codes `0/1/2/3/4/5/6`. Never log a key; redact to `pxsk_…last4`. | `core/src/config.ts`, `core/src/errors.ts` |
| **A2** | Image tools + upload bridge. `picx_generate_image`, `picx_edit_image`. Local path → `/v1/assets` → https URL, because edit rejects data URIs. | `tools/src/images.ts`, `core/src/upload.ts` |
| **A3** | Video tools. All 7 modes with per-mode required-input validation (`lipsync` needs no prompt; `frames` needs `start_frame_url`; `extend`/`edit` need `source_video_url`). 202 → job handle. `picx_get_generation` polls. | `tools/src/videos.ts` |
| **A4** | Asset tools. `picx_upload_asset`, `picx_list_assets`. Return **resource links**, never base64. | `tools/src/assets.ts` |
| **A5** | Models + account. `picx_list_models` (5-min cache), `picx_get_account` merging `/account/me` + `/tier`. Never hardcode credit costs. | `tools/src/models.ts`, `tools/src/account.ts` |
| **A6** | MCP prompts + resources: `picx:product_hero`, `picx:thumbnail_ab`, `picx:model_pick`; resources `picx://models`, `picx://assets/{id}`. | `tools/src/prompts.ts` |
| **A7** | MCP server. `McpServer` factory, register every tool from the registry, `serveStdio` entry, bin shim. Import the version constant — never hardcode. | `mcp/src/*`, `mcp/bin/*` |
| **A8** | CLI commands: `image`, `image edit`, `video`, `job`, `upload`, `assets`, `models`, `whoami`, `balance`, `usage`, `tier`. Commander. Accept local paths anywhere a URL is taken. | `cli/src/index.ts`, `cli/src/commands/*.ts`, `cli/bin/picx.js` |
| **A9** | `picx mcp install --client claude\|claude-code\|cursor\|codex\|vscode` writing each client's real config; `mcp serve`; `mcp doctor`. Plus output layer: `--json`, `--quiet`, stdout/stderr split, exit codes. | `cli/src/commands/mcp.ts`, `cli/src/output.ts` |
| **A10** | Vitest contract tests: every tool's `inputSchema` validates its happy path and rejects a bad one; exit-code mapping; config precedence; webhook signature verification. Mock `fetch` — **no live API calls, no credit spend.** | `tests/**` |

---

## 3. Non-negotiables

1. `inputSchema` is a **ZodRawShape** — a plain object of zod schemas. Not `z.object({...})`.
2. **zod v4**, not v3.
3. Import `LATEST_PROTOCOL_VERSION`; never hardcode a protocol version.
4. Base URL always ends `/v1`.
5. Never log or echo an API key. Redact everywhere.
6. Images as **resource links**, never base64 — base64 destroys the client's context window.
7. Every tool declares `annotations.readOnlyHint` truthfully. Generation tools spend credits and are
   **not** read-only; `list_*`/`get_*` are.
8. No live API calls in tests. Every generation costs real credits.
9. `@modelcontextprotocol/sdk` (v1) must appear in no import anywhere.
10. Do not run `pnpm install`, `pnpm build` or `git commit` — the lead does those once, centrally.
