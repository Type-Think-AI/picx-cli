import { api, stream, out, fail } from '../lib/api.js';

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

async function generate(prompt, opts) {
  const body = {
    message: prompt,
    tool: opts.tool || 'image',
    num_images: parseInt(opts.numImages, 10),
  };
  if (opts.albumId) body.album_id = opts.albumId;
  if (opts.model) body.model = opts.model;
  if (opts.models) body.models = opts.models.split(',');
  if (opts.size) body.image_size = opts.size;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.imageUrl) body.image_urls = [opts.imageUrl];

  // Video options
  if (opts.videoDuration) body.video_duration = opts.videoDuration;
  if (opts.videoModel) body.video_model = opts.videoModel;
  if (opts.videoOrientation) body.video_orientation = opts.videoOrientation;
  if (opts.startFrame) body.start_frame_url = opts.startFrame;
  if (opts.endFrame) body.end_frame_url = opts.endFrame;

  const images = [];
  let albumId = null;

  await stream('/agno/stream/v2', body, (event, data) => {
    if (event === 'image_generated' || event === 'image_generation_completed' || event === 'image_completed') {
      const url = data.image_url || data.url;
      if (url) { images.push(url); process.stderr.write(`Generated: ${url}\n`); }
    } else if (event === 'video_generated' || event === 'video_generation_completed' || event === 'video_completed') {
      const url = data.video_url || data.url;
      if (url) { images.push(url); process.stderr.write(`Video: ${url}\n`); }
    } else if (event === 'image_generation_failed' || event === 'image_failed' || event === 'video_failed') {
      process.stderr.write(`Failed: ${data.error || JSON.stringify(data)}\n`);
    } else if (event === 'image_generation_started') {
      process.stderr.write(`Generating...\n`);
    } else if (event === 'album_saved') {
      albumId = data.album_id;
    } else if (event === 'message_delta') {
      if (data.content) process.stderr.write(data.content);
    } else if (event === 'error') {
      process.stderr.write(`Error: ${data.message || JSON.stringify(data)}\n`);
    }
  });

  process.stderr.write('\n');
  const result = { success: true, images, album_id: albumId };
  if (albumId) result.album_url = `https://picxstudio.com/c/${albumId}`;
  out(result);
}

export function register(program) {
  const cmd = program.command('albums').description('Manage albums — generate images, manage chat histories');

  cmd.command('generate')
    .description('Generate images/video (auto-saves to album, supports conversation)')
    .argument('<prompt>', 'Image description or edit instruction')
    .option('--album-id <id>', 'Continue in an existing album')
    .option('-m, --model <model>', 'Image model ID')
    .option('--models <models>', 'Comma-separated model IDs for multi-model')
    .option('-s, --size <size>', 'Image size: 1K, 2K, 4K')
    .option('-a, --aspect-ratio <ratio>', 'Aspect ratio: 1:1, 16:9, 9:16, 4:3')
    .option('-n, --num-images <count>', 'Number of images (1,2,3,4,6,8,10)', '1')
    .option('-i, --image-url <url>', 'Reference image URL for editing')
    .option('--tool <tool>', 'Tool: image, video_prompt, video_frames, video_references', 'image')
    .option('--video-duration <dur>', 'Video duration: 5s or 8s')
    .option('--video-model <model>', 'Video model: veo-3.1, veo-3.1-fast')
    .option('--video-orientation <orient>', 'landscape, portrait, square')
    .option('--start-frame <url>', 'Start frame image URL')
    .option('--end-frame <url>', 'End frame image URL')
    .action(generate);

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
