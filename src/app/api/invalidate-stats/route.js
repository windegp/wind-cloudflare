import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { handle } = await request.json();
  if (!handle) return Response.json({ error: "handle required" }, { status: 400 });

  try {
    const ctx = await getCloudflareContext({ async: true });
    const kv = ctx?.env?.WIND_KV || null;
    if (kv) await kv.delete(`product_stats_${handle}`);
    return Response.json({ invalidated: true });
  } catch {
    return Response.json({ invalidated: false });
  }
}