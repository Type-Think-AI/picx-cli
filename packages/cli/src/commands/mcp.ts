/**
 * `picx mcp` command group — install into MCP clients, serve the stdio server,
 * and diagnose configuration issues.
 *
 * ## The server is remote, not local (rewritten 2026-09-19)
 *
 * PicX's MCP server (`picx-mcp`) is a hosted Python/FastMCP service at
 * `https://mcp.picxstudio.com/`, reachable over Streamable HTTP with OAuth 2.1.
 * There is no local process to launch. `npx @picx/mcp` — what this file wrote
 * until now — has never been a real package: `@picx/mcp` 404s on npm, and the
 * unscoped `picx-mcp` package is the OLD TypeScript stdio prototype, explicitly
 * marked deprecated on its own npm page. Every client below now gets the real
 * remote-HTTP shape for ITS OWN schema, which is not one shape — five clients,
 * four different config dialects, verified against each client's own docs
 * rather than assumed to share one format:
 *
 * - **Claude Desktop** is stdio-only at the config-file level (its Zod schema
 *   rejects a bare `url`/`type` — confirmed against a Claude Desktop bug report
 *   for exactly this). A remote server here needs the `mcp-remote` bridge
 *   process, OR (recommended, and what `install` now tells the user) the
 *   Settings → Connectors UI, which is what Anthropic built specifically to
 *   take HTTP servers out of this file.
 * - **Claude Code**, **Cursor**: `{"mcpServers": {"picx": {"type": "http", "url": ...}}}`.
 * - **VS Code**: top-level key is `"servers"`, NOT `"mcpServers"` — a different
 *   key entirely, verified against code.visualstudio.com's own reference.
 * - **Codex**: config is TOML at `~/.codex/config.toml` (or project
 *   `.codex/config.toml`), `[mcp_servers.picx]` with a bare `url` — not JSON,
 *   and not the `.codex/mcp.json` path this file used to write, which Codex
 *   does not read.
 *
 * ## Merge semantics
 *
 * We MERGE into the existing servers map — never clobber a user's other
 * servers. The backup (.bak) is written before any mutation. `uninstall`
 * removes only the `picx` entry, restoring nothing else.
 */

import { Command } from "commander";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";
import { check, info, fail } from "../output.js";

// The real, live, OAuth-protected endpoint. Not a package name, not a local
// port — see the module docstring for why every client-specific stanza below
// is built from this one URL rather than an npx/command invocation.
const PICX_MCP_URL = "https://mcp.picxstudio.com/";

// ─── Client config resolution ────────────────────────────────────────────────

type ClientName = "claude" | "claude-code" | "cursor" | "codex" | "vscode";

interface ClientMeta {
  name: string;
  paths: () => string[];
  supportsGlobal?: boolean;
  /** How this client's config format works, so install/uninstall can branch. */
  format: "json-mcpServers" | "json-servers" | "toml-codex" | "stdio-only";
}

