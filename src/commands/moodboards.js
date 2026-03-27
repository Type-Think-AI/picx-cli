import { api, out } from '../lib/api.js';

// ==================== CRUD ====================

async function list(opts) {
  const result = await api('GET', '/moodboards/', {
    query: { limit: opts.limit, offset: opts.offset },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function get(moodboardId) {
  const result = await api('GET', `/moodboards/${moodboardId}`);
  out(result);
  if (!result.success) process.exit(1);
}

async function getBySlug(slug) {
  const result = await api('GET', `/moodboards/by-slug/${slug}`, { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

async function create(name, opts) {
  const body = { name };
  if (opts.description) body.description = opts.description;
  if (opts.public) body.is_public = true;
  if (opts.coverImage) body.cover_image_url = opts.coverImage;
  if (opts.tags) body.tags = opts.tags.split(',');

  const result = await api('POST', '/moodboards/', { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function update(moodboardId, opts) {
  const body = {};
  if (opts.name) body.name = opts.name;
  if (opts.description) body.description = opts.description;
  if (opts.public !== undefined) body.is_public = opts.public === 'true';
  if (opts.coverImage) body.cover_image_url = opts.coverImage;
  if (opts.tags) body.tags = opts.tags.split(',');

  const result = await api('PUT', `/moodboards/${moodboardId}`, { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function remove(moodboardId) {
  const result = await api('DELETE', `/moodboards/${moodboardId}`);
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Templates in Moodboard ====================

async function listTemplates(moodboardId, opts) {
  const result = await api('GET', `/moodboards/${moodboardId}/templates`, {
    auth: false,
    query: { limit: opts.limit, offset: opts.offset },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function addTemplate(moodboardId, templateId) {
  const result = await api('POST', `/moodboards/${moodboardId}/templates/${templateId}`);
  out(result);
  if (!result.success) process.exit(1);
}

async function addTemplatesBulk(moodboardId, opts) {
  const templateIds = opts.ids.split(',').map(id => parseInt(id.trim(), 10));
  const result = await api('POST', `/moodboards/${moodboardId}/templates/bulk`, {
    body: { template_ids: templateIds },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function removeTemplate(moodboardId, templateId) {
  const result = await api('DELETE', `/moodboards/${moodboardId}/templates/${templateId}`);
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Albums in Moodboard ====================

async function listAlbums(moodboardId, opts) {
  const result = await api('GET', `/moodboards/${moodboardId}/albums`, {
    auth: false,
    query: { limit: opts.limit, offset: opts.offset },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function addAlbum(moodboardId, albumId) {
  const result = await api('POST', `/moodboards/${moodboardId}/albums/${albumId}`);
  out(result);
  if (!result.success) process.exit(1);
}

async function addAlbumsBulk(moodboardId, opts) {
  const albumIds = opts.ids.split(',').map(id => id.trim());
  const result = await api('POST', `/moodboards/${moodboardId}/albums/bulk`, {
    body: { album_ids: albumIds },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function removeAlbum(moodboardId, albumId) {
  const result = await api('DELETE', `/moodboards/${moodboardId}/albums/${albumId}`);
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Discovery & Social ====================

async function discover(opts) {
  const result = await api('GET', '/moodboards/discover/public', {
    auth: false,
    query: {
      limit: opts.limit,
      offset: opts.offset,
      search: opts.search,
      sort_by: opts.sortBy,
      profile_type: opts.profileType,
    },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function featured(opts) {
  const result = await api('GET', '/moodboards/discover/featured', {
    auth: false,
    query: { limit: opts.limit },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function getShared(shareId) {
  const result = await api('GET', `/moodboards/share/${shareId}`, { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

async function shareLink(moodboardId) {
  const result = await api('POST', `/moodboards/${moodboardId}/share`);
  out(result);
  if (!result.success) process.exit(1);
}

async function like(moodboardId) {
  const result = await api('POST', `/moodboards/${moodboardId}/like`);
  out(result);
  if (!result.success) process.exit(1);
}

async function unlike(moodboardId) {
  const result = await api('DELETE', `/moodboards/${moodboardId}/like`);
  out(result);
  if (!result.success) process.exit(1);
}

async function clone(moodboardId) {
  const result = await api('POST', `/moodboards/${moodboardId}/clone`);
  out(result);
  if (!result.success) process.exit(1);
}

export function register(program) {
  const cmd = program.command('moodboards').description('Manage moodboards (curated collections)');

  // CRUD
  cmd.command('list')
    .description('List your moodboards')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .action(list);

  cmd.command('get')
    .description('Get a moodboard by ID')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .action(get);

  cmd.command('get-by-slug')
    .description('Get a moodboard by its SEO slug')
    .argument('<slug>', 'Moodboard slug')
    .action(getBySlug);

  cmd.command('create')
    .description('Create a new moodboard')
    .argument('<name>', 'Moodboard name')
    .option('-d, --description <desc>', 'Description')
    .option('--public', 'Make it public')
    .option('--cover-image <url>', 'Cover image URL')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(create);

  cmd.command('update')
    .description('Update a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .option('-n, --name <name>', 'New name')
    .option('-d, --description <desc>', 'Description')
    .option('--public <bool>', 'Public status')
    .option('--cover-image <url>', 'Cover image URL')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(update);

  cmd.command('delete')
    .description('Delete a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .action(remove);

  // Templates in moodboard
  cmd.command('templates')
    .description('List templates in a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .action(listTemplates);

  cmd.command('add-template')
    .description('Add a template to a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .argument('<template-id>', 'Template ID')
    .action(addTemplate);

  cmd.command('add-templates-bulk')
    .description('Add multiple templates to a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .requiredOption('--ids <ids>', 'Comma-separated template IDs')
    .action(addTemplatesBulk);

  cmd.command('remove-template')
    .description('Remove a template from a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .argument('<template-id>', 'Template ID')
    .action(removeTemplate);

  // Albums in moodboard
  cmd.command('albums')
    .description('List albums in a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .action(listAlbums);

  cmd.command('add-album')
    .description('Add an album to a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .argument('<album-id>', 'Album UUID')
    .action(addAlbum);

  cmd.command('add-albums-bulk')
    .description('Add multiple albums to a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .requiredOption('--ids <ids>', 'Comma-separated album UUIDs')
    .action(addAlbumsBulk);

  cmd.command('remove-album')
    .description('Remove an album from a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .argument('<album-id>', 'Album UUID')
    .action(removeAlbum);

  // Discovery & Social
  cmd.command('discover')
    .description('Browse public moodboards')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .option('-s, --search <query>', 'Search in name and description')
    .option('--sort-by <sort>', 'Sort: recent, popular, most_liked', 'recent')
    .option('--profile-type <type>', 'Filter by profile type')
    .action(discover);

  cmd.command('featured')
    .description('Get featured moodboards')
    .option('-l, --limit <n>', 'Max items', '10')
    .action(featured);

  cmd.command('shared')
    .description('Get a moodboard by share link')
    .argument('<share-id>', 'Share ID')
    .action(getShared);

  cmd.command('share')
    .description('Generate a share link')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .action(shareLink);

  cmd.command('like')
    .description('Like a public moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .action(like);

  cmd.command('unlike')
    .description('Unlike a moodboard')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .action(unlike);

  cmd.command('clone')
    .description('Clone a public moodboard to your account')
    .argument('<moodboard-id>', 'Moodboard UUID')
    .action(clone);
}
