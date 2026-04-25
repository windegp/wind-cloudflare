import { getKV, kvDeleteMany } from '@/lib/kv-cache';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════
// DEPENDENCY MAP (Smart Invalidation)
// ═══════════════════════════════════════════════════════════
const DEPENDENCY_MAP = {
  product_update: ['product_{id}', 'product_stats_{handle}'],
  product_price: ['product_{id}', 'cart_pricing'],
  review_add: ['product_stats_{handle}', 'product_reviews_{handle}'],
  review_featured: ['product_stats_{handle}', 'product_reviews_{handle}', 'homepage_reviews'],
  like_toggle: ['product_{id}', 'product_stats_{handle}'],
  homepage_update: ['homepage_data', 'homepage_reviews'],
  collection_update: ['collection_{slug}'],
  settings_update: ['site_settings']
};

// ═══════════════════════════════════════════════════════════
// PRIORITY SYSTEM
// ═══════════════════════════════════════════════════════════
const PRIORITY = {
  HIGH: 'high',      // product, price, reviews
  MEDIUM: 'medium',  // homepage sections
  LOW: 'low'         // analytics
};

const PRIORITY_MAP = {
  product_update: PRIORITY.HIGH,
  product_price: PRIORITY.HIGH,
  review_add: PRIORITY.HIGH,
  review_featured: PRIORITY.HIGH,
  like_toggle: PRIORITY.HIGH,
  homepage_update: PRIORITY.MEDIUM,
  collection_update: PRIORITY.MEDIUM,
  settings_update: PRIORITY.LOW
};

// ═══════════════════════════════════════════════════════════
// RATE LIMITING (Prevent duplicate revalidations within 2s)
// ═══════════════════════════════════════════════════════════
const REVALIDATION_COOLDOWN = 2000; // 2 seconds
const recentInvalidations = new Map();

function shouldSkipInvalidation(key) {
  const lastInvalidation = recentInvalidations.get(key);
  if (lastInvalidation && Date.now() - lastInvalidation < REVALIDATION_COOLDOWN) {
    console.log(`[Revalidate] Skipped duplicate within cooldown: ${key}`);
    return true;
  }
  return false;
}

function markInvalidation(key) {
  recentInvalidations.set(key, Date.now());
  // Cleanup old entries
  setTimeout(() => recentInvalidations.delete(key), REVALIDATION_COOLDOWN);
}

// ═══════════════════════════════════════════════════════════
// DEBUG LOGGING
// ═══════════════════════════════════════════════════════════
function logDebug(reason, keys, priority, skipped) {
  console.log(`[Revalidate] Reason: ${reason}`);
  console.log(`[Revalidate] Keys: ${keys.join(', ')}`);
  console.log(`[Revalidate] Priority: ${priority}`);
  console.log(`[Revalidate] Skipped: ${skipped} duplicates`);
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
export async function POST(request) {
  const startTime = Date.now();
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, id, slug, handle, keys, reason = 'manual' } = body;
  
  let keysToDelete = [];
  let skippedCount = 0;
  let priority = PRIORITY.MEDIUM;

  // ═══════════════════════════════════════════════════════════
  // GRANULAR INVALIDATION (Exact keys only)
  // ═══════════════════════════════════════════════════════════
  
  if (keys?.length > 0) {
    // Custom keys provided
    keysToDelete = keys;
  } else if (type && DEPENDENCY_MAP[type]) {
    // Use dependency map for smart invalidation
    const templateKeys = DEPENDENCY_MAP[type];
    priority = PRIORITY_MAP[type] || PRIORITY.MEDIUM;
    
    keysToDelete = templateKeys.map(key => {
      return key
        .replace('{id}', id || '')
        .replace('{handle}', handle || '')
        .replace('{slug}', slug || '');
    }).filter(k => k); // Remove empty keys
  } else {
    // Legacy fallback (for backward compatibility)
    if (type === 'homepage') {
      keysToDelete = ['homepage_data_v1'];
      revalidatePath('/');
    } else if (type === 'product' && id) {
      keysToDelete = [`product_${id}`]; // Only product, NOT homepage
      if (handle) keysToDelete.push(`product_stats_${handle}`);
      revalidatePath(`/products/${handle}`);
    } else if (type === 'product_stats' && handle) {
      keysToDelete = [`product_stats_${handle}`]; // Only stats, NOT homepage
      if (id) keysToDelete.push(`product_${id}`);
      revalidatePath(`/products/${handle}`);
    } else if (type === 'likes' && id) {
      keysToDelete = [`product_${id}`]; // Only product, NOT homepage
      if (handle) keysToDelete.push(`product_stats_${handle}`);
      revalidatePath(`/products/${handle}`);
    } else if (type === 'collection' && slug) {
      keysToDelete = [`collection_${slug}`]; // Only collection, NOT homepage
      revalidatePath(`/collections/${slug}`);
    } else if (type === 'site_settings') {
      keysToDelete = ['site_settings_v1'];
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
  }

  // ═══════════════════════════════════════════════════════════
  // RATE LIMITING (Skip duplicates within 2s)
  // ═══════════════════════════════════════════════════════════
  const filteredKeys = [];
  for (const key of keysToDelete) {
    if (shouldSkipInvalidation(key)) {
      skippedCount++;
    } else {
      filteredKeys.push(key);
      markInvalidation(key);
    }
  }
  keysToDelete = filteredKeys;

  // ═══════════════════════════════════════════════════════════
  // EXECUTE INVALIDATION
  // ═══════════════════════════════════════════════════════════
  if (keysToDelete.length === 0) {
    logDebug(reason, [], priority, skippedCount);
    return Response.json({ 
      revalidated: false, 
      note: 'No keys to delete (all skipped by cooldown)',
      metrics: {
        triggered: 0,
        skipped: skippedCount,
        avgResponseTime: Date.now() - startTime
      }
    });
  }

  await kvDeleteMany(keysToDelete);
  
  const responseTime = Date.now() - startTime;
  logDebug(reason, keysToDelete, priority, skippedCount);

  return Response.json({ 
    revalidated: true, 
    keys: keysToDelete, 
    priority,
    timestamp: Date.now(),
    metrics: {
      triggered: keysToDelete.length,
      skipped: skippedCount,
      avgResponseTime: responseTime
    }
  });
}