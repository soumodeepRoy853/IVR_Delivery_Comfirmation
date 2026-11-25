/** Server-only API client. Dashboard credentials stay on the server, never in the browser bundle. */

function settings() {
  const production = process.env.NODE_ENV === 'production';
  const baseUrl = process.env.API_BASE_URL ?? (production ? '' : 'http://localhost:4000');
  const username = process.env.API_USERNAME ?? process.env.DASHBOARD_USER ?? (production ? '' : 'admin');
  const password = process.env.API_PASSWORD ?? process.env.DASHBOARD_PASSWORD ?? (production ? '' : 'admin');

  if (production && (!baseUrl || !username || !password)) {
    throw new Error('API_BASE_URL, API_USERNAME and API_PASSWORD are required in production');
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), username, password };
}

export async function proxyApi(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl, username, password } = settings();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
