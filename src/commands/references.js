import { api, out, fail } from '../lib/api.js';

async function list() {
  const result = await api('GET', '/references/');
  out(result);
  if (!result.success) process.exit(1);
}

async function get(referenceId) {
  const result = await api('GET', `/references/${referenceId}`);
  out(result);
  if (!result.success) process.exit(1);
}

async function create(name, opts) {
  const body = { name };
  if (opts.instructions) body.instructions = opts.instructions;
  if (opts.usageMode) body.usage_mode = opts.usageMode;
  if (opts.imageUrls) body.image_urls = opts.imageUrls.split(',');
  if (opts.thumbnailUrl) body.thumbnail_url = opts.thumbnailUrl;

  const result = await api('POST', '/references/', { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function update(referenceId, opts) {
  const body = {};
  if (opts.name) body.name = opts.name;
  if (opts.instructions) body.instructions = opts.instructions;
  if (opts.usageMode) body.usage_mode = opts.usageMode;
  if (opts.imageUrls) body.image_urls = opts.imageUrls.split(',');
  if (opts.thumbnailUrl) body.thumbnail_url = opts.thumbnailUrl;

  const result = await api('PUT', `/references/${referenceId}`, { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function remove(referenceId) {
  const result = await api('DELETE', `/references/${referenceId}`);
  out(result);
  if (!result.success) process.exit(1);
}

export function register(program) {
  const cmd = program.command('references').description('Manage image references (@mentions)');

  cmd.command('list')
    .description('List all your image references')
    .action(list);

  cmd.command('get')
    .description('Get a reference by ID')
    .argument('<reference-id>', 'Reference UUID')
    .action(get);

  cmd.command('create')
    .description('Create a new image reference')
    .argument('<name>', 'Reference name (used as @mention)')
    .option('-i, --instructions <text>', 'Usage instructions for the AI')
    .option('--usage-mode <mode>', 'Usage mode')
    .option('--image-urls <urls>', 'Comma-separated image URLs')
    .option('--thumbnail-url <url>', 'Thumbnail URL')
    .action(create);

  cmd.command('update')
    .description('Update an image reference')
    .argument('<reference-id>', 'Reference UUID')
    .option('-n, --name <name>', 'New name')
    .option('-i, --instructions <text>', 'Usage instructions')
    .option('--usage-mode <mode>', 'Usage mode')
    .option('--image-urls <urls>', 'Comma-separated image URLs')
    .option('--thumbnail-url <url>', 'Thumbnail URL')
    .action(update);

  cmd.command('delete')
    .description('Delete an image reference')
    .argument('<reference-id>', 'Reference UUID')
    .action(remove);
}
