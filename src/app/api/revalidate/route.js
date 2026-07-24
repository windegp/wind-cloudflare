import { getKV, kvDeleteMany } from '@/lib/kv-cache';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, id, slug, handle, keys } = body;
  
  let keysToDelete = [];

  if (keys?.length > 0) {
    keysToDelete = keys;
  } else if (type === 'homepage') {
    keysToDelete = ['homepage_data_v1'];
    revalidatePath('/');
  } else if (type === 'sitemap') {
    keysToDelete.push('sitemap_products_v1');
  } else if ((type === 'product' || type === 'product_update') && id) {
    // عند تعديل/إنشاء/حذف منتج → نحذف sitemap cache كمان
    // اجمع المفاتيح المطلوبة من دون الكتابة فوق القيم السابقة
    keysToDelete = Array.from(new Set([`product_${id}`, 'homepage_data_v1', 'sitemap_products_v1', ...keysToDelete]));
    if (handle) keysToDelete.push(`product_stats_${handle}`);
    revalidatePath('/');
    if (handle) revalidatePath(`/products/${handle}`);
  } else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
    if (id) keysToDelete.push(`product_${id}`);
    revalidatePath('/');
    revalidatePath(`/products/${handle}`);
  } else if (type === 'likes' && id) {
    keysToDelete = [`product_${id}`, 'homepage_data_v1'];
    if (handle) keysToDelete.push(`product_stats_${handle}`);
    if (handle) revalidatePath(`/products/${handle}`);
    revalidatePath('/');
  }
  else if (type === 'collection' && slug) {
    keysToDelete = [`collection_${slug}`, 'homepage_data_v1'];
    revalidatePath('/');
    revalidatePath(`/collections/${slug}`);
  } else if (type === 'site_settings') {
    keysToDelete = ['site_settings_v1'];
    revalidatePath('/', 'layout');
  } else if (type === 'fb_catalog') {
    keysToDelete = ['fb_catalog_xml_v8'];
  } else if (type === 'all') {
  try {
    const kv = await getKV();
    if (kv) {
        const list = await kv.list();
        keysToDelete = list.keys.map(k => k.name);
      }
      revalidatePath('/', 'layout');
    } catch {}
  }

  if (keysToDelete.length === 0) {
    return Response.json({ revalidated: false, note: 'No keys to delete' });
  }

  await kvDeleteMany(keysToDelete);
  return Response.json({ revalidated: true, keys: keysToDelete, timestamp: Date.now() });
}
