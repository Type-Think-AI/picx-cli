import { Command } from 'commander';
import { generate } from './commands/generate.js';
import { edit } from './commands/edit.js';
import { models } from './commands/models.js';
import { auth } from './commands/auth.js';
import { usage } from './commands/usage.js';

const program = new Command();

program
  .name('picx')
  .description('PicX Studio CLI - AI image generation from the terminal')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate an image from a text prompt')
  .argument('<prompt>', 'Image description')
  .option('-m, --model <model>', 'Model ID')
  .option('-s, --size <size>', 'Image size: 1K, 2K, 4K')
  .option('-a, --aspect-ratio <ratio>', 'Aspect ratio: 1:1, 16:9, 9:16, etc.')
  .action(generate);

program
  .command('edit')
  .description('Edit an image with an instruction')
  .argument('<instruction>', 'Edit instruction')
  .option('-i, --image-url <url>', 'URL of image to edit')
  .option('-m, --model <model>', 'Model ID')
  .option('-s, --size <size>', 'Image size: 1K, 2K, 4K')
  .action(edit);

program
  .command('models')
  .description('List available image models')
  .action(models);

program
  .command('auth')
  .description('Check API key authentication status')
  .action(auth);

program
  .command('usage')
  .description('Show API usage statistics')
  .option('-p, --period <period>', 'Time period (e.g. 7d, 30d, 90d)', '30d')
  .action(usage);

program.parse();
