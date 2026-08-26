/**
 * exit-codes.test.ts — Contract tests for HTTP→exit-code mapping and
 * user-message redaction.
 *
 * Tests mapHttpStatusToExit table and toUserMessage never leaking pxsk_ keys.
 */

import { describe, it, expect } from "vitest";
import { mapHttpStatusToExit, toUserMessage, EXIT } from "../packages/core/src/errors.js";

// ---------------------------------------------------------------------------
// mapHttpStatusToExit — table-driven
// ---------------------------------------------------------------------------

describe("mapHttpStatusToExit", () => {
  const table: Array<{ status: number; body?: unknown; expected: number; label: string }> = [
    { status: 401, expected: EXIT.AUTH, label: "401 → AUTH (2)" },
    { status: 403, expected: EXIT.AUTH, label: "403 → AUTH (2)" },
    { status: 402, expected: EXIT.INSUFFICIENT_CREDITS, label: "402 → INSUFFICIENT_CREDITS (3)" },
    { status: 429, expected: EXIT.RATE_LIMITED, label: "429 → RATE_LIMITED (4)" },
    { status: 500, expected: EXIT.UPSTREAM, label: "500 → UPSTREAM (5)" },
    { status: 504, expected: EXIT.TIMEOUT, label: "504 → TIMEOUT (6)" },
    { status: 400, expected: EXIT.USAGE, label: "400 → USAGE (1)" },
    { status: 422, expected: EXIT.USAGE, label: "422 → USAGE (1)" },
  ];

  for (const { status, body, expected, label } of table) {
    it(label, () => {
      expect(mapHttpStatusToExit(status, body)).toBe(expected);
    });
  }

  // Verify the actual numeric values match the spec
  it("EXIT constants have correct numeric values", () => {
    expect(EXIT.OK).toBe(0);
    expect(EXIT.USAGE).toBe(1);
    expect(EXIT.AUTH).toBe(2);
    expect(EXIT.INSUFFICIENT_CREDITS).toBe(3);
    expect(EXIT.RATE_LIMITED).toBe(4);
    expect(EXIT.UPSTREAM).toBe(5);
    expect(EXIT.TIMEOUT).toBe(6);
  });

  // Edge cases
  it("408 (Request Timeout) → TIMEOUT (6)", () => {
    expect(mapHttpStatusToExit(408)).toBe(EXIT.TIMEOUT);
  });

  it("502 → UPSTREAM (5)", () => {
    expect(mapHttpStatusToExit(502)).toBe(EXIT.UPSTREAM);
  });

  it("503 → UPSTREAM (5)", () => {
    expect(mapHttpStatusToExit(503)).toBe(EXIT.UPSTREAM);
  });

  it("200 → OK (0)", () => {
    expect(mapHttpStatusToExit(200)).toBe(EXIT.OK);
  });

  it("400 with 'credits' in body → INSUFFICIENT_CREDITS (3)", () => {
    expect(mapHttpStatusToExit(400, "You have no credits remaining")).toBe(EXIT.INSUFFICIENT_CREDITS);
  });

  it("422 with credit-related body → INSUFFICIENT_CREDITS (3)", () => {
    expect(mapHttpStatusToExit(422, { error: "Insufficient credits" })).toBe(EXIT.INSUFFICIENT_CREDITS);
  });

  it("400 without credit mention → USAGE (1)", () => {
    expect(mapHttpStatusToExit(400, "Invalid prompt parameter")).toBe(EXIT.USAGE);
  });
});

// ---------------------------------------------------------------------------
// toUserMessage — API key redaction
// ---------------------------------------------------------------------------

describe("toUserMessage redaction", () => {
  it("never leaks a pxsk_ key (Error with key in message)", () => {
    const err = new Error(
      "Authentication failed: Bearer pxsk_live_abcd1234 is invalid for scope images:generate",
    );
    const msg = toUserMessage(err);
    expect(msg).not.toContain("pxsk_live_abcd1234");
    expect(msg).toContain("pxsk_***");
  });

  it("never leaks a pxsk_ key (plain string)", () => {
    const raw = "401 Unauthorized: key pxsk_test_secretkey9876 was revoked";
    const msg = toUserMessage(raw);
    expect(msg).not.toContain("pxsk_test_secretkey9876");
    expect(msg).toContain("pxsk_***");
  });

  it("never leaks a pxsk_ key (object with embedded key)", () => {
    const err = {
      status: 401,
      detail: "Key pxsk_live_thisisaverylongsecretkey0123456789abcdef not found",
    };
    const msg = toUserMessage(err);
    expect(msg).not.toContain("pxsk_live_thisisaverylongsecretkey0123456789abcdef");
    expect(msg).toContain("pxsk_***");
  });

  it("handles non-Error non-string inputs", () => {
    expect(toUserMessage(null)).toBeDefined();
    expect(toUserMessage(undefined)).toBeDefined();
    expect(toUserMessage(42)).toBeDefined();
  });

  it("preserves message content unrelated to keys", () => {
    const err = new Error("Rate limit exceeded, try again in 30 seconds");
    const msg = toUserMessage(err);
    expect(msg).toBe("Rate limit exceeded, try again in 30 seconds");
  });
});
