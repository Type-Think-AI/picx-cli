import { Command } from 'commander';
import { register as registerGenerate } from './commands/generate.js';
import { register as registerAlbums } from './commands/albums.js';
import { register as registerTemplates } from './commands/templates.js';
import { register as registerMoodboards } from './commands/moodboards.js';
import { register as registerReferences } from './commands/references.js';
import { register as registerAccount } from './commands/account.js';

const program = new Command();

program
  .name('picx')
  .description('PicX Studio CLI - Full access to PicX Studio API from the terminal')
  .version('2.0.0');

// Register all command modules
registerGenerate(program);
registerAlbums(program);
registerTemplates(program);
registerMoodboards(program);
registerReferences(program);
registerAccount(program);

program.parse();
