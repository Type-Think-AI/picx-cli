/**
 * `picx mcp` command group — install into MCP clients, serve the stdio server,
 * and diagnose configuration issues.
 *
 * ## Client config paths (verified 2026-08-26)
 *
 * - Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
 *                   ~/.config/Claude/claude_desktop_config.json (Linux)
 *                   %APPDATA%/Claude/claude_desktop_config.json (Windows)
 * - Cursor:         ./.cursor/mcp.json (project) or ~/.cursor/mcp.json (--global)
 * - Claude Code:    ./.mcp.json
 * - Codex:          ./.codex/mcp.json
 * - VS Code:        ./.vscode/mcp.json
 *
 * ## Merge semantics
 *
 * We MERGE into the existing `mcpServers` object — never clobber a user's other
 * servers. The backup (.bak) is written before any mutation.
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
import { execSync, execFileSync } from "node:child_process";
import { resolveConfig, redactKey } from "@picx/core";
import { check, info, warn, fail } from "../output.js";

// ─── Client config resolution ────────────────────────────────────────────────

type ClientName = "claude" | "claude-code" | "cursor" | "codex" | "vscode";

interface ClientMeta {
  name: string;
  paths: () => string[];
  supportsGlobal?: boolean;
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
  },
  "claude-code": {
    name: "Claude Code",
    paths: () => [resolve(process.cwd(), ".mcp.json")],
  },
  cursor: {
    name: "Cursor",
    paths: () => [resolve(process.cwd(), ".cursor", "mcp.json")],
    supportsGlobal: true,
  },
  codex: {
    name: "Codex",
    paths: () => [resolve(process.cwd(), ".codex", "mcp.json")],
  },
  vscode: {
    name: "VS Code",
    paths: () => [resolve(process.cwd(), ".vscode", "mcp.json")],
  },
};

function getGlobalCursorPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

// ─── MCP server stanza ───────────────────────────────────────────────────────

/**
 * Build the JSON stanza for our MCP server entry.
 * Uses `npx` to ensure it works without a global install.
 */
function buildServerStanza(): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", "@picx/mcp"],
    env: {
      PICX_API_KEY: "${PICX_API_KEY}",
    },
  };
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

// ─── Install subcommand ──────────────────────────────────────────────────────

function installAction(opts: { client: string; global?: boolean; dryRun?: boolean }): void {
  const clientKey = opts.client.toLowerCase() as ClientName;
  const clientMeta = CLIENTS[clientKey];

  if (!clientMeta) {
    const valid = Object.keys(CLIENTS).join(", ");
    fail(new Error(`Unknown client "${opts.client}". Supported: ${valid}`));
  }

  // Resolve target path
  let targetPath: string;
  if (opts.global && clientKey === "cursor") {
    targetPath = getGlobalCursorPath();
  } else if (opts.global) {
    fail(new Error(`--global is only supported for cursor (got ${clientKey})`));
  } else {
    targetPath = clientMeta.paths()[0]!;
  }

  // Build the merged config
  const existing = readJsonSafe(targetPath);
  const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  mcpServers["picx"] = buildServerStanza();
  existing.mcpServers = mcpServers;

  // Show what we'll write
  const stanza = JSON.stringify({ picx: mcpServers["picx"] }, null, 2);
  process.stderr.write(`\n${clientMeta.name} config: ${targetPath}\n\n`);
  process.stderr.write(`Stanza to write:\n${stanza}\n\n`);

  if (opts.dryRun) {
    info("--dry-run: no files written.");
    return;
  }

  // Backup and write
  const bakPath = backupFile(targetPath);
  if (bakPath) {
    info(`Backed up → ${bakPath}`);
  }

  writeJsonAtomic(targetPath, existing);
  process.stderr.write(`✓ Wrote picx MCP server to ${targetPath}\n`);

  // Hint for the user
  process.stderr.write(
    `\nSet PICX_API_KEY in your environment. Get a key at https://ai.picxstudio.com/api\n`,
  );
}

// ─── Serve subcommand ────────────────────────────────────────────────────────

