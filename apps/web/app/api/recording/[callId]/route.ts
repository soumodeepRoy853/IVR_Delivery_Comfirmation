import { proxyApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ callId: string }> },
) {
  const { callId } = await context.params;
  const upstream = await proxyApi(`/api/recordings/${encodeURIComponent(callId)}`);

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'private, max-age=3600',
    },
  });
}
