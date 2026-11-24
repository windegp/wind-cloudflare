import { getKV, kvDeleteMany } from '@/lib/kv-cache';
import { revalidatePath } from 'next/cache';
import { verifyAdminIdToken } from '@/lib/verifyAdminIdToken';
import { isSameOrigin, enforceRateLimit } from '@/lib/apiGuards';
import { getDb } from '@/lib/firebase';
import { kvGet } from '@/lib/kv-cache';
import { collectionsOf, listingKeysForCollections, readProductCollectionsFromFirestore } from '@/lib/listingCache';

export const dynamic = 'force-dynamic';

// Customer pages may only refresh the cache of ONE product after a like or a review.
// Every other type (and raw `keys`) is admin-only.
const PUBLIC_TYPES = new Set(['likes', 'product_stats']);
// Raw cache keys an admin may delete. Rate-limit, idempotency and write-guard keys are never touched.
const ALLOWED_KEY_PREFIXES = [
  'homepage_', 'site_settings_', 'sitemap_', 'fb_catalog_', 'google_catalog_',
  'tiktok_catalog_', 'tt_catalog_', 'product_', 'collection_', 'offers_',
  'catpage_', 'relcol_',
];
const isAllowedKey = (key) =>
  typeof key === 'string' && key.length <= 200 && ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p));

const SAFE_ID = /^[^\s/\\?#]{1,200}$/;

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, id, slug, handle, keys } = body;

  const isPublicRequest =
    PUBLIC_TYPES.has(type) &&
    !(Array.isArray(keys) && keys.length > 0) &&
    (id === undefined || SAFE_ID.test(String(id))) &&
    (handle === undefined || SAFE_ID.test(String(handle)));

  if (isPublicRequest) {
    if (!isSameOrigin(request)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const limited = await enforceRateLimit(request, 'REVALIDATE_PUBLIC');
    if (limited) return limited;
  } else {
    const auth = await verifyAdminIdToken(request);
    if (!auth.ok) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  let keysToDelete = [];

  if (keys?.length > 0) {
    if (!Array.isArray(keys) || keys.length > 100 || !keys.every(isAllowedKey)) {
      return Response.json({ error: 'Key not allowed' }, { status: 400 });
    }
    keysToDelete = keys;
  } else if (type === 'homepage') {
    keysToDelete = ['homepage_data_v1'];
    revalidatePath('/');
  } else if (type === 'sitemap') {
    keysToDelete.push('sitemap_products_v1');
  } else if ((type === 'product' || type === 'product_update') && id) {
    // عند تعديل/إنشاء/حذف منتج → نحذف sitemap cache كمان
    // اجمع المفاتيح المطلوبة من دون الكتابة فوق القيم السابقة
    keysToDelete = Array.from(
  new Set([
    `product_${id}`,
    'homepage_data_v1',
    'sitemap_products_v1',
    'fb_catalog_xml_v9',
    'google_catalog_xml_v1',
    ...keysToDelete,
  ])
);
    if (handle) keysToDelete.push(`product_stats_${handle}`);
    // Cached category pages and related lists: clear the product's OLD collections (from its cached
    // copy, still the pre-edit version here) and NEW ones (from Firestore, already saved).
    // Covers create, edit, delete, inventory and import, whatever the admin page sends.
    try {
      const old = collectionsOf(await kvGet(`product_${id}`));
      let current = [];
      try { current = await readProductCollectionsFromFirestore(getDb(), id); } catch {}
      keysToDelete.push(...listingKeysForCollections([...old, ...current, ...(Array.isArray(body.collections) ? body.collections.slice(0, 20).filter((c) => typeof c === 'string' && c.length <= 100) : [])]));
    } catch {}
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
    keysToDelete = [`collection_${slug}`, 'homepage_data_v1', ...listingKeysForCollections([slug])];
    revalidatePath('/');
    revalidatePath(`/collections/${slug}`);
  } else if (type === 'offers') {
    // The offers endpoint reads Firestore directly; invalidate its route cache after admin edits.
    revalidatePath('/api/offers');
    revalidatePath('/', 'layout');
  } else if (type === 'site_settings') {
    keysToDelete = ['site_settings_v1'];
    revalidatePath('/', 'layout');
  } else if (type === 'fb_catalog') {
    keysToDelete = ['fb_catalog_xml_v9'];
    } else if (type === 'google_catalog') {
    keysToDelete = ['google_catalog_xml_v1'];
  } else if (type === 'all') {
  try {
    const kv = await getKV();
    if (kv) {
        const list = await kv.list();
        keysToDelete = list.keys.map(k => k.name).filter(isAllowedKey);
      }
      revalidatePath('/', 'layout');
    } catch {}
  }

  if (keysToDelete.length === 0) {
    return Response.json({
      revalidated: type === 'offers',
      keys: [],
      timestamp: Date.now(),
      ...(type === 'offers' ? {} : { note: 'No keys to delete' }),
    });
  }

  await kvDeleteMany(keysToDelete);
  return Response.json({ revalidated: true, keys: keysToDelete, timestamp: Date.now() });
}
