import { API_KEY } from '../config.js';

export async function auth() {
  if (API_KEY) {
    const masked = API_KEY.slice(0, 5) + '...' + API_KEY.slice(-4);
    console.log(JSON.stringify({
      success: true,
      authenticated: true,
      api_key: masked,
      message: 'API key is set via PICX_API_KEY environment variable',
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      success: false,
      authenticated: false,
      message: 'No API key found. Set it with: export PICX_API_KEY=pxsk_YOUR_KEY\nGet your key at: https://picxstudio.com/developer',
    }, null, 2));
  }
}
