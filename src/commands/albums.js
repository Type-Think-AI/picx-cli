import { api, out, fail } from '../lib/api.js';

async function list(opts) {
  const result = await api('GET', '/albums/', {
    query: {
      limit: opts.limit,
      offset: opts.offset,
      archived: opts.archived,
      folder_id: opts.folderId,
    },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function get(albumId) {
  const result = await api('GET', `/albums/${albumId}`);
  out(result);
  if (!result.success) process.exit(1);
}

async function create(title, opts) {
  const body = {};
  if (title) body.title = title;
  if (opts.chat) {
    try { body.chat = JSON.parse(opts.chat); } catch { fail('--chat must be valid JSON'); }
  }
  if (opts.folderId) body.folder_id = opts.folderId;

  const result = await api('POST', '/albums/', { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function update(albumId, opts) {
  const body = {};
  if (opts.title) body.title = opts.title;
  if (opts.chat) {
    try { body.chat = JSON.parse(opts.chat); } catch { fail('--chat must be valid JSON'); }
  }
  if (opts.archived !== undefined) body.archived = opts.archived === 'true';
  if (opts.pinned !== undefined) body.pinned = opts.pinned === 'true';
  if (opts.folderId) body.folder_id = opts.folderId;

  const result = await api('PUT', `/albums/${albumId}`, { body });
  out(result);
  if (!result.success) process.exit(1);
}

async function remove(albumId) {
  const result = await api('DELETE', `/albums/${albumId}`);
  out(result);
  if (!result.success) process.exit(1);
}

async function archive(albumId) {
  const result = await api('POST', `/albums/${albumId}/archive`);
  out(result);
  if (!result.success) process.exit(1);
}

async function pin(albumId) {
  const result = await api('POST', `/albums/${albumId}/pin`);
  out(result);
  if (!result.success) process.exit(1);
}

async function gallery(opts) {
  const result = await api('GET', '/albums/gallery/images', {
    query: { limit: opts.limit, offset: opts.offset },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function share(albumId) {
  const result = await api('POST', `/albums/${albumId}/share`);
  out(result);
  if (!result.success) process.exit(1);
}

async function unshare(albumId) {
  const result = await api('DELETE', `/albums/${albumId}/share`);
  out(result);
  if (!result.success) process.exit(1);
}

async function getShared(shareId) {
  const result = await api('GET', `/albums/share/${shareId}`, { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

async function publicList(opts) {
  const result = await api('GET', '/albums/public', {
    auth: false,
    query: { limit: opts.limit, offset: opts.offset },
  });
  out(result);
  if (!result.success) process.exit(1);
}

export function register(program) {
  const cmd = program.command('albums').description('Manage albums (chat histories)');

  cmd.command('list')
    .description('List your albums')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .option('--archived <bool>', 'Filter by archive status')
    .option('--folder-id <id>', 'Filter by folder')
    .action(list);

  cmd.command('get')
    .description('Get album with full chat history')
    .argument('<album-id>', 'Album UUID')
    .action(get);

  cmd.command('create')
    .description('Create a new album')
    .argument('[title]', 'Album title')
    .option('--chat <json>', 'Chat history JSON')
    .option('--folder-id <id>', 'Parent folder ID')
    .action(create);

  cmd.command('update')
    .description('Update an album')
    .argument('<album-id>', 'Album UUID')
    .option('-t, --title <title>', 'New title')
    .option('--chat <json>', 'Updated chat JSON')
    .option('--archived <bool>', 'Set archive status')
    .option('--pinned <bool>', 'Set pin status')
    .option('--folder-id <id>', 'Parent folder ID')
    .action(update);

  cmd.command('delete')
    .description('Delete an album permanently')
    .argument('<album-id>', 'Album UUID')
    .action(remove);

  cmd.command('archive')
    .description('Toggle archive status')
    .argument('<album-id>', 'Album UUID')
    .action(archive);

  cmd.command('pin')
    .description('Toggle pin status')
    .argument('<album-id>', 'Album UUID')
    .action(pin);

  cmd.command('gallery')
    .description('Get all generated images across albums')
    .option('-l, --limit <n>', 'Items per page', '50')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .action(gallery);

  cmd.command('share')
    .description('Create a public share link for an album')
    .argument('<album-id>', 'Album UUID')
    .action(share);

  cmd.command('unshare')
    .description('Remove public share link')
    .argument('<album-id>', 'Album UUID')
    .action(unshare);

  cmd.command('shared')
    .description('Get a publicly shared album (no auth required)')
    .argument('<share-id>', 'Share ID')
    .action(getShared);

  cmd.command('public')
    .description('List public shared albums (no auth required)')
    .option('-l, --limit <n>', 'Items per page', '20')
    .option('-o, --offset <n>', 'Pagination offset', '0')
    .action(publicList);
}
