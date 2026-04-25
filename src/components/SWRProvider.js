"use client";
import { SWRConfig, SWRConfiguration } from 'swr';
import { usePathname } from 'next/navigation';
import { useRef, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION CONSTANTS
// ═══════════════════════════════════════════════════════════

const DEFAULT_DEDUPING_INTERVAL = 60000; // 60 seconds (1 minute)
const ADMIN_DEDUPING_INTERVAL = 5000;     // 5 seconds for admin pages
const HEAVY_HOOK_DEDUPING_INTERVAL_MIN = 300000;  // 5 minutes
const HEAVY_HOOK_DEDUPING_INTERVAL_MAX = 600000;  // 10 minutes

// ═══════════════════════════════════════════════════════════
// DEBUG MODE
// ═══════════════════════════════════════════════════════════

const DEBUG_MODE = process.env.NEXT_PUBLIC_SWR_DEBUG === 'true';
const SAFETY_MODE = process.env.NEXT_PUBLIC_SWR_SAFETY_DEBUG === 'true';

/**
 * Debug logger for SWR operations
 */
function swrDebugLog(key, trigger, isCacheHit, extra = {}) {
  if (!DEBUG_MODE) return;

  const timestamp = new Date().toISOString();
  const logData = {
    key,
    timestamp,
    trigger,
    cacheStatus: isCacheHit ? 'HIT' : 'FETCH',
    ...extra
  };

  console.log(`[SWR DEBUG]`, logData);
}

// ═══════════════════════════════════════════════════════════
// DUPLICATE KEY SAFEGUARD
// ═══════════════════════════════════════════════════════════

// Global tracking of keys per render tick (debug only)
const usedKeysInTick = new Set();
let resetScheduled = false;

/**
 * Checks if a key has been used in the current render cycle
 * @param {string} key - SWR key
 * @returns {boolean} - true if duplicate
 */
export function checkDuplicateSWRKey(key) {
  if (!SAFETY_MODE || !key) return false;

  // Track duplicates only within the same microtask tick to avoid
  // false positives caused by React re-renders/StrictMode double render.
  if (!resetScheduled) {
    resetScheduled = true;
    queueMicrotask(() => {
      usedKeysInTick.clear();
      resetScheduled = false;
    });
  }

  if (usedKeysInTick.has(key)) {
    const stack = typeof window !== 'undefined' ? new Error().stack?.split('\n').slice(2, 5).join(' | ') : '';
    console.warn(`[SWR SAFETY] Duplicate key detected in same render: "${key}"`, stack);
    console.warn(`[SWR SAFETY] Consider combining these hooks or using different keys`);
    return true;
  }
  usedKeysInTick.add(key);
  return false;
}

/**
 * Resets the key tracking for a new render cycle
 * Call this at the start of each render
 */
export function resetSWRKeyTracking() {
  usedKeysInTick.clear();
  resetScheduled = false;
}

// ═══════════════════════════════════════════════════════════
// HOOK-LEVEL OVERRIDE SYSTEM
// ═══════════════════════════════════════════════════════════

/**
 * Hook-level configuration overrides
 * Each hook can specify custom dedupingInterval and revalidateOnFocus
 */
export const HOOK_OVERRIDES = {
  // Heavy hooks - long deduping intervals (5-10 minutes)
  'settings/siteSettings': { dedupingInterval: 300000 },           // 5 min
  'homepage-reviews': { dedupingInterval: 300000 },                // 5 min
  'homepage-products-sections': { dedupingInterval: 600000 },      // 10 min
  'paginated-products': { dedupingInterval: 600000 },              // 10 min
  'related-': { dedupingInterval: 600000 },                          // 10 min (prefix match)
  'reviews-': { dedupingInterval: 600000 },                        // 10 min (prefix match)
  'product-': { dedupingInterval: 60000 },                       // 1 min (can be refreshed)
};

/**
 * Gets hook-level override configuration
 * @param {string} key - SWR key
 * @returns {object} - Override config or empty object
 */
export function getHookOverride(key) {
  if (!key) return {};

  // Exact match
  if (HOOK_OVERRIDES[key]) {
    return HOOK_OVERRIDES[key];
  }

  // Prefix match
  for (const [prefix, config] of Object.entries(HOOK_OVERRIDES)) {
    if (prefix.endsWith('-') && key.startsWith(prefix)) {
      return config;
    }
  }

  return {};
}

// ═══════════════════════════════════════════════════════════
// CUSTOM SWR CONFIGURATION
// ═══════════════════════════════════════════════════════════

/**
 * Custom fetcher wrapper with debug logging
 */
function createDebugFetcher(baseFetcher) {
  return async (key, ...args) => {
    const startTime = performance.now();

    try {
      // Check for duplicate keys
      checkDuplicateSWRKey(typeof key === 'string' ? key : JSON.stringify(key));

      const result = await baseFetcher(key, ...args);

      if (DEBUG_MODE) {
        const duration = performance.now() - startTime;
        swrDebugLog(key, 'fetch', false, { duration: `${duration.toFixed(2)}ms` });
      }

      return result;
    } catch (error) {
      if (DEBUG_MODE) {
        swrDebugLog(key, 'fetch-error', false, { error: error.message });
      }
      throw error;
    }
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN SWR PROVIDER
// ═══════════════════════════════════════════════════════════

export const SWRProvider = ({ children }) => {
  const pathname = usePathname();

  // Detect if we're in admin section
  const isAdminPage = pathname?.startsWith('/admin') || false;

  // Reset when route changes only (not every render)
  useEffect(() => {
    resetSWRKeyTracking();
  }, [pathname]);

  // Base configuration
  const baseConfig = {
    // Global defaults
    dedupingInterval: isAdminPage ? ADMIN_DEDUPING_INTERVAL : DEFAULT_DEDUPING_INTERVAL,
    revalidateOnFocus: isAdminPage, // Only true for admin pages
    revalidateOnReconnect: isAdminPage,
    shouldRetryOnError: false,      // Disable retry loops
    keepPreviousData: true,         // Keep old data while fetching
    errorRetryCount: 0,             // No automatic retries

    // Provider for global state management
    provider: () => new Map(),

    // Global onError handler
    onError: (error, key) => {
      if (DEBUG_MODE) {
        console.error(`[SWR ERROR] Key: ${key}`, error);
      }
    },

    // Global onSuccess handler for debug
    onSuccess: (data, key, config) => {
      if (DEBUG_MODE) {
        swrDebugLog(key, 'success', true, { dataSize: JSON.stringify(data).length });
      }
    },

    // Apply hook-level overrides
    use: [
      (useSWRNext) => (key, fetcher, config) => {
        const hookOverride = getHookOverride(typeof key === 'string' ? key : '');

        // Merge configurations: global < hook-override < inline-config
        const mergedConfig = {
          ...config,
          ...hookOverride,
          // Allow inline config to override hook overrides
          ...(config?.dedupingInterval !== undefined && { dedupingInterval: config.dedupingInterval }),
          ...(config?.revalidateOnFocus !== undefined && { revalidateOnFocus: config.revalidateOnFocus }),
        };

        // Wrap fetcher with debug logging if in debug mode
        const wrappedFetcher = DEBUG_MODE && fetcher
          ? createDebugFetcher(fetcher)
          : fetcher;

        // Reset key tracking before each SWR hook call
        if (typeof window !== 'undefined' && SAFETY_MODE) {
          checkDuplicateSWRKey(typeof key === 'string' ? key : JSON.stringify(key));
        }

        return useSWRNext(key, wrappedFetcher, mergedConfig);
      }
    ]
  };

  // Admin-specific logging
  if (DEBUG_MODE && isAdminPage) {
    console.log('[SWR CONFIG] Admin mode detected - using shorter deduping interval:', ADMIN_DEDUPING_INTERVAL);
  }

  return (
    <SWRConfig value={baseConfig}>
      {children}
    </SWRConfig>
  );
};

// ═══════════════════════════════════════════════════════════
// UTILITY EXPORTS FOR HOOKS
// ═══════════════════════════════════════════════════════════

/**
 * Helper to create SWR config for heavy data hooks
 * @param {number} minutes - Cache duration in minutes (5-10)
 * @returns {SWRConfiguration}
 */
export function createHeavyHookConfig(minutes = 5) {
  const clampedMinutes = Math.min(Math.max(minutes, 5), 10);
  return {
    dedupingInterval: clampedMinutes * 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  };
}

/**
 * Helper to create SWR config for real-time hooks
 * @returns {SWRConfiguration}
 */
export function createRealtimeHookConfig() {
  return {
    dedupingInterval: 5000, // 5 seconds
    revalidateOnFocus: true,
    refreshInterval: 30000,   // Auto-refresh every 30 seconds
  };
}

/**
 * Helper to create SWR config for admin hooks
 * @returns {SWRConfiguration}
 */
export function createAdminHookConfig() {
  return {
    dedupingInterval: 5000,  // 5 seconds
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  };
}
