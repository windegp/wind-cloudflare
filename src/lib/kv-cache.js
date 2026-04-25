import { getCloudflareContext } from '@opennextjs/cloudflare';
import { emitKVEvent } from './observabilityEmitter';

// ═══════════════════════════════════════════════════════════
// CACHE STAMPEDE PROTECTION & BACKGROUND REFRESH
// ═══════════════════════════════════════════════════════════

const inFlightRequests = new Map();
const backgroundRefreshFlags = new Set(); // Track keys being refreshed

/**
 * Deduplicates concurrent requests for the same key
 * Prevents cache stampede (thundering herd)
 */
async function dedupeRequest(key, fetchFn) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  
  const promise = fetchFn().finally(() => {
    inFlightRequests.delete(key);
  });
  
  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Triggers background refresh without blocking
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch fresh data
 * @param {number} ttl - TTL in seconds
 */
function triggerBackgroundRefresh(key, fetchFn, ttl) {
  if (backgroundRefreshFlags.has(key)) return; // Already refreshing
  
  backgroundRefreshFlags.add(key);
  
  // Run in background (don't await)
  (async () => {
    try {
      const freshData = await fetchFn();
      if (freshData !== null && freshData !== undefined) {
        await kvSet(key, freshData, ttl);
      }
    } catch (err) {
      console.error(`[KV] Background refresh failed for ${key}:`, err);
    } finally {
      backgroundRefreshFlags.delete(key);
    }
  })();
}

// ═══════════════════════════════════════════════════════════
// KV CONNECTION
// ═══════════════════════════════════════════════════════════

export async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// CACHE PRIORITY & TTL SYSTEM
// ═══════════════════════════════════════════════════════════

export const CACHE_PRIORITY = {
  HIGH: 'high',     // Products, stats - frequent access, needs freshness
  MEDIUM: 'medium', // Homepage, collections - moderate freshness
  LOW: 'low'        // Sitemap, policies - can be stale longer
};

export const TTL = {
  // Specific key pattern TTLs (as requested)
  HOMEPAGE_DATA: 300,        // 5 minutes - homepage_data_v1
  PRODUCT: 120,              // 2 minutes - product_${id}
  PRODUCT_STATS: 60,         // 1 minute - product_stats_${handle}
  SITE_SETTINGS: 300,        // 5 minutes - site_settings_v1
  
  // Stale thresholds (2x TTL)
  HOMEPAGE_DATA_STALE: 600,  // 10 minutes
  PRODUCT_STALE: 240,        // 4 minutes
  PRODUCT_STATS_STALE: 120,  // 2 minutes
  SITE_SETTINGS_STALE: 600,  // 10 minutes
  
  // High priority - shorter TTL, aggressive refresh
  HIGH_PRIORITY: 60,           // 1 minute
  HIGH_PRIORITY_STALE: 120,  // 2 minutes (stale threshold)
  
  // Medium priority - balanced
  MEDIUM_PRIORITY: 180,        // 3 minutes
  MEDIUM_PRIORITY_STALE: 300,  // 5 minutes (stale threshold)
  
  // Low priority - longer cache
  LOW_PRIORITY: 600,           // 10 minutes
  LOW_PRIORITY_STALE: 1800,    // 30 minutes (stale threshold)
  
  // Legacy mappings (for backward compatibility)
  ADMIN_SHORT: 60,
  ADMIN_MEDIUM: 120,
  ADMIN_LONG: 300,
  STOREFRONT_SHORT: 60,
  STOREFRONT_MEDIUM: 180,
  STOREFRONT_LONG: 300,
  SITEMAP: 86400,
};

/**
 * Get TTL for a specific cache key based on its pattern
 * @param {string} key - Cache key
 * @returns {number} TTL in seconds
 */
export function getTTLForKey(key) {
  if (key.includes('homepage_data')) return TTL.HOMEPAGE_DATA;
  if (key.includes('product_stats_')) return TTL.PRODUCT_STATS;
  if (key.includes('product_') && !key.includes('stats')) return TTL.PRODUCT;
  if (key.includes('site_settings')) return TTL.SITE_SETTINGS;
  
  // Default fallback based on priority patterns
  if (key.includes('admin_')) return TTL.ADMIN_MEDIUM;
  if (key.includes('storefront_')) return TTL.STOREFRONT_MEDIUM;
  
  return TTL.MEDIUM_PRIORITY;
}

/**
 * Get stale threshold for a specific cache key
 * @param {string} key - Cache key
 * @returns {number} Stale threshold in seconds
 */
export function getStaleThresholdForKey(key) {
  if (key.includes('homepage_data')) return TTL.HOMEPAGE_DATA_STALE;
  if (key.includes('product_stats_')) return TTL.PRODUCT_STATS_STALE;
  if (key.includes('product_') && !key.includes('stats')) return TTL.PRODUCT_STALE;
  if (key.includes('site_settings')) return TTL.SITE_SETTINGS_STALE;
  
  return TTL.MEDIUM_PRIORITY_STALE;
}

