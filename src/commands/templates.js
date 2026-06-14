import { api, out, resolveImageValue } from '../lib/api.js';

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
  if (opts.mediaType) body.media_type = opts.mediaType;
  if (opts.targetModel) body.target_model = opts.targetModel;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.tags) body.tags = opts.tags.split(',');
  if (opts.premium) body.is_premium = opts.premium === 'true';
  if (opts.featured) body.is_featured = opts.featured === 'true';

  // Resolve thumbnail — supports local file path or URL
  if (opts.imageUrl) {
    process.stderr.write('Resolving thumbnail...\n');
    body.preview_thumbnail_url = await resolveImageValue(opts.imageUrl);
  }

  // Resolve preview images — each value can be a local file or URL
  if (opts.previewImages) {
    const values = opts.previewImages.split(',').map(v => v.trim()).filter(Boolean);
    process.stderr.write(`Resolving ${values.length} preview image(s)...\n`);
    body.preview_images = await Promise.all(values.map(v => resolveImageValue(v)));
  }

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
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.tags) body.tags = opts.tags.split(',');
  if (opts.featured !== undefined) body.is_featured = opts.featured === 'true';
  if (opts.archived !== undefined) body.is_archived = opts.archived === 'true';
  if (opts.premium !== undefined) body.is_premium = opts.premium === 'true';

  // Resolve thumbnail — supports local file path or URL
  if (opts.imageUrl) {
    process.stderr.write('Resolving thumbnail...\n');
    body.preview_thumbnail_url = await resolveImageValue(opts.imageUrl);
  }

  // Resolve preview images — each value can be a local file or URL
  if (opts.previewImages) {
    const values = opts.previewImages.split(',').map(v => v.trim()).filter(Boolean);
    process.stderr.write(`Resolving ${values.length} preview image(s)...\n`);
    body.preview_images = await Promise.all(values.map(v => resolveImageValue(v)));
  }

  const result = await api('PUT', `/templates/${templateId}`, { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function remove(templateId) {
  const result = await api('DELETE', `/templates/${templateId}`);
  out(result);
  if (!result.success) process.exit(1);
}

// ── Admin commands ────────────────────────────────────────────────────────────

async function adminList(opts) {
  const result = await api('GET', '/admin/templates', {
    query: {
      page: opts.page,
      limit: opts.limit,
      status_filter: opts.status,
    },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function adminApprove(templateId) {
  const result = await api('PATCH', `/admin/templates/${templateId}/approve`);
  out(result);
  if (!result.success) process.exit(1);
}

async function adminArchive(templateId) {
  const result = await api('PATCH', `/admin/templates/${templateId}/archive`);
  out(result);
  if (!result.success) process.exit(1);
}

async function adminBulkStatus(opts) {
  if (!opts.ids) {
    out({ success: false, error: '--ids is required (comma-separated template IDs)' });
    process.exit(1);
  }
  if (!opts.action || !['approve', 'archive'].includes(opts.action)) {
    out({ success: false, error: "--action must be 'approve' or 'archive'" });
    process.exit(1);
  }

  const template_ids = opts.ids.split(',').map(id => parseInt(id.trim(), 10));
  const result = await api('POST', '/admin/templates/bulk-status', {
    body: { template_ids, action: opts.action },
  });
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
    .option('--prompt <prompt>', 'Sample prompt text')
    .option('-c, --category <cat>', 'Category')
    .option('--image-url <url>', 'Preview thumbnail (URL or local file path)')
    .option('--preview-images <paths>', 'Comma-separated preview images (URLs or local file paths)')
    .option('--media-type <type>', 'Media type: image, video, audio')
    .option('--target-model <model>', 'Target AI model')
    .option('--aspect-ratio <ratio>', 'Aspect ratio (e.g. 16:9, 1:1, 9:16)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--premium <bool>', 'Premium template (admin)')
    .option('--featured <bool>', 'Featured template (admin)')
    .action(create);

  cmd.command('update')
    .description('Update a template')
    .argument('<template-id>', 'Template ID')
    .option('-n, --name <name>', 'Template name')
    .option('-d, --description <desc>', 'Description')
    .option('--prompt <prompt>', 'Sample prompt text')
    .option('-c, --category <cat>', 'Category')
    .option('--image-url <url>', 'Preview thumbnail (URL or local file path)')
    .option('--preview-images <paths>', 'Comma-separated preview images (URLs or local file paths)')
    .option('--aspect-ratio <ratio>', 'Aspect ratio (e.g. 16:9, 1:1, 9:16)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--featured <bool>', 'Featured status (admin)')
    .option('--archived <bool>', 'Archived status (admin)')
    .option('--premium <bool>', 'Premium status (admin)')
    .action(update);

  cmd.command('delete')
    .description('Delete a template')
    .argument('<template-id>', 'Template ID')
    .action(remove);

  // Admin subcommands (require admin API key)
  const admin = cmd.command('admin').description('Admin template management (requires admin API key)');

  admin.command('list')
    .description('List templates for admin review')
    .option('-p, --page <n>', 'Page number', '1')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('--status <status>', 'Filter by status: pending, approved, archived (default: pending)')
    .action(adminList);

  admin.command('approve')
    .description('Approve a pending template (makes it visible to all users)')
    .argument('<template-id>', 'Template ID')
    .action(adminApprove);

  admin.command('archive')
    .description('Archive a template (hides it from all users)')
    .argument('<template-id>', 'Template ID')
    .action(adminArchive);

  admin.command('bulk-status')
    .description('Approve or archive multiple templates in one call')
    .requiredOption('--ids <ids>', 'Comma-separated template IDs')
    .requiredOption('--action <action>', "Action to perform: 'approve' or 'archive'")
    .action(adminBulkStatus);
}
