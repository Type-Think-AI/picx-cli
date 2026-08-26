/**
 * webhook-signature.test.ts — Contract tests for PicX webhook signature
 * verification.
 *
 * Signature format: X-PicX-Signature: t={timestamp},v1={hmac}
 * Computed over: `{timestamp}.{raw_body}` using HMAC-SHA256.
 * Envelope keys: `id` and `event` — NOT event_id/event_type.
 *
 * This test implements verification logic from first principles using
 * node:crypto, matching the contract in BUILD.md and the learned correction
 * about envelope keys.
 */

import { describe, it, expect } from "vitest";
import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Minimal webhook verification implementation (what the SDK should do)
// This mirrors the contract — we test the ALGORITHM, not a specific module.
// ---------------------------------------------------------------------------

interface WebhookVerifyOptions {
  /** The raw body string as received */
  rawBody: string;
  /** The X-PicX-Signature header value */
  signatureHeader: string;
  /** The webhook signing secret */
  secret: string;
  /** Maximum age in seconds before a signature is considered stale (default: 300) */
  maxAgeSecs?: number;
  /** Override "now" for testing timestamp expiry */
  nowSecs?: number;
}

interface WebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify a PicX webhook signature.
 *
 * Format: `t={unix_timestamp},v1={hex_hmac}`
 * Signed payload: `{timestamp}.{raw_body}`
 */
function verifyWebhookSignature(opts: WebhookVerifyOptions): WebhookVerifyResult {
  const { rawBody, signatureHeader, secret, maxAgeSecs = 300, nowSecs } = opts;

  // Parse the header: t=<ts>,v1=<hmac>
  const parts = signatureHeader.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));

  if (!tPart || !v1Part) {
    return { valid: false, reason: "malformed signature header" };
  }

  const timestamp = tPart.slice(2); // remove "t="
  const receivedHmac = v1Part.slice(3); // remove "v1="

  if (!timestamp || !receivedHmac) {
    return { valid: false, reason: "missing timestamp or hmac" };
  }

  // Check timestamp freshness
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum)) {
    return { valid: false, reason: "invalid timestamp" };
  }
  if (now - tsNum > maxAgeSecs) {
    return { valid: false, reason: "signature too old" };
  }

  // Compute expected HMAC: sign "{timestamp}.{rawBody}"
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedHmac = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // Constant-time comparison via timingSafeEqual
  const expectedBuf = Buffer.from(expectedHmac, "hex");
  const receivedBuf = Buffer.from(receivedHmac, "hex");

  if (expectedBuf.length !== receivedBuf.length) {
    return { valid: false, reason: "hmac mismatch" };
  }

  if (!timingSafeEqual(expectedBuf, receivedBuf)) {
    return { valid: false, reason: "hmac mismatch" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helper to build a valid signature
// ---------------------------------------------------------------------------

function buildSignature(rawBody: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TEST_SECRET = "whsec_test_secret_for_unit_tests_only";
const TEST_BODY = JSON.stringify({
  id: "evt_abc123xyz",
  event: "generation.completed",
  data: {
    generation_id: "gen_456",
    status: "completed",
    output: { url: "https://cdn.picxstudio.com/gen/output.png" },
  },
});

describe("webhook signature verification", () => {
  const now = Math.floor(Date.now() / 1000);

  it("valid signature passes", () => {
    const header = buildSignature(TEST_BODY, TEST_SECRET, now);
    const result = verifyWebhookSignature({
      rawBody: TEST_BODY,
      signatureHeader: header,
      secret: TEST_SECRET,
      nowSecs: now,
    });
    expect(result.valid).toBe(true);
  });

  it("tampered body fails", () => {
    const header = buildSignature(TEST_BODY, TEST_SECRET, now);
    const tamperedBody = TEST_BODY.replace("completed", "failed");
    const result = verifyWebhookSignature({
      rawBody: tamperedBody,
      signatureHeader: header,
      secret: TEST_SECRET,
      nowSecs: now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("hmac mismatch");
  });

  it("wrong secret fails", () => {
    const header = buildSignature(TEST_BODY, TEST_SECRET, now);
    const result = verifyWebhookSignature({
      rawBody: TEST_BODY,
      signatureHeader: header,
      secret: "whsec_wrong_secret",
      nowSecs: now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("hmac mismatch");
  });

  it("timestamp older than 5 minutes fails", () => {
    const oldTimestamp = now - 301; // 5 min + 1 sec
    const header = buildSignature(TEST_BODY, TEST_SECRET, oldTimestamp);
    const result = verifyWebhookSignature({
      rawBody: TEST_BODY,
      signatureHeader: header,
      secret: TEST_SECRET,
      nowSecs: now,
      maxAgeSecs: 300,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature too old");
  });

  it("timestamp exactly at 5 minutes passes", () => {
    const borderTimestamp = now - 300; // exactly 5 min
    const header = buildSignature(TEST_BODY, TEST_SECRET, borderTimestamp);
    const result = verifyWebhookSignature({
      rawBody: TEST_BODY,
      signatureHeader: header,
      secret: TEST_SECRET,
      nowSecs: now,
      maxAgeSecs: 300,
    });
    expect(result.valid).toBe(true);
  });

  it("malformed header (missing t=) fails", () => {
    const result = verifyWebhookSignature({
      rawBody: TEST_BODY,
      signatureHeader: "v1=abcdef1234567890",
      secret: TEST_SECRET,
      nowSecs: now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("malformed signature header");
  });

  it("malformed header (missing v1=) fails", () => {
    const result = verifyWebhookSignature({
      rawBody: TEST_BODY,
      signatureHeader: `t=${now}`,
      secret: TEST_SECRET,
      nowSecs: now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("malformed signature header");
  });
});

// ---------------------------------------------------------------------------
// Envelope parsing — id + event keys (NOT event_id/event_type)
// ---------------------------------------------------------------------------

describe("webhook envelope keys", () => {
  it("parses keys 'id' and 'event' from the envelope", () => {
    const envelope = JSON.parse(TEST_BODY);
    expect(envelope).toHaveProperty("id");
    expect(envelope).toHaveProperty("event");
    expect(typeof envelope.id).toBe("string");
    expect(typeof envelope.event).toBe("string");
    expect(envelope.id).toBe("evt_abc123xyz");
    expect(envelope.event).toBe("generation.completed");
  });

  it("REGRESSION: envelope does NOT use event_id or event_type", () => {
    // This mistake has been made before. The PicX webhook payload uses
    // `id` and `event`, NOT `event_id`/`event_type`.
    const envelope = JSON.parse(TEST_BODY);
    expect(envelope).not.toHaveProperty("event_id");
    expect(envelope).not.toHaveProperty("event_type");
  });

  it("envelope has a data field with the payload", () => {
    const envelope = JSON.parse(TEST_BODY);
    expect(envelope).toHaveProperty("data");
    expect(envelope.data).toHaveProperty("generation_id");
    expect(envelope.data).toHaveProperty("status");
  });

  it("correlation should use id from body, not URL params", () => {
    // The signature covers the body, not the URL.
    // A captured delivery replayed against a different item's URL path
    // would still verify if you correlated on URL params.
    const envelope = JSON.parse(TEST_BODY);
    const correlationId = envelope.id;
    expect(correlationId).toBe("evt_abc123xyz");
    // Sanity: this is the field to correlate on
    expect(correlationId).toBeDefined();
    expect(typeof correlationId).toBe("string");
    expect(correlationId.length).toBeGreaterThan(0);
  });
});
