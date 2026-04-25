/**
 * Session Cache Utility
 * Client-side caching using sessionStorage to reduce API calls and Firestore reads
 * 
 * Cache Structure:
 * {
 *   data: any,
 *   timestamp: number (Date.now())
 * }
 * 
 * Validation Rules:
 * - Age < 60s: Fresh → return data immediately
 * - Age 60s-5min: Semi-fresh → return data + trigger background refresh
 * - Age > 5min: Stale → ignore cache
 */

import { mutate } from 'swr';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const CACHE_FRESH_MS = 60000;        // 1 minute - return immediately
const CACHE_STALE_MS = 300000;       // 5 minutes - return + background refresh
const FETCHING_KEYS_KEY = 'wind_fetching_keys';
const MAX_CACHE_KEYS = 20;           // Maximum number of cache entries
const INFLIGHT_PROMISES_KEY = 'wind_inflight_promises'; // Store in-flight promises

// ═══════════════════════════════════════════════════════════
// CACHE TYPES (for validation)
// ═══════════════════════════════════════════════════════════

export const SESSION_CACHE_KEYS = {
  PRODUCT: (id) => `wind_product_${id}`,
  HOMEPAGE_SECTIONS: 'wind_homepage_sections',
  HOMEPAGE_REVIEWS: 'wind_homepage_reviews',
  PRODUCT_STATS: (handle) => `wind_stats_${handle}`,
};

// Keys that should NEVER be cached (safety)
const NEVER_CACHE_KEYS = [
  'checkout',
  'payment',
  'order',
  'admin',
  'auth',
  'user',
  'session',
  'token',
];

// ═══════════════════════════════════════════════════════════
// CORE CACHE FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Check if a key is safe to cache
 * @param {string} key - Cache key to validate
 * @returns {boolean} - true if safe to cache
 */
export function isCacheableKey(key) {
  if (!key || typeof key !== 'string') return false;
  const lowerKey = key.toLowerCase();
  return !NEVER_CACHE_KEYS.some(forbidden => lowerKey.includes(forbidden));
}

/**
 * Get cached data from sessionStorage
 * @param {string} key - Cache key
 * @returns {{data: any, timestamp: number, age: number, status: 'fresh'|'stale'|'expired'|null} | null}
 */
export function getSessionCache(key) {
  try {
    if (typeof window === 'undefined') return null;
    if (!isCacheableKey(key)) return null;

    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!parsed || typeof parsed.timestamp !== 'number') {
      sessionStorage.removeItem(key);
      return null;
    }

    const age = Date.now() - parsed.timestamp;

    // Determine cache status
    let status = 'expired';
    if (age < CACHE_FRESH_MS) {
      status = 'fresh';
    } else if (age < CACHE_STALE_MS) {
      status = 'stale';
    }

    return {
      data: parsed.data,
      timestamp: parsed.timestamp,
      age,
      status
    };
  } catch (error) {
    console.error('[SessionCache] Error reading cache:', error);
    // Clear corrupted cache
    try {
      sessionStorage.removeItem(key);
    } catch {}
    return null;
  }
}

/**
 * Save data to sessionStorage cache with size control
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @returns {boolean} - true if saved successfully
 */
export function setSessionCache(key, data) {
  try {
    if (typeof window === 'undefined') return false;
    if (!isCacheableKey(key)) {
      console.warn('[SessionCache] Key not cacheable:', key);
      return false;
    }

    // Enforce cache size limit (max 20 keys)
    enforceCacheSizeLimit();

    const cacheEntry = {
      data,
      timestamp: Date.now()
    };

    sessionStorage.setItem(key, JSON.stringify(cacheEntry));
    return true;
  } catch (error) {
    // Handle quota exceeded or other storage errors
    if (error.name === 'QuotaExceededError') {
      console.warn('[SessionCache] Storage quota exceeded, clearing old cache...');
      clearOldestCacheEntry();
      // Retry once
      try {
        sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        return true;
      } catch {}
    }
    console.error('[SessionCache] Error saving cache:', error);
    return false;
  }
}

/**
 * Enforce cache size limit (max 20 keys)
 * Removes oldest entries if limit exceeded
 */