/**
 * Get TTL based on priority
 * @param {string} priority - CACHE_PRIORITY value
 * @returns {number} TTL in seconds
 */
export function getTTLByPriority(priority) {
  switch (priority) {
    case CACHE_PRIORITY.HIGH:
      return TTL.HIGH_PRIORITY;
    case CACHE_PRIORITY.MEDIUM:
      return TTL.MEDIUM_PRIORITY;
    case CACHE_PRIORITY.LOW:
      return TTL.LOW_PRIORITY;
    default:
      return TTL.MEDIUM_PRIORITY;
  }
}

/**
 * Get stale threshold based on priority
 * @param {string} priority - CACHE_PRIORITY value
 * @returns {number} Stale threshold in seconds
 */
export function getStaleThreshold(priority) {
  switch (priority) {
    case CACHE_PRIORITY.HIGH:
      return TTL.HIGH_PRIORITY_STALE;
    case CACHE_PRIORITY.MEDIUM:
      return TTL.MEDIUM_PRIORITY_STALE;
    case CACHE_PRIORITY.LOW:
      return TTL.LOW_PRIORITY_STALE;
    default:
      return TTL.MEDIUM_PRIORITY_STALE;
  }
}

// ═══════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════

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
 * Store data with optional TTL
 * @param {string} key - Cache key
 * @param {any} data - Data to store
 * @param {number} ttl - TTL in seconds (optional)
 */
export async function kvSet(key, data, ttl = null) {
  try {
    const kv = await getKV();
    if (!kv) return false;
    
    const options = ttl ? { expirationTtl: ttl } : undefined;
    await kv.put(key, JSON.stringify(data), options);
    return true;
  } catch {
    return false;
  }
}

export async function kvDelete(key) {
  try {
    const kv = await getKV();
    if (!kv) return false;
    await kv.delete(key);
    return true;
  } catch {
    return false;
  }
}

