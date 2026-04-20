import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const kv = ctx?.env?.WIND_KV || null;
    if (kv) await kv.delete("homepage_data_v1");
    return Response.json({ invalidated: true });
  } catch {
    return Response.json({ invalidated: false });
  }
}