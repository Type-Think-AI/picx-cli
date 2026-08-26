/**
 * Configuration resolution and credential persistence.
 *
 * Precedence (highest wins):
 *   1. Explicit overrides passed to `resolveConfig()` (flags from CLI / tool caller)
 *   2. Environment variables: PICX_API_KEY, PICX_API_URL
 *   3. Project-local `.picxrc` (JSON, cwd)
 *   4. User-global `~/.config/picx/config.json`
 *
 * ## Why we never log a key
 *
 * API keys are bearer credentials with no per-request binding. A leaked key in a
 * log file is indistinguishable from a valid auth — there is no IP restriction,
 * no HMAC over the request body, and revocation requires user action. So we redact
 * unconditionally, even in debug builds.
 *
 * ## Why the credential file is 0600
 *
 * The global config stores a cleartext key (like ~/.npmrc, ~/.docker/config.json).
 * Mode 0600 ensures only the owning user can read it — defense-in-depth on shared
 * machines. We set it on every write, not just creation, because editors and file
 * managers often reset permissions on save.
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { redactKey } from "./client.js";
import { PicXDevkitError, EXIT } from "./errors.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PicXEnv = "prod" | "dev";

export interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  env: PicXEnv;
}

/** Shape of the JSON stored in .picxrc / global config. */
interface ConfigFile {
  apiKey?: string;
  baseUrl?: string;
  env?: PicXEnv;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Canonical base URLs — always end in /v1. */
const ENV_URLS: Record<PicXEnv, string> = {
  prod: "https://api.picxstudio.com/v1",
  dev: "https://dev-api.picxstudio.com/v1",
};

/**
 * Global config location, resolved LAZILY on every call.
 *
 * These were originally module-level constants computed once from `homedir()`.
 * That is wrong twice over: `homedir()` is evaluated at import time, so any
 * later change to `HOME` is ignored, and it does not consult `process.env.HOME`
 * at all on some platforms. The practical effects were a process running under a
 * sandboxed or overridden HOME writing to the wrong path, and tests that could
 * not isolate the filesystem. Resolving per call costs nothing and fixes both.
 */
function globalConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(home, ".config", "picx");
}

function globalConfigPath(): string {
  return join(globalConfigDir(), "config.json");
}
const LOCAL_RC_NAME = ".picxrc";

// ─── Config resolution ───────────────────────────────────────────────────────

/**
 * Resolve the final configuration by merging sources in precedence order.
 *
 * @param overrides - Explicit values from flags or programmatic callers.
 * @throws PicXDevkitError with code `auth_missing` when no API key can be found
 *         at any layer.
 */
export function resolveConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  const globalCfg = readJsonFile<ConfigFile>(globalConfigPath());
  const localCfg = readJsonFile<ConfigFile>(resolve(process.cwd(), LOCAL_RC_NAME));

  // Merge bottom-up (lowest precedence first, overwritten by higher).
  const env: PicXEnv =
    overrides?.env ??
    (envString("PICX_ENV") as PicXEnv | undefined) ??
    localCfg?.env ??
    globalCfg?.env ??
    "prod";

  const apiKey: string | undefined =
    overrides?.apiKey ??
    envString("PICX_API_KEY") ??
    localCfg?.apiKey ??
    globalCfg?.apiKey;

  if (!apiKey) {
    throw new PicXDevkitError(
      "No API key found. Set PICX_API_KEY, add it to .picxrc, or run `picx auth login`.",
      "auth_missing",
      EXIT.AUTH,
    );
  }

  const baseUrl: string =
    overrides?.baseUrl ??
    envString("PICX_API_URL") ??
    localCfg?.baseUrl ??
    globalCfg?.baseUrl ??
    ENV_URLS[env];

  // Invariant: base URL must end in /v1.
  if (!baseUrl.replace(/\/$/, "").endsWith("/v1")) {
    throw new PicXDevkitError(
      `baseUrl must end with /v1 (got ${baseUrl})`,
      "config_invalid",
      EXIT.USAGE,
    );
  }

  return { apiKey, baseUrl, env };
}

// ─── Credential store ────────────────────────────────────────────────────────

/**
 * Persist credentials to the user-global config.
 * File permissions are set to 0600 on every write.
 */
export function saveCredentials(apiKey: string, baseUrl?: string): void {
  mkdirSync(globalConfigDir(), { recursive: true, mode: 0o700 });

  const existing = readJsonFile<ConfigFile>(globalConfigPath()) ?? {};
  const updated: ConfigFile = {
    ...existing,
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  };

  writeFileSync(globalConfigPath(), JSON.stringify(updated, null, 2) + "\n", {
    mode: 0o600,
    encoding: "utf-8",
  });
}

/**
 * Load credentials from the user-global config.
 * Returns undefined fields if the file doesn't exist or lacks the key.
 */
export function loadCredentials(): { apiKey?: string; baseUrl?: string } {
  const cfg = readJsonFile<ConfigFile>(globalConfigPath());
  return { apiKey: cfg?.apiKey, baseUrl: cfg?.baseUrl };
}

/**
 * Remove the global credentials file entirely.
 * Silent no-op if the file doesn't exist.
 */
export function clearCredentials(): void {
  try {
    unlinkSync(globalConfigPath());
  } catch (err: unknown) {
    // ENOENT is fine — nothing to clear.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── Helpers (private) ───────────────────────────────────────────────────────

function envString(name: string): string | undefined {
  const val = process.env[name];
  return val && val.trim() !== "" ? val.trim() : undefined;
}

/**
 * Read and parse a JSON file. Returns undefined (not throws) when the file is
 * missing or contains invalid JSON — config files are optional layers.
 */
function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!existsSync(filePath)) return undefined;
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    // Malformed JSON or permission denied — treat as absent.
    return undefined;
  }
}

// Re-export redactKey so downstream modules that import config don't need a
// separate import from client just for redaction.
export { redactKey };
