import { api, stream, out, fail } from '../lib/api.js';

/**
 * picx generate <prompt> — Generate an image via /v1/images/generate
 */
export async function generate(prompt, opts) {
  const body = { prompt };
  if (opts.model) body.model = opts.model;
  if (opts.size) body.size = opts.size;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;

  const result = await api('POST', '/v1/images/generate', { body });
  out(result);
  if (!result.success) process.exit(1);
}

/**
 * picx edit <instruction> — Edit an image via /v1/images/edit
 */
export async function edit(instruction, opts) {
  if (!opts.imageUrl) fail('--image-url is required');

  const body = {
    instruction,
    image_urls: [opts.imageUrl],
  };
  if (opts.model) body.model = opts.model;
  if (opts.size) body.size = opts.size;

  const result = await api('POST', '/v1/images/edit', { body });
  out(result);
  if (!result.success) process.exit(1);
}

/**
 * picx stream <message> — Streaming generation via /agno/stream/v2 (SSE)
 */
export async function streamGenerate(message, opts) {
  const body = {
    message,
    tool: opts.tool || 'image',
  };
  if (opts.model) body.model = opts.model;
  if (opts.models) body.models = opts.models.split(',');
  if (opts.size) body.image_size = opts.size;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.numImages) body.num_images = parseInt(opts.numImages, 10);
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.albumId) body.album_id = opts.albumId;

  // Video options
  if (opts.videoDuration) body.video_duration = opts.videoDuration;
  if (opts.videoModel) body.video_model = opts.videoModel;
  if (opts.videoOrientation) body.video_orientation = opts.videoOrientation;
  if (opts.startFrame) body.start_frame_url = opts.startFrame;
  if (opts.endFrame) body.end_frame_url = opts.endFrame;

  const images = [];

  let albumId = null;

  await stream('/agno/stream/v2', body, (event, data) => {
    if (event === 'image_generation_completed' || event === 'image_completed') {
      const url = data.image_url || data.url;
      if (url) { images.push(url); process.stderr.write(`Generated: ${url}\n`); }
    } else if (event === 'video_generation_completed' || event === 'video_completed') {
      const url = data.video_url || data.url;
      if (url) { images.push(url); process.stderr.write(`Video: ${url}\n`); }
    } else if (event === 'image_generation_failed' || event === 'image_failed' || event === 'video_generation_failed') {
      process.stderr.write(`Failed: ${data.error || JSON.stringify(data)}\n`);
    } else if (event === 'image_generation_started') {
      process.stderr.write(`Generating image...\n`);
    } else if (event === 'album_saved') {
      albumId = data.album_id;
    } else if (event === 'message_delta') {
      if (data.content) process.stderr.write(data.content);
    } else if (typeof data === 'object' && data.url && !data.function_name) {
      // Tool call result with generated URL
      images.push(data.url);
      process.stderr.write(`Generated: ${data.url}\n`);
    }
  });

  process.stderr.write('\n');
  out({ success: true, images, album_id: albumId });
}

export function register(program) {
  program
    .command('generate')
    .description('Generate an image from a text prompt')
    .argument('<prompt>', 'Image description')
    .option('-m, --model <model>', 'Model ID')
    .option('-s, --size <size>', 'Image size: 1K, 2K, 4K')
    .option('-a, --aspect-ratio <ratio>', 'Aspect ratio: 1:1, 16:9, 9:16, 4:3')
    .action(generate);

  program
    .command('edit')
    .description('Edit an image with an instruction')
    .argument('<instruction>', 'Edit instruction')
    .option('-i, --image-url <url>', 'URL of image to edit (required)')
    .option('-m, --model <model>', 'Model ID')
    .option('-s, --size <size>', 'Image size: 1K, 2K, 4K')
    .action(edit);

  program
    .command('stream')
    .description('Streaming image/video generation via AI agent (SSE)')
    .argument('<message>', 'Prompt message')
    .option('-m, --model <model>', 'Image model ID')
    .option('--models <models>', 'Comma-separated model IDs for multi-model generation')
    .option('-s, --size <size>', 'Image size: 1K, 2K, 4K')
    .option('-a, --aspect-ratio <ratio>', 'Aspect ratio')
    .option('-n, --num-images <count>', 'Number of images (1,2,3,4,6,8,10)', '4')
    .option('--session-id <id>', 'Session ID for conversation tracking')
    .option('--album-id <id>', 'Album ID to persist chat history')
    .option('--tool <tool>', 'Tool: image, video_prompt, video_frames, video_references', 'image')
    .option('--video-duration <dur>', 'Video duration: 5s or 8s')
    .option('--video-model <model>', 'Video model: veo-3.1, veo-3.1-fast')
    .option('--video-orientation <orient>', 'landscape, portrait, square')
    .option('--start-frame <url>', 'Start frame image URL (video_frames)')
    .option('--end-frame <url>', 'End frame image URL (video_frames)')
    .action(streamGenerate);
}
