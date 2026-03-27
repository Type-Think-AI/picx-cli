import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api, upload, out, fail } from '../lib/api.js';
import { API_KEY } from '../lib/config.js';

// ==================== Auth ====================

async function auth() {
  if (API_KEY) {
    const masked = API_KEY.slice(0, 5) + '...' + API_KEY.slice(-4);
    out({ success: true, authenticated: true, api_key: masked });
  } else {
    fail('No API key found. Set it with: export PICX_API_KEY=pxsk_YOUR_KEY');
  }
}

async function me() {
  const result = await api('GET', '/user/me');
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Usage ====================

async function usage(opts) {
  const result = await api('GET', '/v1/account/usage', {
    query: { period: opts.period },
  });
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Models ====================

async function models() {
  const result = await api('GET', '/v1/models', { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

async function modelConfig() {
  const result = await api('GET', '/api/v1/config/models', { auth: false });
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Upload ====================

async function uploadImage(filePath) {
  const absPath = resolve(filePath);
  let buffer;
  try {
    buffer = readFileSync(absPath);
  } catch (e) {
    fail(`Cannot read file: ${absPath}`);
  }

  const filename = absPath.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  const contentType = mimeMap[ext] || 'image/png';

  const result = await upload('/agno/upload-image', buffer, filename, contentType);
  out(result);
  if (!result.success) process.exit(1);
}

// ==================== Discovery ====================

async function discoveryTags(opts) {
  const result = await api('GET', '/discovery/tags', {
    auth: false,
    query: { source: opts.source, limit: opts.limit },
  });
  out(result);
  if (!result.success) process.exit(1);
}

async function discoveryTagsDetailed(opts) {
  const result = await api('GET', '/discovery/tags/detailed', {
    auth: false,
    query: { source: opts.source, limit: opts.limit },
  });
  out(result);
  if (!result.success) process.exit(1);
}

export function register(program) {
  // Auth
  program.command('auth')
    .description('Check API key authentication status')
    .action(auth);

  program.command('me')
    .description('Get current user profile')
    .action(me);

  // Usage
  program.command('usage')
    .description('Show API usage statistics')
    .option('-p, --period <period>', 'Time period (e.g. 7d, 30d, 90d)', '30d')
    .action(usage);

  // Models
  program.command('models')
    .description('List available image/video models')
    .action(models);

  program.command('model-config')
    .description('Get full model configuration (image + video models, settings)')
    .action(modelConfig);

  // Upload
  program.command('upload')
    .description('Upload a local image file to PicX storage')
    .argument('<file>', 'Path to image file')
    .action(uploadImage);

  // Discovery
  const disc = program.command('discovery').description('Discovery and explore features');

  disc.command('tags')
    .description('Get popular tags')
    .option('--source <src>', 'Source: all, templates, moodboards', 'all')
    .option('-l, --limit <n>', 'Max tags', '50')
    .action(discoveryTags);

  disc.command('tags-detailed')
    .description('Get detailed tag info with counts and sources')
    .option('--source <src>', 'Source: all, templates, moodboards', 'all')
    .option('-l, --limit <n>', 'Max tags', '50')
    .action(discoveryTagsDetailed);
}
