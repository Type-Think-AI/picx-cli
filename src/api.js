import { API_BASE, API_KEY } from './config.js';

export async function apiRequest(method, path, body = null) {
  const key = API_KEY;
  if (!key && path !== '/v1/models') {
    return { success: false, error: 'PICX_API_KEY not set. Run: export PICX_API_KEY=pxsk_...' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.detail || `HTTP ${res.status}` };
    }
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