function getClaudeDesktopPaths(): string[] {
  switch (platform()) {
    case "darwin":
      return [join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")];
    case "linux":
      return [join(homedir(), ".config", "Claude", "claude_desktop_config.json")];
    case "win32": {
      const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
      return [join(appdata, "Claude", "claude_desktop_config.json")];
    }
    default:
      return [join(homedir(), ".config", "Claude", "claude_desktop_config.json")];
  }
}

const CLIENTS: Record<ClientName, ClientMeta> = {
  claude: {
    name: "Claude Desktop",
    paths: getClaudeDesktopPaths,
    format: "stdio-only",
  },
  "claude-code": {
    name: "Claude Code",
    paths: () => [resolve(process.cwd(), ".mcp.json")],
    format: "json-mcpServers",
  },
  cursor: {
    name: "Cursor",
    paths: () => [resolve(process.cwd(), ".cursor", "mcp.json")],
    supportsGlobal: true,
    format: "json-mcpServers",
  },
  codex: {
    name: "Codex",
    // ~/.codex/config.toml (or project .codex/config.toml). NOT .codex/mcp.json
    // — Codex does not read a JSON file for this; it reads TOML. Verified
    // against developers.openai.com/codex/mcp's own config.toml examples.
    paths: () => [join(homedir(), ".codex", "config.toml")],
    format: "toml-codex",
  },
  vscode: {
    name: "VS Code",
    paths: () => [resolve(process.cwd(), ".vscode", "mcp.json")],
    format: "json-servers",
  },
};

function getGlobalCursorPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

// ─── MCP server stanza ───────────────────────────────────────────────────────

/**
 * The remote-HTTP stanza for clients using `{"mcpServers": {...}}` with a
 * `type`/`url` shape (Claude Code, Cursor). No `command`, no `env` — there is
 * nothing to launch and no API key to inject; OAuth happens in the client's
 * own browser flow the first time it connects.
 */
function buildHttpStanza(): Record<string, unknown> {
  return { type: "http", url: PICX_MCP_URL };
}

// ─── File operations ─────────────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function backupFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  const bakPath = filePath + ".bak";
  copyFileSync(filePath, bakPath);
  return bakPath;
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Very small, purpose-built TOML line editor for Codex's `config.toml`.
 *
 * Deliberately NOT a general TOML writer: pulling in a TOML library to add
 * one four-line `[mcp_servers.picx]` table is disproportionate, and a real
 * writer would reformat a file we do not own and should touch minimally. This
 * appends (or, on uninstall, removes) exactly the `[mcp_servers.picx]` table
 * as a contiguous text block, leaving every other line byte-identical.
 */
function upsertCodexTable(filePath: string, url: string): { before: string; after: string } {
  const before = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const header = "[mcp_servers.picx]";
  const block = `${header}\nurl = "${url}"\n`;

  const lines = before.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === header);
  let after: string;
  if (headerIdx === -1) {
    after = before.length > 0 && !before.endsWith("\n") ? `${before}\n\n${block}` : `${before}\n${block}`;
  } else {
    // Replace the existing table: from its header to the line before the next
    // "[" header (or end of file), so a re-install doesn't duplicate the table.
    let endIdx = lines.length;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith("[")) {
        endIdx = i;
        break;
      }
    }
    const rebuilt = [...lines.slice(0, headerIdx), ...block.split("\n").slice(0, -1), ...lines.slice(endIdx)];
    after = rebuilt.join("\n");
  }
  return { before, after };
}

function removeCodexTable(filePath: string): { before: string; after: string; removed: boolean } {
  const before = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const header = "[mcp_servers.picx]";
  const lines = before.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === header);
  if (headerIdx === -1) return { before, after: before, removed: false };

  let endIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i]!.trim().startsWith("[")) {
      endIdx = i;
      break;
    }
  }
  const rebuilt = [...lines.slice(0, headerIdx), ...lines.slice(endIdx)];
  return { before, after: rebuilt.join("\n"), removed: true };
}

// ─── Install subcommand ──────────────────────────────────────────────────────

