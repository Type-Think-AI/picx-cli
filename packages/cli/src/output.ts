/**
 * Output layer for the PicX DevKit CLI.
 *
 * ## Design rules
 *
 * 1. Machine-readable payloads (JSON, URLs) → stdout.
 * 2. Human/diagnostic text → stderr.
 * 3. `picx ... --json | jq` must ALWAYS work — nothing human touches stdout.
 * 4. No heavy deps (chalk, ora, ink). Colour via raw ANSI gated on isTTY + NO_COLOR.
 * 5. Never print an API key — redact to pxsk_…last4.
 */

import { EXIT, PicXDevkitError, toUserMessage } from "@picx-devkit/core";
import type { ExitCode } from "@picx-devkit/core";
import type { ToolOutput } from "@picx-devkit/tools";

export { EXIT };
export type { ToolOutput };

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * `ToolOutput` is imported from `@picx-devkit/tools`, not redeclared here.
 *
 * An earlier draft of this file declared its own local `ToolOutput` with a
 * `urls?: string[]` field. That silently diverged from the canonical type, whose
 * media field is `links: {url, mimeType?, name?}[]` — so every command that
 * populated `links` failed to typecheck against this module. One definition,
 * imported everywhere, is the invariant that keeps the CLI and the MCP server
 * rendering the same data.
 */

export interface PrintOpts {
  json?: boolean;
  quiet?: boolean;
}

// ─── Colour helpers (zero-dep) ───────────────────────────────────────────────

const useColor =
  process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

const ansi = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  green: useColor ? "\x1b[32m" : "",
  red: useColor ? "\x1b[31m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  cyan: useColor ? "\x1b[36m" : "",
};

// ─── Primary API ─────────────────────────────────────────────────────────────

/**
 * Print a ToolOutput according to the user's format preference.
 *
 * - `--json`: JSON.stringify(data) → stdout. Nothing else.
 * - `--quiet`: Just URLs, one per line → stdout. No summary.
 * - default: Human summary to stderr, URLs to stdout.
 */
export function printResult(out: ToolOutput, opts: PrintOpts): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(out.data, null, 2) + "\n");
    return;
  }

  // The canonical ToolOutput carries `links: {url, mimeType?, name?}[]`, so the
  // URL list is projected out of it rather than being a separate field.
  const urls = out.links?.map((l) => l.url) ?? [];

  if (opts.quiet) {
    if (urls.length) {
      process.stdout.write(urls.join("\n") + "\n");
    }
    return;
  }

  // Default: human summary to STDERR, URLs to STDOUT — so `picx … | jq` and
  // `picx … --quiet > files.txt` both stay clean of decoration.
  process.stderr.write(`${ansi.green}✓${ansi.reset} ${out.summary}\n`);
  for (const url of urls) {
    process.stdout.write(url + "\n");
  }
}

/**
 * Fatal error handler. Prints message to stderr and exits with the appropriate code.
 *
 * If the error is a PicXDevkitError, its exitCode is used directly.
 * Otherwise defaults to EXIT.UPSTREAM (generic failure).
 */
export function fail(err: unknown): never {
  const message = toUserMessage(err);
  const code: ExitCode =
    err instanceof PicXDevkitError ? err.exitCode : EXIT.UPSTREAM;

  process.stderr.write(`${ansi.red}error${ansi.reset}: ${message}\n`);
  process.exit(code);
}

// ─── Table printer ───────────────────────────────────────────────────────────

/**
 * Print a simple table to stderr for human listings.
 *
 * @param rows - Array of objects with uniform keys.
 *
 * Example:
 *   table([{ model: "flux-1", type: "image" }, { model: "kling-2", type: "video" }])
 *   →  MODEL     TYPE
 *      flux-1    image
 *      kling-2   video
 */
export function table(rows: Record<string, string | number | boolean>[]): void {
  if (!rows.length) return;

  const keys = Object.keys(rows[0]!);

  // Compute column widths
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = key.length;
    for (const row of rows) {
      const val = String(row[key] ?? "");
      if (val.length > widths[key]!) widths[key] = val.length;
    }
  }

  // Header
  const header = keys.map((k) => k.toUpperCase().padEnd(widths[k]! + 2)).join("");
  process.stderr.write(`${ansi.bold}${header}${ansi.reset}\n`);

  // Rows
  for (const row of rows) {
    const line = keys.map((k) => String(row[k] ?? "").padEnd(widths[k]! + 2)).join("");
    process.stderr.write(line + "\n");
  }
}

// ─── Diagnostic helpers (used by mcp doctor, etc.) ───────────────────────────

/** Print a pass/fail check line to stderr. */
export function check(pass: boolean, label: string, detail?: string): void {
  const icon = pass
    ? `${ansi.green}✓${ansi.reset}`
    : `${ansi.red}✗${ansi.reset}`;
  const suffix = detail ? ` ${ansi.dim}${detail}${ansi.reset}` : "";
  process.stderr.write(`  ${icon} ${label}${suffix}\n`);
}

/** Print a warning line to stderr. */
export function warn(message: string): void {
  process.stderr.write(`${ansi.yellow}warn${ansi.reset}: ${message}\n`);
}

/** Print an info line to stderr. */
export function info(message: string): void {
  process.stderr.write(`${ansi.dim}${message}${ansi.reset}\n`);
}
