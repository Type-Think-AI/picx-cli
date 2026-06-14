import { API_BASE, API_KEY } from './config.js';

function out(data) {
  console.log(JSON.stringify(data, null, 2));
}

function fail(error) {
  out({ success: false, error });
  process.exit(1);
}

function requireKey() {
  if (!API_KEY) {
    fail('PICX_API_KEY not set. Run: export PICX_API_KEY=pxsk_...');
  }
}

/**
 * Make an API request to the PicX backend.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. /albums)
 * @param {object} [options]
 * @param {object} [options.body] - JSON body
 * @param {object} [options.query] - Query parameters
 * @param {boolean} [options.auth] - Whether auth is required (default true)
 * @returns {Promise<object>}
 */
async function api(method, path, { body, query, auth = true } = {}) {
  if (auth) requireKey();

  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url.toString(), opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` };
    }

    if (!res.ok) {
      return { success: false, error: data.detail || `HTTP ${res.status}` };
    }
    // If response is an array, wrap it
    if (Array.isArray(data)) return { success: true, data };
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Upload a file via multipart form data.
 * @param {string} path - API path
 * @param {Buffer} fileBuffer - File content
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<object>}
 */
async function upload(path, fileBuffer, filename, contentType) {
  requireKey();

  const url = `${API_BASE}${path}`;
  const boundary = `----PicXCLI${Date.now()}`;

  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const bodyParts = [Buffer.from(header), fileBuffer, Buffer.from(footer)];
  const bodyBuffer = Buffer.concat(bodyParts);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: bodyBuffer,
  });

  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.detail || `HTTP ${res.status}` };
  }
  return { success: true, ...data };
}

/**
 * Connect to an SSE streaming endpoint.
 * @param {string} path - API path
 * @param {object} body - JSON body
 * @param {function} onEvent - Callback (eventType, data) for each SSE event
 * @returns {Promise<void>}
 */
async function stream(path, body, onEvent) {
  requireKey();

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    fail(err.detail || `HTTP ${res.status}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try { for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        try {
          const data = JSON.parse(raw);
          onEvent(currentEvent, data);
        } catch {
          onEvent(currentEvent, raw);
        }
      }
    }
  } } catch (err) {
    // Stream disconnected (e.g. Cloudflare timeout) — return what we have
    if (err.cause?.code !== 'UND_ERR_SOCKET') {
      process.stderr.write(`\nStream error: ${err.message}\n`);
    }
  }
}

/**
 * Upload a local file and return its CDN URL.
 * @param {string} filePath - Path to local image file
 * @returns {Promise<string>} The uploaded image URL
 */
async function uploadFile(filePath) {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');

  const absPath = resolve(filePath);
  let buffer;
  try {
    buffer = readFileSync(absPath);
  } catch {
    throw new Error(`Cannot read file: ${absPath}`);
  }

  const filename = absPath.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  const contentType = mimeMap[ext] || 'image/png';

  const result = await upload('/agno/upload-image', buffer, filename, contentType);
  if (!result.success) {
    throw new Error(result.error || 'Upload failed');
  }
  return result.image_url || result.url;
}

/**
 * Resolve a value that could be a local file path or a URL.
 * If it looks like a local file, upload it and return the URL.
 * @param {string} value - URL or local file path
 * @returns {Promise<string>} URL
 */
async function resolveImageValue(value) {
  // If it starts with http(s), treat as URL
  if (/^https?:\/\//i.test(value)) return value;
  // Otherwise treat as local file path
  return uploadFile(value);
}

export { api, upload, stream, out, fail, requireKey, uploadFile, resolveImageValue };