function enforceCacheSizeLimit() {
  try {
    if (typeof window === 'undefined') return;

    const cacheKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('wind_') && key !== FETCHING_KEYS_KEY) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(key));
          if (cached && cached.timestamp) {
            cacheKeys.push({ key, timestamp: cached.timestamp });
          }
        } catch {}
      }
    }

    // Sort by timestamp (oldest first)
    cacheKeys.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest entries if exceeding limit
    while (cacheKeys.length >= MAX_CACHE_KEYS) {
      const oldest = cacheKeys.shift();
      if (oldest) {
        sessionStorage.removeItem(oldest.key);
      }
    }
  } catch (error) {
    console.error('[SessionCache] Error enforcing cache size:', error);
  }
}

/**
 * Clear the oldest cache entry
 */
function clearOldestCacheEntry() {
  try {
    if (typeof window === 'undefined') return;

    let oldestKey = null;
    let oldestTimestamp = Infinity;

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('wind_') && key !== FETCHING_KEYS_KEY) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(key));
          if (cached && cached.timestamp && cached.timestamp < oldestTimestamp) {
            oldestTimestamp = cached.timestamp;
            oldestKey = key;
          }
        } catch {}
      }
    }

    if (oldestKey) {
      sessionStorage.removeItem(oldestKey);
    }
  } catch (error) {
    console.error('[SessionCache] Error clearing oldest cache:', error);
  }
}

/**
 * Remove cached data
 * @param {string} key - Cache key to remove
 */
export function removeSessionCache(key) {
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error('[SessionCache] Error removing cache:', error);
  }
}

/**
 * Clear all expired cache entries
 */
export function clearExpiredCache() {
  try {
    if (typeof window === 'undefined') return;

    const now = Date.now();
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('wind_')) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(key));
          if (cached && (now - cached.timestamp) > CACHE_STALE_MS) {
            sessionStorage.removeItem(key);
          }
        } catch {}
      }
    }
  } catch (error) {
    console.error('[SessionCache] Error clearing expired cache:', error);
  }
}

/**
 * Clear all session cache (for logout, etc.)
 */