// ✅ جديد - لحذف أكتر من key دفعة واحدة
export async function kvDeleteMany(keys = []) {
  try {
    const kv = await getKV();
    if (!kv || keys.length === 0) return false;
    await Promise.all(keys.map(k => kv.delete(k)));
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// KV-FIRST FETCH PATTERN (with stampede protection)
// ═══════════════════════════════════════════════════════════

/**
 * Fetches with KV-first pattern and stale-while-revalidate
 * 
 * Stale-while-revalidate behavior:
 * 1. If cache is fresh → return immediately
 * 2. If cache is stale → return stale data immediately + refresh in background
 * 3. If cache is missing → fetch and return (with deduplication)
 * 
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch data
 * @param {number} ttl - TTL in seconds (fresh threshold)
 * @param {number} staleTtl - Stale threshold in seconds (optional, defaults to ttl * 2)
 * @param {string} priority - Cache priority (high/medium/low)
 * @returns {Promise<{data: any, source: string, isStale: boolean}>}
 */
export async function kvFirstFetch(key, fetchFn, ttl = TTL.MEDIUM_PRIORITY, staleTtl = null, priority = CACHE_PRIORITY.MEDIUM) {
  // Calculate stale threshold
  const actualStaleTtl = staleTtl || getStaleThreshold(priority);
  const startTime = Date.now();
  
  // 1. Try to get cache with metadata
  const cached = await kvGet(key);
  const cachedWithMeta = await kvGet(`${key}_meta`);
  
  if (cached !== null && cached !== undefined) {
    const now = Date.now();
    const cachedAt = cachedWithMeta?.cachedAt || 0;
    const ageSeconds = (now - cachedAt) / 1000;
    const duration = Date.now() - startTime;
    
    // Cache is fresh - return immediately
    if (ageSeconds < ttl) {
      emitKVEvent('hit', key, { duration, ageSeconds, priority });
      return { data: cached, source: 'cache', isStale: false };
    }
    
    // Cache is stale but usable - return immediately + refresh in background
    if (ageSeconds < actualStaleTtl) {
      emitKVEvent('hit', key, { duration, ageSeconds, priority, isStale: true });
      triggerBackgroundRefresh(key, fetchFn, ttl);
      return { data: cached, source: 'cache-stale', isStale: true };
    }
    
    // Cache is too old - fall through to fetch
  }
  
  // 2. Deduplicate concurrent requests (prevent stampede)
  const result = await dedupeRequest(key, async () => {
    const fetchStart = Date.now();
    const data = await fetchFn();
    const fetchDuration = Date.now() - fetchStart;
    
    if (data !== null && data !== undefined) {
      // Store data
      await kvSet(key, data, ttl);
      // Store metadata for stale tracking
      await kvSet(`${key}_meta`, { cachedAt: Date.now(), priority }, Math.max(ttl, actualStaleTtl));
    }
    
    // Emit cache miss event
    emitKVEvent('miss', key, { 
      duration: fetchDuration, 
      priority,
      hasData: data !== null && data !== undefined 
    });
    
    return data;
  });
  
  return { data: result, source: 'firestore', isStale: false };
}

/**
 * Legacy kvFirstFetch for backward compatibility
 * @deprecated Use kvFirstFetch with priority parameter
 */
export async function kvFirstFetchLegacy(key, fetchFn, ttl = TTL.ADMIN_MEDIUM) {
  return kvFirstFetch(key, fetchFn, ttl, ttl * 2, CACHE_PRIORITY.MEDIUM);
}

// ═══════════════════════════════════════════════════════════
// INVALIDATION HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Invalidates cache by deleting the key
 * Use this instead of kvSet(key, null)
 */
export async function kvInvalidate(key) {
  return kvDelete(key);
}

/**
 * Invalidates multiple cache keys by prefix
 * @param {string} prefix - Key prefix to match
 */
export async function kvInvalidateByPrefix(prefix) {
  try {
    const kv = await getKV();
    if (!kv) return false;
    
    // Note: Cloudflare KV doesn't support listing by prefix in the same way
    // This is a placeholder for when you implement prefix-based invalidation
    console.warn(`Prefix invalidation not implemented: ${prefix}`);
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// SMART INVALIDATION SYSTEM
// ═══════════════════════════════════════════════════════════

// Critical keys that should rarely be invalidated
const CRITICAL_KEYS = [
  'homepage_data_v2',      // Homepage data - affects all visitors
  'site_settings_v2',    // Site-wide settings
  'sitemap_products_v2'  // Sitemap - expensive to rebuild
];

// Key dependencies - when one key is invalidated, these may also need refresh
const KEY_DEPENDENCIES = {
  'admin_products_v2': ['product_[id]_v2', 'collection_[slug]_v2'],
  'admin_collections_v2': ['homepage_data_v2'],
  'admin_reviews_v2': ['product_stats_[handle]_v2']
};

/**
 * Smart invalidation that avoids deleting critical keys unnecessarily
 * 
 * @param {string} key - Cache key to invalidate
 * @param {Object} options - Invalidation options
 * @param {boolean} options.force - Force invalidate even if critical
 * @param {boolean} options.cascade - Also invalidate dependent keys
 * @param {string} options.reason - Reason for invalidation (for logging)
 * @returns {Promise<boolean>}
 */
export async function kvSmartInvalidate(key, options = {}) {
  const { force = false, cascade = false, reason = 'unknown' } = options;
  
  try {
    // Check if this is a critical key
    const isCritical = CRITICAL_KEYS.some(critical => key.includes(critical) || critical.includes(key));
    
    if (isCritical && !force) {
      console.warn(`[KV] Skipped invalidation of critical key: ${key}`);
      console.warn(`[KV] Reason: ${reason}`);
      console.warn(`[KV] Use force: true if you really want to invalidate this key`);
      return false;
    }
    
    // Delete the key
    const deleted = await kvDelete(key);
    
    if (deleted) {
      console.log(`[KV] Invalidated: ${key} (reason: ${reason})`);
      
      // Cascade to dependent keys if requested
      if (cascade) {
        const dependencies = Object.entries(KEY_DEPENDENCIES)
          .filter(([parent, deps]) => key.includes(parent) || parent.includes(key))
          .flatMap(([_, deps]) => deps);
        
        for (const depKey of [...new Set(dependencies)]) {
          await kvDelete(depKey);
          console.log(`[KV] Cascaded invalidation to: ${depKey}`);
        }
      }
    }
    
    return deleted;
  } catch (err) {
    console.error(`[KV] Smart invalidation failed for ${key}:`, err);
    return false;
  }
}

/**
 * Batch invalidation with smart filtering
 * 
 * @param {string[]} keys - Array of keys to invalidate
 * @param {Object} options - Same as kvSmartInvalidate
 * @returns {Promise<{deleted: string[], skipped: string[]}>}
 */
export async function kvBatchSmartInvalidate(keys, options = {}) {
  const deleted = [];
  const skipped = [];
  
  for (const key of keys) {
    const isCritical = CRITICAL_KEYS.some(critical => key.includes(critical));
    
    if (isCritical && !options.force) {
      skipped.push(key);
    } else {
      const success = await kvSmartInvalidate(key, options);
      if (success) {
        deleted.push(key);
      } else {
        skipped.push(key);
      }
    }
  }
  
  console.log(`[KV] Batch invalidation: ${deleted.length} deleted, ${skipped.length} skipped`);
  return { deleted, skipped };
}

/**
 * Check if a key is considered critical
 * @param {string} key - Cache key
 * @returns {boolean}
 */
export function isCriticalKey(key) {
  return CRITICAL_KEYS.some(critical => key.includes(critical) || critical.includes(key));
}