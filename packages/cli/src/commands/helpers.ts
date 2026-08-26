/**
 * Shared CLI helpers — client resolution, global option extraction, file output.
 */

import { Command } from "commander";
import { PicXClient, DEFAULT_BASE_URL, DEV_BASE_URL } from "@picx/core";
import { resolveConfig } from "@picx/core";
import { fail, EXIT } from "../output.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

export type GlobalOpts = {
  json?: boolean;
  quiet?: boolean;
  apiKey?: string;
  env?: string;
  dryRun?: boolean;
};

/** Extract global options from the root program. */
export function globalOpts(program: Command): GlobalOpts {
  const opts = program.opts();
  return {
    json: opts.json,
    quiet: opts.quiet,
    apiKey: opts.apiKey,
    env: opts.env,
    dryRun: opts.dryRun,
  };
}

/**
 * Resolve a PicXClient from global options + config precedence.
 * Precedence: --api-key flag → PICX_API_KEY env → config file.
 */
export function resolveClient(globals: GlobalOpts): PicXClient {
  const config = resolveConfig();
  const apiKey = globals.apiKey ?? process.env.PICX_API_KEY ?? config.apiKey;

  if (!apiKey) {
    process.stderr.write(
      "Error: no API key found. Set --api-key, PICX_API_KEY env var, or run `picx auth login`.\n",
    );
    process.exit(EXIT.AUTH);
  }

  const baseUrl = globals.env === "dev" ? DEV_BASE_URL : DEFAULT_BASE_URL;

  return new PicXClient({ apiKey, baseUrl });
}

/** Download links and write them to a local directory. */
export async function writeOutputFiles(
  links: { url: string; mimeType?: string; name?: string }[],
  outDir: string,
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  for (const link of links) {
    const filename = link.name ?? filenameFromUrl(link.url);
    const dest = join(outDir, filename);

    const res = await fetch(link.url);
    if (!res.ok) {
      process.stderr.write(`Warning: failed to download ${link.url} (${res.status})\n`);
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    process.stderr.write(`Wrote: ${dest}\n`);
  }
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return basename(pathname) || "output";
  } catch {
    return "output";
  }
}
