/**
 * config.test.ts — Contract tests for config resolution precedence.
 *
 * Precedence: flag > env > ./.picxrc > ~/.config/picx/config.json
 * Also validates that a baseUrl lacking /v1 suffix is REJECTED.
 *
 * Uses a temp HOME to isolate filesystem-dependent tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// We import the module under test. It uses process.cwd() and process.env
// so we manipulate those in each test.
import { resolveConfig } from "../packages/core/src/config.js";

// ---------------------------------------------------------------------------
// Test fixture setup — isolated temp directories
// ---------------------------------------------------------------------------

let tempHome: string;
let tempCwd: string;
let originalEnv: NodeJS.ProcessEnv;
let originalCwd: string;

beforeEach(() => {
  // Create isolated temp directories
  const base = join(tmpdir(), `picx-config-test-${randomUUID()}`);
  tempHome = join(base, "home");
  tempCwd = join(base, "project");

  mkdirSync(join(tempHome, ".config", "picx"), { recursive: true });
  mkdirSync(tempCwd, { recursive: true });

  // Save and override environment
  originalEnv = { ...process.env };
  originalCwd = process.cwd();

  // Override HOME so config.ts finds our fake global config
  process.env.HOME = tempHome;
  // Clear PicX env vars
  delete process.env.PICX_API_KEY;
  delete process.env.PICX_API_URL;
  delete process.env.PICX_ENV;

  // Change cwd for local .picxrc resolution
  process.chdir(tempCwd);
});

afterEach(() => {
  // Restore
  process.env = originalEnv;
  process.chdir(originalCwd);

  // Cleanup temp
  try {
    rmSync(join(tmpdir(), tempHome.split("/").slice(-2, -1)[0]), { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeGlobalConfig(data: Record<string, unknown>) {
  writeFileSync(
    join(tempHome, ".config", "picx", "config.json"),
    JSON.stringify(data),
  );
}

function writeLocalRc(data: Record<string, unknown>) {
  writeFileSync(join(tempCwd, ".picxrc"), JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Precedence tests
// ---------------------------------------------------------------------------

describe("config resolution precedence", () => {
  it("flag overrides everything", () => {
    // Set all layers
    writeGlobalConfig({ apiKey: "pxsk_global_key123456", baseUrl: "https://global.example.com/v1" });
    writeLocalRc({ apiKey: "pxsk_local_key1234567", baseUrl: "https://local.example.com/v1" });
    process.env.PICX_API_KEY = "pxsk_env_key12345678";
    process.env.PICX_API_URL = "https://env.example.com/v1";

    const cfg = resolveConfig({
      apiKey: "pxsk_flag_key12345678",
      baseUrl: "https://flag.example.com/v1",
    });

    expect(cfg.apiKey).toBe("pxsk_flag_key12345678");
    expect(cfg.baseUrl).toBe("https://flag.example.com/v1");
  });

  it("env overrides local and global", () => {
    writeGlobalConfig({ apiKey: "pxsk_global_key123456", baseUrl: "https://global.example.com/v1" });
    writeLocalRc({ apiKey: "pxsk_local_key1234567", baseUrl: "https://local.example.com/v1" });
    process.env.PICX_API_KEY = "pxsk_env_key12345678";
    process.env.PICX_API_URL = "https://env.example.com/v1";

    const cfg = resolveConfig();

    expect(cfg.apiKey).toBe("pxsk_env_key12345678");
    expect(cfg.baseUrl).toBe("https://env.example.com/v1");
  });

  it("local .picxrc overrides global config", () => {
    writeGlobalConfig({ apiKey: "pxsk_global_key123456", baseUrl: "https://global.example.com/v1" });
    writeLocalRc({ apiKey: "pxsk_local_key1234567", baseUrl: "https://local.example.com/v1" });

    const cfg = resolveConfig();

    expect(cfg.apiKey).toBe("pxsk_local_key1234567");
    expect(cfg.baseUrl).toBe("https://local.example.com/v1");
  });

  it("falls back to global config when nothing else is set", () => {
    writeGlobalConfig({ apiKey: "pxsk_global_key123456", baseUrl: "https://global.example.com/v1" });

    const cfg = resolveConfig();

    expect(cfg.apiKey).toBe("pxsk_global_key123456");
    expect(cfg.baseUrl).toBe("https://global.example.com/v1");
  });

  it("throws when no API key is found at any layer", () => {
    // No global config, no local rc, no env, no flag
    expect(() => resolveConfig()).toThrow("No API key found");
  });

  it("default env is 'prod' and default baseUrl is the production URL", () => {
    process.env.PICX_API_KEY = "pxsk_test_key123456789";

    const cfg = resolveConfig();

    expect(cfg.env).toBe("prod");
    expect(cfg.baseUrl).toBe("https://api.picxstudio.com/v1");
  });
});

// ---------------------------------------------------------------------------
// baseUrl /v1 suffix enforcement
// ---------------------------------------------------------------------------

describe("baseUrl /v1 suffix validation", () => {
  it("REJECTS a baseUrl without /v1 suffix", () => {
    process.env.PICX_API_KEY = "pxsk_test_key123456789";
    process.env.PICX_API_URL = "https://api.picxstudio.com"; // missing /v1

    expect(() => resolveConfig()).toThrow(/must end with \/v1/);
  });

  it("REJECTS a baseUrl with wrong suffix", () => {
    process.env.PICX_API_KEY = "pxsk_test_key123456789";
    process.env.PICX_API_URL = "https://api.picxstudio.com/v2";

    expect(() => resolveConfig()).toThrow(/must end with \/v1/);
  });

  it("accepts a baseUrl ending in /v1 (no trailing slash)", () => {
    process.env.PICX_API_KEY = "pxsk_test_key123456789";
    process.env.PICX_API_URL = "https://api.picxstudio.com/v1";

    const cfg = resolveConfig();
    expect(cfg.baseUrl).toBe("https://api.picxstudio.com/v1");
  });

  it("accepts a baseUrl ending in /v1/ (trailing slash stripped in check)", () => {
    process.env.PICX_API_KEY = "pxsk_test_key123456789";
    process.env.PICX_API_URL = "https://api.picxstudio.com/v1/";

    // The implementation strips trailing slash before check
    const cfg = resolveConfig();
    expect(cfg.baseUrl).toBe("https://api.picxstudio.com/v1/");
  });

  it("flag baseUrl without /v1 is also rejected", () => {
    expect(() =>
      resolveConfig({
        apiKey: "pxsk_flag_key12345678",
        baseUrl: "https://custom.api.com",
      }),
    ).toThrow(/must end with \/v1/);
  });
});