function installAction(opts: { client: string; global?: boolean; printOnly?: boolean }): void {
  const clientKey = opts.client.toLowerCase() as ClientName;
  const clientMeta = CLIENTS[clientKey];

  if (!clientMeta) {
    const valid = Object.keys(CLIENTS).join(", ");
    fail(new Error(`Unknown client "${opts.client}". Supported: ${valid}`));
    return;
  }

  if (clientMeta.format === "stdio-only") {
    // Claude Desktop's config file validates stdio servers only; writing a
    // url/type entry here either gets silently stripped or crashes the app on
    // next launch, depending on version — see the module docstring. The
    // correct install path is the Connectors UI, which is what Anthropic built
    // specifically to take remote HTTP servers out of this file. We do NOT
    // write anything, dry-run or otherwise, and this is not gated by
    // --print-only: there is no safe JSON to preview because there is no safe
    // JSON to write.
    process.stderr.write(`\n${clientMeta.name} does not take a remote MCP server in its config file.\n\n`);
    process.stderr.write(
      "Claude Desktop validates only local (stdio) servers in claude_desktop_config.json;\n" +
        "a remote url/type entry there is silently dropped or crashes the app on next launch.\n\n" +
        "Add PicX instead through the app itself:\n" +
        "  Settings → Connectors → Add custom connector\n" +
        `  Server URL: ${PICX_MCP_URL}\n\n` +
        "PicX uses OAuth — Claude opens a sign-in page on first use, no API key needed.\n",
    );
    return;
  }

  // Resolve target path
  let targetPath: string;
  if (opts.global && clientKey === "cursor") {
    targetPath = getGlobalCursorPath();
  } else if (opts.global) {
    fail(new Error(`--global is only supported for cursor (got ${clientKey})`));
    return;
  } else {
    targetPath = clientMeta.paths()[0]!;
  }

  if (clientMeta.format === "toml-codex") {
    const { after } = upsertCodexTable(targetPath, PICX_MCP_URL);
    process.stderr.write(`\n${clientMeta.name} config: ${targetPath}\n\n`);
    process.stderr.write(`Table to write:\n[mcp_servers.picx]\nurl = "${PICX_MCP_URL}"\n\n`);
    if (opts.printOnly) {
      info("--print-only: no files written.");
      return;
    }
    const bakPath = backupFile(targetPath);
    if (bakPath) info(`Backed up → ${bakPath}`);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, after, "utf-8");
    process.stderr.write(`✓ Wrote picx MCP server to ${targetPath}\n`);
    process.stderr.write(
      "\nOAuth runs automatically on first use — no API key needed. If Codex ever asks,\n" +
        "run: codex mcp login picx\n",
    );
    return;
  }

  // JSON clients: "json-mcpServers" (Claude Code, Cursor) or "json-servers" (VS Code).
  const topLevelKey = clientMeta.format === "json-servers" ? "servers" : "mcpServers";
  const existing = readJsonSafe(targetPath);
  const servers = (existing[topLevelKey] ?? {}) as Record<string, unknown>;
  servers["picx"] = buildHttpStanza();
  existing[topLevelKey] = servers;

  const stanza = JSON.stringify({ picx: servers["picx"] }, null, 2);
  process.stderr.write(`\n${clientMeta.name} config: ${targetPath}\n\n`);
  process.stderr.write(`Stanza to write (under "${topLevelKey}"):\n${stanza}\n\n`);

  if (opts.printOnly) {
    info("--print-only: no files written.");
    return;
  }

  const bakPath = backupFile(targetPath);
  if (bakPath) {
    info(`Backed up → ${bakPath}`);
  }

  writeJsonAtomic(targetPath, existing);
  process.stderr.write(`✓ Wrote picx MCP server to ${targetPath}\n`);
  process.stderr.write(
    "\nOAuth runs automatically on first use — the client opens a sign-in page,\n" +
      "no API key needed.\n",
  );
}

// ─── Uninstall subcommand ────────────────────────────────────────────────────

