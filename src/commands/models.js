import { apiRequest } from '../api.js';

export async function models() {
  const result = await apiRequest('GET', '/v1/models');
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}
