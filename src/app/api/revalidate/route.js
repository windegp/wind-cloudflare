import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { secret, type, id, slug, handle, keys } = body;

  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kv = await getKV();
  if (!kv) {
    return Response.json({ revalidated: true, note: "KV not available" });
  }

  let keysToDelete = [];

  if (keys && keys.length > 0) {
    // مسح مباشر بـ keys محددة — الأمثل لأي حالة
    keysToDelete = keys;
  } else if (type === 'homepage') {
    keysToDelete = ['homepage_data_v1'];
  } else if (type === 'product' && id) {
    // مسح بيانات المنتج + إحصائياته معاً دفعة واحدة
    keysToDelete = [`product_${id}`];
    if (handle) keysToDelete.push(`product_stats_${handle}`);
  } else if (type === 'product_stats' && handle) {
    // مسح الإحصائيات فقط (لما يضاف review جديد)
    keysToDelete = [`product_stats_${handle}`];
  } else if (type === 'collection' && slug) {
    keysToDelete = [`collection_${slug}`];
  } else if (type === 'site_settings') {
    keysToDelete = ['site_settings_v1'];
  }

  if (keysToDelete.length === 0) {
    return Response.json({ error: "No keys to delete" }, { status: 400 });
  }

  try {
    await Promise.all(keysToDelete.map(k => kv.delete(k)));
    return Response.json({ revalidated: true, keys: keysToDelete, timestamp: Date.now() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}