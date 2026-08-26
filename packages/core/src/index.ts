/**
 * @picx/core — shared internals for the CLI and the MCP server.
 *
 * Deliberately narrow: config resolution, the pinned-to-/v1 API client, the
 * error/exit-code taxonomy, and the local-file upload bridge. Nothing here
 * knows about MCP or about commander.
 */

export { PicXClient, DEFAULT_BASE_URL, DEV_BASE_URL, redactKey } from "./client.js";
export type { PicXClientOptions } from "./client.js";

export {
  resolveConfig,
  saveCredentials,
  loadCredentials,
  clearCredentials,
} from "./config.js";
export type { ResolvedConfig, PicXEnv } from "./config.js";

export {
  PicXDevkitError,
  EXIT,
  mapHttpStatusToExit,
  toUserMessage,
} from "./errors.js";
export type { ExitCode } from "./errors.js";

export { ensureRemoteUrl, ensureRemoteUrls, UploadError } from "./upload.js";
