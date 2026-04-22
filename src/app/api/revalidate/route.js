import { getKV, kvDeleteMany } from '@/lib/kv-cache';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { secret, type, id, slug, handle, keys } = body;
if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let keysToDelete = [];

  if (keys?.length > 0) {
    keysToDelete = keys;
  } else if (type === 'homepage') {
    keysToDelete = ['homepage_data_v1'];
  } else if (type === 'product' && id) {
    keysToDelete = [`product_${id}`, 'homepage_data_v1'];
    if (handle) keysToDelete.push(`product_stats_${handle}`);
  } else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, 'homepage_reviews_v1'];
  } else if (type === 'collection' && slug) {
    keysToDelete = [`collection_${slug}`];
  } else if (type === 'site_settings') {
    keysToDelete = ['site_settings_v1'];
  } else if (type === 'all') {
    try {
      const kv = await getKV();
      if (kv) {
        const list = await kv.list();
        keysToDelete = list.keys.map(k => k.name);
      }
    } catch {
      keysToDelete = ['homepage_data_v1', 'homepage_reviews_v1', 'site_settings_v1'];
    }
  }

  if (keysToDelete.length === 0) {
    return Response.json({ revalidated: false, note: 'No keys to delete' });
  }

  await kvDeleteMany(keysToDelete);
  return Response.json({ revalidated: true, keys: keysToDelete, timestamp: Date.now() });
}