/**
 * Local file → remote URL bridge.
 *
 * POST /v1/images/edit rejects data URIs, so any local file reference must be
 * uploaded to /v1/assets first. This module owns that logic.
 */

import { existsSync } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { PicXClient } from "./client.js";

// Supported image MIME types keyed by extension.
const IMAGE_MIMES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/** Typed error for upload-related failures. */
export class UploadError extends Error {
  override name = "UploadError" as const;
  constructor(
    message: string,
    public readonly code:
      | "FILE_NOT_FOUND"
      | "NOT_READABLE"
      | "NOT_IMAGE"
      | "UPLOAD_FAILED",
    public readonly path?: string,
  ) {
    super(message);
  }
}

/**
 * Ensure the input resolves to a remote https URL.
 *
 * - If `input` is already an http(s) URL, return it unchanged.
 * - If it is a local filesystem path, validate the file exists and is a
 *   readable image, upload it via POST /v1/assets, and return the resulting
 *   permanent https URL.
 */
export async function ensureRemoteUrl(
  input: string,
  client: PicXClient,
): Promise<string> {
  // Already remote — pass through.
  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  // --- Local path handling ---

  // 1. Check existence.
  if (!existsSync(input)) {
    throw new UploadError(
      `File not found: ${input}`,
      "FILE_NOT_FOUND",
      input,
    );
  }

  // 2. Check readable + is a file.
  let stats;
  try {
    stats = await stat(input);
  } catch (err) {
    throw new UploadError(
      `Cannot stat file: ${input} — ${(err as Error).message}`,
      "NOT_READABLE",
      input,
    );
  }
  if (!stats.isFile()) {
    throw new UploadError(
      `Path is not a file: ${input}`,
      "NOT_READABLE",
      input,
    );
  }

  // 3. Validate image extension.
  const ext = extname(input).toLowerCase();
  const mimeType = IMAGE_MIMES[ext];
  if (!mimeType) {
    throw new UploadError(
      `Unsupported image type "${ext}" for: ${input}. Supported: ${Object.keys(IMAGE_MIMES).join(", ")}`,
      "NOT_IMAGE",
      input,
    );
  }

  // 4. Read file and upload.
  let buffer: Buffer;
  try {
    buffer = await readFile(input);
  } catch (err) {
    throw new UploadError(
      `Cannot read file: ${input} — ${(err as Error).message}`,
      "NOT_READABLE",
      input,
    );
  }

  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    const result = await client.assets.create({
      file: blob,
      filename: basename(input),
    });
    return result.url;
  } catch (err) {
    throw new UploadError(
      `Upload failed for ${input}: ${(err as Error).message}`,
      "UPLOAD_FAILED",
      input,
    );
  }
}

/**
 * Batch variant — resolves all inputs to remote URLs, preserving order.
 * Runs uploads concurrently for throughput.
 */
export async function ensureRemoteUrls(
  inputs: string[],
  client: PicXClient,
): Promise<string[]> {
  return Promise.all(inputs.map((input) => ensureRemoteUrl(input, client)));
}
