import { api, out } from '../lib/api.js';

async function list(opts) {
  const result = await api('GET', '/templates/', {
    auth: false,
    query: {
      page: opts.page,
      limit: opts.limit,
      category: opts.category,
      media_type: opts.mediaType,
      target_model: opts.targetModel,
      is_premium: opts.premium,
      is_featured: opts.featured,
      search: opts.search,
      tags: opts.tags,
    },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function get(templateId) {
  const result = await api('GET', `/templates/${templateId}`, { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

async function categories() {
  const result = await api('GET', '/templates/categories', { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

async function create(opts) {
  const body = {};
  if (opts.name) body.name = opts.name;
  if (opts.description) body.description = opts.description;
  if (opts.prompt) body.sample_prompt = opts.prompt;
  if (opts.category) body.category = opts.category;
  if (opts.imageUrl) body.preview_thumbnail_url = opts.imageUrl;
  if (opts.previewImages) body.preview_images = opts.previewImages.split(',');
  if (opts.mediaType) body.media_type = opts.mediaType;
  if (opts.targetModel) body.target_model = opts.targetModel;
  if (opts.tags) body.tags = opts.tags.split(',');
  if (opts.premium) body.is_premium = opts.premium === 'true';

  const result = await api('POST', '/templates/', { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function update(templateId, opts) {
  const body = {};
  if (opts.name) body.name = opts.name;
  if (opts.description) body.description = opts.description;
  if (opts.prompt) body.sample_prompt = opts.prompt;
  if (opts.category) body.category = opts.category;
  if (opts.imageUrl) body.preview_thumbnail_url = opts.imageUrl;
  if (opts.tags) body.tags = opts.tags.split(',');

  const result = await api('PUT', `/templates/${templateId}`, { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function remove(templateId) {
  const result = await api('DELETE', `/templates/${templateId}`);
  out(result);
  if (!result.success) process.exit(1);
}

export function register(program) {
  const cmd = program.command('templates').description('Browse and manage prompt templates');

  cmd.command('list')
    .description('List templates with filtering')
    .option('-p, --page <n>', 'Page number', '1')
    .option('-l, --limit <n>', 'Items per page', '10')
    .option('-c, --category <cat>', 'Filter by category')
    .option('--media-type <type>', 'Filter: image, video, audio')
    .option('--target-model <model>', 'Filter by target AI model')
    .option('--premium <bool>', 'Filter by premium status')
    .option('--featured <bool>', 'Filter by featured status')
    .option('-s, --search <query>', 'Search in name and description')
    .option('--tags <tags>', 'Comma-separated tags to filter by')
    .action(list);

  cmd.command('get')
    .description('Get a template by ID')
    .argument('<template-id>', 'Template ID')
    .action(get);

  cmd.command('categories')
    .description('List template categories with counts')
    .action(categories);

  cmd.command('create')
    .description('Create a new template')
    .option('-n, --name <name>', 'Template name')
    .option('-d, --description <desc>', 'Description')
    .option('--prompt <prompt>', 'Prompt text')
    .option('-c, --category <cat>', 'Category')
    .option('--image-url <url>', 'Preview image URL')
    .option('--media-type <type>', 'Media type: image, video, audio')
    .option('--target-model <model>', 'Target AI model')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--premium <bool>', 'Premium template')
    .action(create);

  cmd.command('update')
    .description('Update a template')
    .argument('<template-id>', 'Template ID')
    .option('-n, --name <name>', 'Template name')
    .option('-d, --description <desc>', 'Description')
    .option('--prompt <prompt>', 'Prompt text')
    .option('-c, --category <cat>', 'Category')
    .option('--image-url <url>', 'Preview image URL')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(update);

  cmd.command('delete')
    .description('Delete a template')
    .argument('<template-id>', 'Template ID')
    .action(remove);
}
