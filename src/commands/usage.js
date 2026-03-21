import { apiRequest } from '../api.js';

export async function usage(options) {
  const period = options.period || '30d';
  const result = await apiRequest('GET', `/v1/account/usage?period=${period}`);
  console.log(JSON.stringify(result, null, 2));
}
