import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { slug } = await request.json();
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });

  try {
    const ctx = await getCloudflareContext({ async: true });
    const kv = ctx?.env?.WIND_KV || null;
    if (kv) {
      await Promise.all([
        kv.delete(`collection_${slug}`),
        kv.delete("homepage_data_v1")
      ]);
    }
    return Response.json({ invalidated: true });
  } catch {
    return Response.json({ invalidated: false });
  }
}