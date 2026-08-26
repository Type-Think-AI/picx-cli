/**
 * PicX API client — the one place that talks to the platform.
 *
 * Thin wrapper over the published `picx-ai` SDK (v0.3.1, zero runtime deps,
 * ships its own GenerationJob poller). We do not re-implement HTTP; we add
 * the DevKit's own concerns: a redacting error path, a resolved base URL, and
 * a narrow surface so tool modules cannot reach arbitrary endpoints.
 *
 * ## Why every call goes through /v1
 *
 * The platform also accepts `pxsk_` keys on its session routes (albums,
 * templates, moodboards) via `get_current_user`, but that path applies NO scope
 * check, NO rate limit, NO daily credit cap and writes NO request log. Routing
 * DevKit traffic there would ship an unmetered generation path to every user we
 * onboard. So this client is deliberately incapable of reaching it: the base URL
 * is pinned to `/v1` and there is no escape hatch.
 */

import { PicX } from "picx-ai";

/** Default production base. The `/v1` suffix is mandatory — the bare host 404s. */
export const DEFAULT_BASE_URL = "https://api.picxstudio.com/v1";
export const DEV_BASE_URL = "https://dev-api.picxstudio.com/v1";

export type PicXClientOptions = {
  apiKey: string;
  /** Must end in `/v1`. Defaults to production. */
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

/** Redact a key for logs: `pxsk_…a1b2`. Never emit the full value. */
export function redactKey(key: string): string {
  if (!key) return "<none>";
  const tail = key.slice(-4);
  return `pxsk_…${tail}`;
}

export class PicXClient {
  readonly sdk: PicX;
  readonly baseUrl: string;

  constructor(opts: PicXClientOptions) {
    if (!opts.apiKey) {
      throw new Error("apiKey is required");
    }
    if (!opts.apiKey.startsWith("pxsk_")) {
      throw new Error("api key must start with pxsk_");
    }

    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    // Guard the single most common integration bug with this API.
    if (!baseUrl.replace(/\/$/, "").endsWith("/v1")) {
      throw new Error(`baseUrl must end with /v1 (got ${baseUrl}) — the bare host returns 404`);
    }
    this.baseUrl = baseUrl;

    this.sdk = new PicX({
      apiKey: opts.apiKey,
      baseUrl,
      ...(opts.timeoutMs !== undefined ? { timeout: opts.timeoutMs } : {}),
      ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
    });
  }

  get images() {
    return this.sdk.images;
  }
  get videos() {
    return this.sdk.videos;
  }
  get assets() {
    return this.sdk.assets;
  }
  get generations() {
    return this.sdk.generations;
  }
  get models() {
    return this.sdk.models;
  }
  get account() {
    return this.sdk.account;
  }
  get webhooks() {
    return this.sdk.webhooks;
  }
}