export function clearAllSessionCache() {
  try {
    if (typeof window === 'undefined') return;

    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('wind_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  } catch (error) {
    console.error('[SessionCache] Error clearing all cache:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// FETCH DEDUPLICATION (Shared In-Flight Promises)
// ═══════════════════════════════════════════════════════════

// In-memory store for in-flight promises (per page load)
const inFlightPromises = new Map();

// Track which keys have already been synced with SWR to prevent double mutate
const MAX_SYNCED_KEYS = 50;
const syncedKeys = new Set();

/**
 * Add key to synced set with size limit
 * @param {string} key - Cache key
 */
function markSynced(key) {
  if (syncedKeys.size >= MAX_SYNCED_KEYS) {
    // Clear oldest entries when limit exceeded
    const keysArray = Array.from(syncedKeys);
    syncedKeys.clear();
    // Keep last 25 keys
    keysArray.slice(-25).forEach(k => syncedKeys.add(k));
  }
  syncedKeys.add(key);
}

/**
 * Get in-flight promise for a key
 * @param {string} key - Cache key
 * @returns {Promise | null}
 */
function getInFlightPromise(key) {
  return inFlightPromises.get(key) || null;
}

/**
 * Set in-flight promise for a key
 * @param {string} key - Cache key
 * @param {Promise} promise - The fetch promise
 */
function setInFlightPromise(key, promise) {
  inFlightPromises.set(key, promise);
  // Cleanup after promise resolves/rejects
  promise.finally(() => {
    inFlightPromises.delete(key);
    syncedKeys.delete(key); // Reset sync flag after fetch completes
  });
}

/**
 * Check if a fetch is already in progress
 * @param {string} key - Fetch key
 * @returns {boolean}
 */
export function isFetching(key) {
  return inFlightPromises.has(key);
}

// ═══════════════════════════════════════════════════════════
// SMART FETCH WITH CACHE
// ═══════════════════════════════════════════════════════════

/**
 * Smart fetch with session cache and deduplication
 * 
 * Priority:
 * 1. Check session cache (fresh → return, stale → return + background refresh)
 * 2. Check if already fetching (return same promise)
 * 3. Execute fetch
 * 4. Cache result
 * 
 * @param {string} cacheKey - Cache/storage key
 * @param {Function} fetchFn - Async function to fetch data
 * @param {Function} onBackgroundRefresh - Callback to trigger SWR revalidation
 * @param {Function} swrMutate - SWR mutate function to sync cache with SWR
 * @returns {Promise<{data: any, source: 'cache'|'fetch', isStale: boolean}>}
 */
export async function smartFetch(cacheKey, fetchFn, onBackgroundRefresh = null, swrMutate = null) {
  // 1. Check session cache first
  const cached = getSessionCache(cacheKey);

  if (cached) {
    if (cached.status === 'fresh') {
      // Fresh cache (< 60s) - return immediately
      // Sync with SWR without revalidation (only once per key)
      if (swrMutate && typeof swrMutate === 'function' && !syncedKeys.has(cacheKey)) {
        swrMutate(cached.data, false);
        markSynced(cacheKey);
      }
      return {
        data: cached.data,
        source: 'cache',
        isStale: false
      };
    }

    if (cached.status === 'stale') {
      // Semi-fresh (60s - 5min) - return + background refresh
      // Sync with SWR without revalidation (only once per key)
      if (swrMutate && typeof swrMutate === 'function' && !syncedKeys.has(cacheKey)) {
        swrMutate(cached.data, false);
        markSynced(cacheKey);
      }
      
      // Trigger background refresh without awaiting (delayed with jitter to prevent burst)
      if (onBackgroundRefresh && typeof onBackgroundRefresh === 'function') {
        // Add jitter: random delay between 100-300ms
        const jitterDelay = 100 + Math.random() * 200;
        
        // Use requestIdleCallback if available, otherwise setTimeout with jitter
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => onBackgroundRefresh(), { timeout: jitterDelay });
        } else {
          setTimeout(() => onBackgroundRefresh(), jitterDelay);
        }
      }

      return {
        data: cached.data,
        source: 'cache',
        isStale: true
      };
    }
    // Expired (> 5min) - continue to fetch
  }

  // 2. Check if already fetching (return same promise for deduplication)
  const existingPromise = getInFlightPromise(cacheKey);
  if (existingPromise) {
    console.log('[SessionCache] Returning in-flight promise for:', cacheKey);
    return existingPromise;
  }

  // 3. Execute fetch
  const fetchPromise = (async () => {
    try {
      const data = await fetchFn();

      // 4. Cache the result
      setSessionCache(cacheKey, data);

      // Sync new data with SWR after successful fetch
      if (swrMutate && typeof swrMutate === 'function') {
        swrMutate(data, false);
      }

      return {
        data,
        source: 'fetch',
        isStale: false
      };
    } catch (error) {
      // If fetch fails but we have cached data (fresh or stale), return it as fallback
      if (cached && cached.data) {
        console.warn('[SessionCache] Fetch failed, using cached data as fallback:', error.message);
        return {
          data: cached.data,
          source: 'cache',
          isStale: cached.status !== 'fresh'
        };
      }
      throw error;
    }
  })();

  // Store promise for deduplication
  setInFlightPromise(cacheKey, fetchPromise);

  return fetchPromise;
}

// ═══════════════════════════════════════════════════════════
// CACHE INVALIDATION HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Invalidate product cache (session + KV + SWR)
 * @param {string} id - Product ID
 * @param {string} handle - Product handle (optional)
 */
export async function invalidateProductCache(id, handle = null) {
  // Clear session cache
  removeSessionCache(SESSION_CACHE_KEYS.PRODUCT(id));
  
  // Clear KV cache via revalidate API with dependency map
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'product_update', 
        id, 
        handle,
        reason: 'product_invalidation'
      })
    });
  } catch (error) {
    console.error('[SessionCache] Failed to invalidate KV cache for product:', error);
  }
  
  // Trigger SWR global mutation for immediate UI update
  try {
    mutate(`product-${id}`);
    if (handle) mutate(`product-stats-${handle}`);
  } catch (error) {
    console.error('[SessionCache] Failed to mutate SWR cache for product:', error);
  }
}

