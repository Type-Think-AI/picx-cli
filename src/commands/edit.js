import { apiRequest } from '../api.js';

export async function edit(instruction, options) {
  if (!options.imageUrl) {
    console.log(JSON.stringify({ success: false, error: '--image-url is required' }, null, 2));
    process.exit(1);
  }

  const body = {
    instruction,
    image_urls: [options.imageUrl],
  };
  if (options.model) body.model = options.model;
  if (options.size) body.size = options.size;

  const result = await apiRequest('POST', '/v1/images/edit', body);
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}