function uninstallAction(opts: { client: string; global?: boolean }): void {
  const clientKey = opts.client.toLowerCase() as ClientName;
  const clientMeta = CLIENTS[clientKey];

  if (!clientMeta) {
    const valid = Object.keys(CLIENTS).join(", ");
    fail(new Error(`Unknown client "${opts.client}". Supported: ${valid}`));
    return;
  }

  if (clientMeta.format === "stdio-only") {
    process.stderr.write(
      `\n${clientMeta.name}: PicX isn't installed via config file here — remove it in the app\n` +
        "under Settings → Connectors instead.\n",
    );
    return;
  }

  let targetPath: string;
  if (opts.global && clientKey === "cursor") {
    targetPath = getGlobalCursorPath();
  } else if (opts.global) {
    fail(new Error(`--global is only supported for cursor (got ${clientKey})`));
    return;
  } else {
    targetPath = clientMeta.paths()[0]!;
  }

  if (!existsSync(targetPath)) {
    info(`${clientMeta.name}: no config file at ${targetPath} — nothing to remove.`);
    return;
  }

  if (clientMeta.format === "toml-codex") {
    const { after, removed } = removeCodexTable(targetPath);
    if (!removed) {
      info(`${clientMeta.name}: picx is not registered in ${targetPath}.`);
      return;
    }
    const bakPath = backupFile(targetPath);
    if (bakPath) info(`Backed up → ${bakPath}`);
    writeFileSync(targetPath, after, "utf-8");
    process.stderr.write(`✓ Removed picx from ${targetPath}\n`);
    return;
  }

  const topLevelKey = clientMeta.format === "json-servers" ? "servers" : "mcpServers";
  const existing = readJsonSafe(targetPath);
  const servers = existing[topLevelKey] as Record<string, unknown> | undefined;
  if (!servers || !("picx" in servers)) {
    info(`${clientMeta.name}: picx is not registered in ${targetPath}.`);
    return;
  }

  const bakPath = backupFile(targetPath);
  if (bakPath) info(`Backed up → ${bakPath}`);

  delete servers["picx"];
  existing[topLevelKey] = servers;
  writeJsonAtomic(targetPath, existing);
  process.stderr.write(`✓ Removed picx from ${targetPath}\n`);
}

// ─── Serve subcommand ────────────────────────────────────────────────────────

function serveAction(): void {
  // There is no local server to launch — picx-mcp is a hosted remote service.
  // This subcommand exists so a stale invocation (docs, muscle memory, a
  // script from before the server moved remote) fails with an explanation
  // instead of a confusing "command not found @picx/mcp" from npx.
  process.stderr.write(
    "\n`picx mcp serve` no longer starts a local server — picx-mcp is a hosted\n" +
      `remote service at ${PICX_MCP_URL}. There is nothing to launch locally.\n\n` +
      "Run `picx mcp install --client <name>` to connect a client to it instead.\n",
  );
  process.exitCode = 1;
}

// ─── Doctor subcommand ───────────────────────────────────────────────────────

/**
 * True when `content[key]` (either `mcpServers` or `servers`, depending on
 * client format) has a `picx` entry.
 */
function hasPicxEntry(content: Record<string, unknown>, topLevelKey: string): boolean {
  const servers = content[topLevelKey] as Record<string, unknown> | undefined;
  return !!servers && "picx" in servers;
}

