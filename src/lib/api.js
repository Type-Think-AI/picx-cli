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

export { api, upload, stream, out, fail, requireKey };
