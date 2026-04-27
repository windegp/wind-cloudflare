import { getCloudflareContext } from '@opennextjs/cloudflare';

// TTL constants for different data types
export const KV_TTL = {
  HOMEPAGE: 86400,      // 24 hours
  PRODUCT: 86400,       // 24 hours
  COLLECTION: 43200,    // 12 hours
  REVIEWS: 3600,        // 1 hour
  SETTINGS: 86400       // 24 hours
};

export async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch {
    return null;
  }
}

export async function kvGet(key) {
  try {
    const kv = await getKV();
    if (!kv) return null;
    const val = await kv.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Smart KV Set with automatic policy based on key pattern
 * 
 * Policy:
 * - Content keys (homepage_*, product_*, product_stats_*, collection_*, site_settings_*): 
 *   No TTL, persistent until explicit invalidation
 * - Operational keys (idempotency_*, write_guard_*): 
 *   Auto-expire with TTL (from parameter or sensible defaults)
 * - Null/undefined data: Proper deletion (not storing string)
 */
export async function kvSet(key, data, ttl) {
  try {
    const kv = await getKV();
    if (!kv) {
      console.warn(`[KV] Failed to set ${key}: KV binding unavailable`);
      return false;
    }

    // Handle deletion (null or undefined data)
    if (data === null || data === undefined) {
      try {
        await kv.delete(key);
        return true;
      } catch (deleteErr) {
        console.error(`[KV] Delete failed for ${key}:`, deleteErr.message || deleteErr);
        return false;
      }
    }

    // Detect key type for policy application
    const keyType = classifyKey(key);
    
    if (keyType === 'operational') {
      // Operational keys: Apply TTL with priority (caller > default)
      // Note: ttl=0 means no TTL (useful for immediate invalidation patterns)
      const defaultTtl = key.startsWith('idempotency_') ? 600 : 300; // 10min / 5min
      const ttlSeconds = ttl !== undefined && ttl !== null ? ttl : defaultTtl;
      
      if (ttlSeconds > 0) {
        await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
      } else {
        // ttl=0 means no expiration (operational key treated as persistent)
        await kv.put(key, JSON.stringify(data));
      }
    } else {
      // Content keys: No TTL, persistent until explicit invalidation
      // Caller-provided TTL is ignored for content keys (by design)
      await kv.put(key, JSON.stringify(data));
    }
    
    return true;
  } catch (err) {
    console.error(`[KV] Set failed for ${key}:`, err.message || err);
    return false;
  }
}

/**
 * Classify KV key by pattern to apply appropriate policy
 * @param {string} key - KV key
 * @returns {'content'|'operational'} key type
 */
function classifyKey(key) {
  // Operational keys: Temporary, need TTL
  if (key.startsWith('idempotency_') || key.startsWith('write_guard_')) {
    return 'operational';
  }
  
  // Rate limit keys: Operational but handled separately (direct kv.put)
  if (key.startsWith('ratelimit_')) {
    return 'operational';
  }
  
  // Content keys: Persistent until explicit invalidation
  // homepage_*, product_*, product_stats_*, collection_*, site_settings_*
  return 'content';
}

export async function kvDelete(key) {
  try {
    const kv = await getKV();
    if (!kv) {
      console.warn(`[KV] Failed to delete ${key}: KV binding unavailable`);
      return false;
    }
    await kv.delete(key);
    return true;
  } catch (err) {
    console.error(`[KV] Delete failed for ${key}:`, err.message || err);
    return false;
  }
}

// ✅ جديد - لحذف أكتر من key دفعة واحدة
export async function kvDeleteMany(keys = []) {
  try {
    const kv = await getKV();
    if (!kv) {
      console.warn(`[KV] Failed to delete ${keys.length} keys: KV binding unavailable`);
      return false;
    }
    if (keys.length === 0) return true; // Nothing to delete is success
    await Promise.all(keys.map(k => kv.delete(k)));
    return true;
  } catch (err) {
    console.error(`[KV] Batch delete failed for ${keys.length} keys:`, err.message || err);
    return false;
  }
}