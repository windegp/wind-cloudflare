import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { id } = await request.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    const ctx = await getCloudflareContext({ async: true });
    const kv = ctx?.env?.WIND_KV || null;
    if (kv) {
      await Promise.all([
        kv.delete(`product_${id}`),
        kv.delete(`product_stats_${id}`),
        kv.delete("homepage_data_v1")
      ]);
    }
    return Response.json({ invalidated: true });
  } catch {
    return Response.json({ invalidated: false });
  }
}