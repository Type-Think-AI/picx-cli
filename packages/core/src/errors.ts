/**
 * Error taxonomy and exit-code mapping for the PicX DevKit.
 *
 * ## Why typed errors, not bare Error
 *
 * CLI and MCP server both need to translate failures into structured signals:
 * the CLI maps to process exit codes; the MCP server maps to `isError: true`
 * tool results with user-facing messages. A bare `Error` forces fragile string
 * matching. `PicXDevkitError` carries a machine-readable `code` and a
 * pre-assigned `exitCode` so the output layer never guesses.
 *
 * ## Why redact in toUserMessage
 *
 * Upstream error bodies occasionally echo request headers (especially on 401).
 * Since we auth with a bearer key, any stringified error could contain the key.
 * `toUserMessage` strips any `pxsk_` substring it encounters — defense-in-depth
 * against accidental exposure in logs, CLI stderr, or MCP error content.
 */

// ─── Exit codes ──────────────────────────────────────────────────────────────

/**
 * Process exit codes. Aligned with common CLI conventions:
 * - 0 = success
 * - 1 = bad usage / validation
 * - 2+ = domain-specific failures
 */
export const EXIT = {
  OK: 0,
  USAGE: 1,
  AUTH: 2,
  INSUFFICIENT_CREDITS: 3,
  RATE_LIMITED: 4,
  UPSTREAM: 5,
  TIMEOUT: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

// ─── Error class ─────────────────────────────────────────────────────────────

/**
 * Structured error carrying a machine-readable code and a CLI exit code.
 *
 * @example
 * throw new PicXDevkitError("Rate limit exceeded", "rate_limited", EXIT.RATE_LIMITED);
 */
export class PicXDevkitError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;

  constructor(message: string, code: string, exitCode: ExitCode) {
    super(message);
    this.name = "PicXDevkitError";
    this.code = code;
    this.exitCode = exitCode;
    // Maintain proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── HTTP → exit code mapping ────────────────────────────────────────────────

/**
 * Map an HTTP response status (and optionally the response body) to a CLI exit code.
 *
 * The body inspection is intentionally shallow — we check for the word "credits"
 * to catch 402 responses and 400s that mention credit exhaustion, because the
 * platform returns 402 for both expired billing AND exhausted free-tier credits,
 * but some older routes return 400 with a credit message instead.
 */
export function mapHttpStatusToExit(status: number, body?: unknown): ExitCode {
  // Timeout family — returned by proxies or the platform's own gateway.
  if (status === 408 || status === 504) return EXIT.TIMEOUT;

  // Auth failures.
  if (status === 401 || status === 403) return EXIT.AUTH;

  // Explicit payment required.
  if (status === 402) return EXIT.INSUFFICIENT_CREDITS;

  // Rate limiting.
  if (status === 429) return EXIT.RATE_LIMITED;

  // Server errors (5xx range, excluding 504 handled above).
  if (status >= 500 && status < 600) return EXIT.UPSTREAM;

  // Client errors with a credit-related body get INSUFFICIENT_CREDITS.
  if ((status === 400 || status === 422) && bodyMentionsCredits(body)) {
    return EXIT.INSUFFICIENT_CREDITS;
  }

  // Remaining 4xx — user did something wrong.
  if (status >= 400 && status < 500) return EXIT.USAGE;

  // 2xx/3xx should never reach here, but default to OK to avoid masking.
  return EXIT.OK;
}

// ─── User-facing message ─────────────────────────────────────────────────────

/**
 * Produce a safe, user-facing error message from any thrown value.
 *
 * NEVER includes an API key — any `pxsk_` substring is redacted to `pxsk_***`.
 */
export function toUserMessage(err: unknown): string {
  let raw: string;

  if (err instanceof PicXDevkitError) {
    raw = err.message;
  } else if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "string") {
    raw = err;
  } else {
    // JSON.stringify(undefined) returns undefined — NOT a string — and
    // stringify also yields undefined for functions and symbols. Passing that
    // straight into redactKeys() threw a TypeError, which is the worst possible
    // place to throw: it replaces a real error with a crash inside the error
    // handler. Coerce, and fall back to String() when stringify declines.
    try {
      raw = JSON.stringify(err) ?? String(err);
    } catch {
      raw = String(err);
    }
  }

  return redactKeys(raw ?? "");
}

// ─── Helpers (private) ───────────────────────────────────────────────────────

/**
 * Redact any PicX API key substring. Keys are `pxsk_` followed by 40+ hex/alphanum
 * chars. We match generously to catch partial keys in truncated error bodies.
 */
function redactKeys(text: string): string {
  // Match pxsk_ followed by at least 4 non-whitespace chars (could be full key
  // or a prefix leaked in a truncated message).
  return text.replace(/pxsk_\S{4,}/g, "pxsk_***");
}

/**
 * Shallow check: does the body (string or object) mention credits?
 */
function bodyMentionsCredits(body: unknown): boolean {
  if (!body) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return /credits?/i.test(text);
}
