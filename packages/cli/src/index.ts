/**
 * CLI entry point — assembles the root `picx` program via commander.
 *
 * Global options: --json, --quiet, --api-key, --env, --dry-run.
 * Commands delegate to ToolDef handlers from @picx/tools.
 */

import { Command } from "commander";
import { registerImageCommand } from "./commands/image.js";
import { registerVideoCommand } from "./commands/video.js";
import { registerAssetsCommand } from "./commands/assets.js";
import { registerAccountCommands } from "./commands/account.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerTemplatesCommand } from "./commands/templates.js";
import { registerHistoryCommand } from "./commands/history.js";
import { registerModelsCommand } from "./commands/models.js";

export const program = new Command();

program
  .name("picx")
  .description("PicX DevKit CLI — generate images, videos, and manage assets")
  .version("3.0.0")
  .option("--json", "Output machine-readable JSON to stdout")
  .option("--quiet", "Suppress all non-error output")
  .option("--api-key <key>", "PicX API key (overrides env/config)")
  .option("--env <environment>", "API environment", "prod")
  .option("--dry-run", "Show estimated credit cost without executing");

// Mount subcommands
registerImageCommand(program);
registerVideoCommand(program);
registerAssetsCommand(program);
registerAccountCommands(program);
registerModelsCommand(program);
// `mcp` is what turns this from a CLI into an agent integration: it writes the
// MCP client config, serves stdio, and diagnoses a broken connection.
registerMcpCommand(program);
registerTemplatesCommand(program);
registerHistoryCommand(program);

program.parseAsync(process.argv);
