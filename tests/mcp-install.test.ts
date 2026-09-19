/**
 * mcp-install.test.ts — `picx mcp install/uninstall/doctor` against real
 * per-client config formats.
 *
 * Drives the REAL BUILT CLI (`dist/index.js`) as a subprocess, against
 * isolated fixture directories — not the module's internal functions, none of
 * which are exported. This is deliberate: the bug this file guards against
 * (`--dry-run` silently writing the file anyway) was a Commander flag-name
 * collision between the top-level program and the `install` subcommand, which
 * only reproduces through the real CLI's actual argument parsing. A unit test
 * against an internal function called directly would never have caught it —
 * it did not catch it originally, which is why the bug shipped.
 *
 * Requires `pnpm build` to have run first (the CI job does this before test).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const CLI_DIST = resolve(__dirname, "../packages/cli/dist/index.js");
const REAL_MCP_URL = "https://mcp.picxstudio.com/";

/**
 * Drive the built CLI and capture BOTH streams regardless of exit code.
 *
 * Deliberately `spawnSync`, not `execFileSync`: `execFileSync`'s return value
 * on a zero exit is stdout ONLY — stderr is piped (never inherited to the
 * terminal) but discarded, not exposed, unless the call throws. Every
 * `install`/`doctor` message in this CLI goes to stderr by design (so stdout
 * stays clean for machine-readable output elsewhere), so an `execFileSync`
 * helper silently loses the very output these tests exist to check on any
 * successful (exit 0) run — which was the actual cause of four failures here
 * before this was fixed, not a bug in the CLI.
 */
function run(args: string[], opts: { cwd: string; home?: string }): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [CLI_DIST, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.home ? { HOME: opts.home } : {}) },
    encoding: "utf-8",
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

let workDir: string;