function serveAction(): void {
  // exec replaces the process — the stdio MCP server takes over
  try {
    const binPath = require.resolve("@picx/mcp/bin/picx-mcp.js");
    // execFileSync replaces stdout/stderr/stdin naturally for stdio transport
    execFileSync(process.execPath, [binPath], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (err: unknown) {
    // If require.resolve fails, try npx fallback
    try {
      execSync("npx @picx/mcp", {
        stdio: "inherit",
        env: process.env,
      });
    } catch {
      fail(err);
    }
  }
}

// ─── Doctor subcommand ───────────────────────────────────────────────────────

function doctorAction(): void {
  process.stderr.write("\npicx mcp doctor\n");
  process.stderr.write("═══════════════════════════════════════\n\n");

  let allPassed = true;
  const mark = (pass: boolean) => {
    if (!pass) allPassed = false;
    return pass;
  };

  // 1. Node version
  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split(".")[0]!, 10);
  check(
    mark(nodeMajor >= 20),
    "Node.js ≥ 20",
    nodeMajor >= 20 ? `v${nodeVer}` : `v${nodeVer} — upgrade to Node 20+ (MCP SDK requires it)`,
  );

  // 2. API key presence and format
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let configSource = "";

  try {
    const cfg = resolveConfig();
    apiKey = cfg.apiKey;
    baseUrl = cfg.baseUrl;
    configSource = "resolved from config chain";
  } catch {
    // Config resolution failed — check individual sources for better diagnostics
    apiKey = process.env.PICX_API_KEY;
    if (apiKey) configSource = "PICX_API_KEY env var";
  }

  const keyPresent = !!apiKey;
  check(
    mark(keyPresent),
    "API key present",
    keyPresent ? `${redactKey(apiKey!)} (${configSource})` : "Set PICX_API_KEY — get a key at https://ai.picxstudio.com/api",
  );

  const keyWellFormed = !!apiKey?.startsWith("pxsk_");
  check(
    mark(keyWellFormed),
    "API key well-formed (pxsk_ prefix)",
    keyWellFormed ? "valid prefix" : apiKey ? `got "${apiKey.slice(0, 6)}…" — must start with pxsk_` : "no key to check",
  );

  // 3. Base URL validation
  const resolvedUrl = baseUrl ?? process.env.PICX_API_URL ?? "https://api.picxstudio.com/v1";
  const urlHasV1 = resolvedUrl.replace(/\/$/, "").endsWith("/v1");
  check(
    mark(urlHasV1),
    "Base URL ends in /v1",
    urlHasV1 ? resolvedUrl : `${resolvedUrl} — append /v1 (bare host returns 404)`,
  );

  // 4. API connectivity (only if we have a key)
  if (apiKey && keyWellFormed) {
    process.stderr.write("\n");
    info("Checking API connectivity...");
    let apiOk = false;
    try {
      const resp = execSync(
        `node -e "fetch('${resolvedUrl}/models', {headers:{'Authorization':'Bearer ${apiKey}'}}).then(r=>{process.stdout.write(String(r.status));process.exit(0)}).catch(()=>{process.stdout.write('0');process.exit(0)})"`,
        { encoding: "utf-8", timeout: 10_000 },
      ).trim();
      apiOk = resp === "200";
      check(
        mark(apiOk),
        "API responds to /models",
        apiOk ? "HTTP 200" : `HTTP ${resp} — check key scopes and network`,
      );
    } catch {
      check(mark(false), "API responds to /models", "timeout or network error");
    }
  } else {
    process.stderr.write("\n");
    check(mark(false), "API responds to /models", "skipped (no valid key)");
  }

  // 5. Client config detection
  process.stderr.write("\n");
  process.stderr.write("  Client configs:\n");

  for (const [key, meta] of Object.entries(CLIENTS)) {
    const paths = meta.paths();
    let found = false;
    let hasPicx = false;
    let foundPath = "";

    for (const p of paths) {
      if (existsSync(p)) {
        found = true;
        foundPath = p;
        try {
          const content = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
          const servers = content.mcpServers as Record<string, unknown> | undefined;
          if (servers && "picx" in servers) {
            hasPicx = true;
          }
        } catch {
          // Malformed config
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
          const content = JSON.parse(readFileSync(gp, "utf-8")) as Record<string, unknown>;
          const servers = content.mcpServers as Record<string, unknown> | undefined;
          if (servers && "picx" in servers) hasPicx = true;
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
    process.stderr.write("All checks passed. The MCP server is ready.\n\n");
  } else {
    process.stderr.write("Some checks failed. Fix the issues above and re-run `picx mcp doctor`.\n\n");
    process.exit(1);
  }
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerMcpCommand(parent: Command): void {
  const mcp = parent.command("mcp").description("Manage MCP server installation and diagnostics");

  mcp
    .command("install")
    .description("Install the PicX MCP server into a client's config")
    .requiredOption(
      "--client <name>",
      "Target client: claude, claude-code, cursor, codex, vscode",
    )
    .option("--global", "Write to global config (cursor only)")
    .option("--dry-run", "Print the config stanza without writing")
    .action(installAction);

  mcp
    .command("serve")
    .description("Start the PicX MCP stdio server")
    .action(serveAction);

  mcp
    .command("doctor")
    .description("Diagnose MCP server configuration and connectivity")
    .action(doctorAction);
}
