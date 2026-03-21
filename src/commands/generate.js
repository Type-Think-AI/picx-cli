import { apiRequest } from '../api.js';

export async function generate(prompt, options) {
  const body = { prompt };
  if (options.model) body.model = options.model;
  if (options.size) body.size = options.size;
  if (options.aspectRatio) body.aspect_ratio = options.aspectRatio;

  const result = await apiRequest('POST', '/v1/images/generate', body);
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}