beforeEach(() => {
  workDir = join(tmpdir(), `picx-mcp-test-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("mcp install --print-only", () => {
  it("writes nothing to disk", () => {
    mkdirSync(join(workDir, ".vscode"), { recursive: true });
    const result = run(["mcp", "install", "--client", "vscode", "--print-only"], { cwd: workDir });

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no files written/i);
    expect(existsSync(join(workDir, ".vscode", "mcp.json"))).toBe(false);
  });

  it("does not collide with the top-level program's unrelated --dry-run flag", () => {
    // Regression test for the actual bug: --dry-run on `mcp install` used to
    // be silently ignored because the top-level `picx` program ALSO declares
    // --dry-run (a different feature — "show estimated credit cost"), and
    // Commander drops the child option when an ancestor already owns the
    // name. --print-only was chosen specifically to not collide with anything
    // in the parent chain. This test would fail if that name ever aliased
    // back onto another declared option.
    mkdirSync(join(workDir, ".vscode"), { recursive: true });
    const result = run(["mcp", "install", "--client", "vscode", "--print-only"], { cwd: workDir });
    expect(existsSync(join(workDir, ".vscode", "mcp.json"))).toBe(false);
    expect(result.stdout + result.stderr).toContain(REAL_MCP_URL);
  });
});

describe("mcp install — VS Code", () => {
  it("writes under the 'servers' key, not 'mcpServers'", () => {
    // VS Code's own schema uses "servers" as the top-level key — verified
    // against code.visualstudio.com's own mcp.json reference. Writing
    // "mcpServers" here (the old bug) produces a file VS Code never reads.
    mkdirSync(join(workDir, ".vscode"), { recursive: true });
    run(["mcp", "install", "--client", "vscode"], { cwd: workDir });

    const content = JSON.parse(readFileSync(join(workDir, ".vscode", "mcp.json"), "utf-8"));
    expect(content.mcpServers).toBeUndefined();
    expect(content.servers.picx).toEqual({ type: "http", url: REAL_MCP_URL });
  });

  it("uninstall removes only the picx entry, preserving siblings", () => {
    mkdirSync(join(workDir, ".vscode"), { recursive: true });
    writeFileSync(
      join(workDir, ".vscode", "mcp.json"),
      JSON.stringify({ servers: { "someone-elses-server": { type: "http", url: "https://example.com" } } }),
    );
    run(["mcp", "install", "--client", "vscode"], { cwd: workDir });
    run(["mcp", "uninstall", "--client", "vscode"], { cwd: workDir });

    const content = JSON.parse(readFileSync(join(workDir, ".vscode", "mcp.json"), "utf-8"));
    expect(content.servers.picx).toBeUndefined();
    expect(content.servers["someone-elses-server"]).toBeDefined();
  });
});

describe("mcp install — Cursor / Claude Code (mcpServers, type/url)", () => {
  it("writes a real remote-HTTP stanza, not npx @picx/mcp", () => {
    // @picx/mcp has never existed on npm (404), and the unscoped picx-mcp
    // package is the deprecated TS stdio prototype. Both are wrong for a
    // hosted OAuth server with no local process. This is the core defect
    // being fixed: the stanza must be data describing a URL, not a command.
    mkdirSync(join(workDir, ".cursor"), { recursive: true });
    run(["mcp", "install", "--client", "cursor"], { cwd: workDir });

    const content = JSON.parse(readFileSync(join(workDir, ".cursor", "mcp.json"), "utf-8"));
    expect(content.mcpServers.picx).toEqual({ type: "http", url: REAL_MCP_URL });
    expect(JSON.stringify(content)).not.toContain("@picx/mcp");
    expect(JSON.stringify(content)).not.toContain("npx");
  });

  it("merges into existing mcpServers without disturbing other entries", () => {
    mkdirSync(join(workDir, ".mcp.json") ? workDir : workDir, { recursive: true });
    writeFileSync(
      join(workDir, ".mcp.json"),
      JSON.stringify({ mcpServers: { other: { command: "npx", args: ["-y", "other-server"] } } }),
    );
    run(["mcp", "install", "--client", "claude-code"], { cwd: workDir });

    const content = JSON.parse(readFileSync(join(workDir, ".mcp.json"), "utf-8"));
    expect(content.mcpServers.picx).toEqual({ type: "http", url: REAL_MCP_URL });
    expect(content.mcpServers.other).toEqual({ command: "npx", args: ["-y", "other-server"] });
  });
});

describe("mcp install — Claude Desktop (stdio-only client)", () => {
  it("refuses to write, points at the Connectors UI instead", () => {
    // Claude Desktop's config schema validates stdio servers only; a bare
    // url/type entry is silently stripped or crashes the app on next launch
    // (confirmed against a documented Claude Desktop parsing bug). Writing
    // anything here would be worse than writing nothing.
    const home = join(workDir, "fake-home");
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    const result = run(["mcp", "install", "--client", "claude"], { cwd: workDir, home });

    expect(result.stdout + result.stderr).toMatch(/connectors/i);
    expect(result.stdout + result.stderr).toContain(REAL_MCP_URL);
    expect(existsSync(join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"))).toBe(
      false,
    );
  });

  it("uninstall also refuses gracefully rather than touching the file", () => {
    const home = join(workDir, "fake-home");
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    const configPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: "npx", args: ["x"] } } }));
    const before = readFileSync(configPath, "utf-8");

    run(["mcp", "uninstall", "--client", "claude"], { cwd: workDir, home });

    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });
});

describe("mcp install — Codex (TOML, not JSON)", () => {
  it("writes a [mcp_servers.picx] table with a bare url, preserving existing tables", () => {
    const home = join(workDir, "fake-home");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), '[some_other_section]\nfoo = "bar"\n');

    run(["mcp", "install", "--client", "codex"], { cwd: workDir, home });

    const content = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(content).toContain("[some_other_section]");
    expect(content).toContain('foo = "bar"');
    expect(content).toContain("[mcp_servers.picx]");
    expect(content).toContain(`url = "${REAL_MCP_URL}"`);
    // Must be TOML, never JSON — Codex's own docs (developers.openai.com/codex/mcp)
    // show config.toml with a [mcp_servers.<name>] table, not a JSON file.
    expect(content.trim().startsWith("{")).toBe(false);
  });

  it("re-running install does not duplicate the table", () => {
    const home = join(workDir, "fake-home");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), "");

    run(["mcp", "install", "--client", "codex"], { cwd: workDir, home });
    run(["mcp", "install", "--client", "codex"], { cwd: workDir, home });

    const content = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    const occurrences = content.split("[mcp_servers.picx]").length - 1;
    expect(occurrences).toBe(1);
  });

  it("uninstall removes the table but leaves everything else", () => {
    const home = join(workDir, "fake-home");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), '[keep_me]\nvalue = 1\n');

    run(["mcp", "install", "--client", "codex"], { cwd: workDir, home });
    run(["mcp", "uninstall", "--client", "codex"], { cwd: workDir, home });

    const content = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(content).not.toContain("[mcp_servers.picx]");
    expect(content).toContain("[keep_me]");
    expect(content).toContain("value = 1");
  });
});

describe("mcp serve", () => {
  it("explains there is nothing to run locally, rather than trying npx @picx/mcp", () => {
    const result = run(["mcp", "serve"], { cwd: workDir });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(REAL_MCP_URL);
    expect(result.stdout + result.stderr).not.toContain("@picx/mcp");
  });
});

describe("mcp doctor", () => {
  it("reports the real server's live reachability, not a stale API-key check", () => {
    // No PICX_API_KEY is set anywhere in this test — doctor must not depend
    // on one, since picx-mcp is remote and OAuth-protected, not something
    // this CLI holds a credential for.
    const result = run(["mcp", "doctor"], { cwd: workDir, home: workDir });
    const output = result.stdout + result.stderr;
    expect(output).toContain(REAL_MCP_URL);
    expect(output).not.toMatch(/pxsk_/);
  });
});