/**
 * Invalidate product stats cache (session + KV + SWR)
 * @param {string} handle - Product handle
 * @param {boolean} featured - Whether review is featured (affects homepage)
 */
export async function invalidateProductStatsCache(handle, featured = false) {
  // Clear session cache
  removeSessionCache(SESSION_CACHE_KEYS.PRODUCT_STATS(handle));
  
  // Clear KV cache via revalidate API with dependency map
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: featured ? 'review_featured' : 'review_add', 
        handle,
        reason: 'review_invalidation'
      })
    });
  } catch (error) {
    console.error('[SessionCache] Failed to invalidate KV cache for product stats:', error);
  }
  
  // Trigger SWR global mutation for immediate UI update
  try {
    mutate(`product-stats-${handle}`);
    if (featured) {
      mutate('homepage-reviews');
    }
  } catch (error) {
    console.error('[SessionCache] Failed to mutate SWR cache for product stats:', error);
  }
}

/**
 * Invalidate homepage cache (session + KV + SWR)
 */
export async function invalidateHomepageCache() {
  // Clear session cache
  removeSessionCache(SESSION_CACHE_KEYS.HOMEPAGE_SECTIONS);
  removeSessionCache(SESSION_CACHE_KEYS.HOMEPAGE_REVIEWS);
  
  // Clear KV cache via revalidate API with dependency map
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'homepage_update',
        reason: 'homepage_invalidation'
      })
    });
  } catch (error) {
    console.error('[SessionCache] Failed to invalidate KV cache for homepage:', error);
  }
  
  // Trigger SWR global mutations for immediate UI update
  try {
    mutate('homepage-reviews');
    mutate('homepage-products-sections');
  } catch (error) {
    console.error('[SessionCache] Failed to mutate SWR cache for homepage:', error);
  }
}

/**
 * Invalidate all product-related caches (for bulk updates)
 */
export function invalidateAllProductCaches() {
  try {
    if (typeof window === 'undefined') return;

    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('wind_product_') || key.startsWith('wind_stats_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  } catch (error) {
    console.error('[SessionCache] Error invalidating product caches:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// LOCAL STORAGE (for Cart & Wishlist only)
// ═══════════════════════════════════════════════════════════

const LOCAL_STORAGE_KEYS = {
  CART: 'wind_cart',
  WISHLIST: 'wind_wishlist',
};

/**
 * Get cart from localStorage (NO Firestore reads allowed)
 * @returns {Array}
 */
export function getCart() {
  try {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.CART);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save cart to localStorage
 * @param {Array} cart
 */
export function setCart(cart) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_STORAGE_KEYS.CART, JSON.stringify(cart));
  } catch (error) {
    console.error('[SessionCache] Error saving cart:', error);
  }
}

/**
 * Get wishlist from localStorage (NO Firestore reads allowed)
 * @returns {Array}
 */
export function getWishlist() {
  try {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.WISHLIST);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save wishlist to localStorage
 * @param {Array} wishlist
 */
export function setWishlist(wishlist) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_STORAGE_KEYS.WISHLIST, JSON.stringify(wishlist));
  } catch (error) {
    console.error('[SessionCache] Error saving wishlist:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// DEBUG UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
  try {
    if (typeof window === 'undefined') return null;

    const stats = {
      total: 0,
      fresh: 0,
      stale: 0,
      expired: 0,
      fetching: getFetchingKeys().size,
      keys: []
    };

    const now = Date.now();
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('wind_') && key !== FETCHING_KEYS_KEY) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(key));
          if (cached && cached.timestamp) {
            const age = now - cached.timestamp;
            stats.total++;
            stats.keys.push({
              key,
              age: Math.round(age / 1000) + 's',
              status: age < CACHE_FRESH_MS ? 'fresh' : (age < CACHE_STALE_MS ? 'stale' : 'expired')
            });

            if (age < CACHE_FRESH_MS) stats.fresh++;
            else if (age < CACHE_STALE_MS) stats.stale++;
            else stats.expired++;
          }
        } catch {}
      }
    }

    return stats;
  } catch (error) {
    console.error('[SessionCache] Error getting stats:', error);
    return null;
  }
}

// Auto-clear expired cache on module load (client-side only)
if (typeof window !== 'undefined') {
  clearExpiredCache();
}
