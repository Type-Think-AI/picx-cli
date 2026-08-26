/**
 * Asset management tools — upload, list, delete.
 *
 * These wrap the PicX /v1/assets endpoints. All media is returned as
 * ToolOutput.links entries (url + mimeType), NEVER as base64 — base64
 * destroys the MCP client's context window.
 *
 * @owner A4
 */

import { z } from "zod";
import { ensureRemoteUrl } from "@picx-devkit/core";
import type { ToolDef, ToolOutput, ToolContext } from "./types.js";

// ---------------------------------------------------------------------------
// picx_upload_asset
// ---------------------------------------------------------------------------

export const picxUploadAsset: ToolDef = {
  name: "picx_upload_asset",
  title: "Upload Asset",
  description:
    "Upload a local file or fetch a URL into PicX's permanent CDN, returning an https URL. " +
    "Use this BEFORE calling picx_edit_image or supplying a video start_frame_url — " +
    "/v1/images/edit rejects data URIs and local paths, so a file must be uploaded first " +
    "to obtain a stable remote URL the API can consume. Cost: free (no credits spent).",
  inputSchema: {
    path_or_url: z.string().min(1),
    name: z.string().optional(),
  },
  effect: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  cost: { kind: "free" },
  scope: "uploads:write",
  cli: ["upload"],
  handler: async (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolOutput> => {
    const pathOrUrl = args.path_or_url as string;
    const name = args.name as string | undefined;

    ctx.progress?.("Ensuring remote URL…", 10);

    // ensureRemoteUrl handles local-path detection, reads the file, POSTs to
    // /v1/assets, and returns the permanent CDN URL.
    const remoteUrl = await ensureRemoteUrl(pathOrUrl, ctx.client);

    ctx.progress?.("Upload complete", 100);

    return {
      summary: `Uploaded asset → ${remoteUrl}`,
      data: { url: remoteUrl, original_input: pathOrUrl },
      links: [{ url: remoteUrl, mimeType: "image/png", name: name ?? undefined }],
    };
  },
};

// ---------------------------------------------------------------------------
// picx_list_assets
// ---------------------------------------------------------------------------

export const picxListAssets: ToolDef = {
  name: "picx_list_assets",
  title: "List Assets",
  description:
    "List uploaded assets in your PicX account. Returns paginated URLs (offset-based). " +
    "Use `offset` and `limit` to page through results. Read-only, free.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  },
  effect: {
    readOnlyHint: true,
  },
  cost: { kind: "free" },
  cli: ["assets", "list"],
  handler: async (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolOutput> => {
    const limit = args.limit as number | undefined;
    const offset = args.offset as number | undefined;

    const result = await ctx.client.assets.list({
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });

    const assets: Array<{ id: string; url: string; name?: string; created_at?: string | null }> =
      result.assets ?? [];
    const total: number = result.total ?? 0;

    const links = assets.map((a) => ({
      url: a.url,
      mimeType: "image/png" as const,
      name: a.name,
    }));

    return {
      summary: `${assets.length} asset(s) (total: ${total}, offset: ${result.offset ?? 0}, limit: ${result.limit ?? assets.length})`,
      data: { assets, total, limit: result.limit, offset: result.offset, count: assets.length },
      links,
    };
  },
};

// ---------------------------------------------------------------------------
// picx_delete_asset
// ---------------------------------------------------------------------------

export const picxDeleteAsset: ToolDef = {
  name: "picx_delete_asset",
  title: "Delete Asset",
  description:
    "Permanently delete an uploaded asset by ID. This is destructive and cannot be undone, " +
    "but it is idempotent — deleting an already-deleted asset returns success. " +
    "Only call this when the user explicitly asks to remove an asset.",
  inputSchema: {
    asset_id: z.string().min(1),
  },
  effect: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  cost: { kind: "free" },
  cli: ["assets", "rm"],
  handler: async (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolOutput> => {
    const assetId = args.asset_id as string;

    await ctx.client.assets.delete(assetId);

    return {
      summary: `Deleted asset ${assetId}`,
      data: { deleted: true, asset_id: assetId },
    };
  },
};

// ---------------------------------------------------------------------------
// Default export — ordered array for registry assembly
// ---------------------------------------------------------------------------

const assetTools: ToolDef[] = [picxUploadAsset, picxListAssets, picxDeleteAsset];
export default assetTools;