function doctorAction(): void {
  process.stderr.write("\npicx mcp doctor\n");
  process.stderr.write("═══════════════════════════════════════\n\n");

  let allPassed = true;
  const mark = (pass: boolean) => {
    if (!pass) allPassed = false;
    return pass;
  };

  // 1. Node version (still relevant: the CLI itself, config file writing).
  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split(".")[0]!, 10);
  check(
    mark(nodeMajor >= 20),
    "Node.js ≥ 20",
    nodeMajor >= 20 ? `v${nodeVer}` : `v${nodeVer} — upgrade to Node 20+`,
  );

  // 2. The MCP server itself is reachable and, separately, whether it demands
  // OAuth. Neither check needs a PICX_API_KEY — picx-mcp is remote and
  // OAuth-protected; the CLI holds no credential for it. A 401 here is the
  // EXPECTED, healthy state once OAuth is configured server-side: it is what
  // tells a connecting client to start the sign-in flow, and treating it as a
  // failure would be exactly the "go get an API key" regression this rewrite
  // exists to avoid.
  process.stderr.write("\n");
  info(`Checking ${PICX_MCP_URL} ...`);
  let serverReachable = false;
  try {
    const resp = execSync(
      `node -e "fetch('${PICX_MCP_URL}', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}).then(r=>{process.stdout.write(String(r.status))}).catch(()=>{process.stdout.write('0')})"`,
      { encoding: "utf-8", timeout: 10_000 },
    ).trim();
    const status = Number(resp);
    serverReachable = status === 200 || status === 401;
    check(
      mark(serverReachable),
      "MCP server reachable",
      serverReachable ? `HTTP ${status}` : `HTTP ${status || "no response"} — check network`,
    );
    if (serverReachable) {
      info(
        status === 401
          ? "  OAuth is required — a connecting client will be sent to sign in."
          : "  Running in open/API-key mode (no OAuth challenge from this server today).",
      );
    }
  } catch {
    check(mark(false), "MCP server reachable", "timeout or network error");
  }

  // 3. Client config detection — per client's own format, not one shared shape.
  process.stderr.write("\n");
  process.stderr.write("  Client configs:\n");

  for (const [key, meta] of Object.entries(CLIENTS)) {
    if (meta.format === "stdio-only") {
      info(`    ${meta.name}: config-file install not applicable — see \`picx mcp install --client ${key}\` for the Connectors UI steps.`);
      continue;
    }

    const paths = meta.paths();
    let found = false;
    let hasPicx = false;
    let foundPath = "";

    for (const p of paths) {
      if (existsSync(p)) {
        found = true;
        foundPath = p;
        if (meta.format === "toml-codex") {
          const content = readFileSync(p, "utf-8");
          hasPicx = content.split("\n").some((l) => l.trim() === "[mcp_servers.picx]");
        } else {
          const topLevelKey = meta.format === "json-servers" ? "servers" : "mcpServers";
          try {
            hasPicx = hasPicxEntry(JSON.parse(readFileSync(p, "utf-8")), topLevelKey);
          } catch {
            // Malformed config — leave hasPicx false, reported below.
          }
        }
        break;
      }
    }

    // Also check global cursor
    if (key === "cursor" && !found) {
      const gp = getGlobalCursorPath();
      if (existsSync(gp)) {
        found = true;
        foundPath = gp;
        try {
          hasPicx = hasPicxEntry(JSON.parse(readFileSync(gp, "utf-8")), "mcpServers");
        } catch {}
      }
    }

    if (!found) {
      info(`    ${meta.name}: not found`);
    } else if (hasPicx) {
      check(true, `${meta.name}`, `picx registered — ${foundPath}`);
    } else {
      check(false, `${meta.name}`, `exists but picx not registered — run \`picx mcp install --client ${key}\``);
      allPassed = false;
    }
  }

  // Summary
  process.stderr.write("\n");
  if (allPassed) {
    process.stderr.write("All checks passed.\n\n");
  } else {
    process.stderr.write("Some checks failed. Fix the issues above and re-run `picx mcp doctor`.\n\n");
    process.exit(1);
  }
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerMcpCommand(parent: Command): void {
  const mcp = parent.command("mcp").description("Manage the PicX MCP server (mcp.picxstudio.com) in your clients");

  mcp
    .command("install")
    .description("Register PicX's remote MCP server in a client's config")
    .requiredOption(
      "--client <name>",
      "Target client: claude, claude-code, cursor, codex, vscode",
    )
    .option("--global", "Write to global config (cursor only)")
    // NOT --dry-run: the top-level `picx` program already declares a
    // --dry-run option with an unrelated meaning ("show estimated credit
    // cost"), and Commander drops a subcommand option that collides with one
    // declared on an ancestor — confirmed empirically, opts.dryRun read
    // `undefined` here even when --dry-run was passed directly to `install`.
    // --print-only avoids the collision entirely rather than working around it.
    .option("--print-only", "Print the config stanza without writing any file")
    .action(installAction);

  mcp
    .command("uninstall")
    .description("Remove PicX's MCP server entry from a client's config")
    .requiredOption(
      "--client <name>",
      "Target client: claude, claude-code, cursor, codex, vscode",
    )
    .option("--global", "Remove from global config (cursor only)")
    .action(uninstallAction);

  mcp
    .command("serve")
    .description("(removed — picx-mcp is a hosted remote server, nothing to run locally)")
    .action(serveAction);

  mcp
    .command("doctor")
    .description("Check MCP server reachability and client config registration")
    .action(doctorAction);
}
