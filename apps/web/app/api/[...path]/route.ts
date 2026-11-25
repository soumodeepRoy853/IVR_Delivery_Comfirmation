import { type NextRequest } from 'next/server';
import { proxyApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, context: Context) {
  const { path } = await context.params;
  const target = `/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const upstream = await proxyApi(target, {
    method: req.method,
    headers: req.headers.get('content-type') ? { 'content-type': req.headers.get('content-type')! } : {},
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer()),
  });

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export { handle as GET, handle as POST };
