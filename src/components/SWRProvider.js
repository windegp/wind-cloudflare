"use client";
import { SWRConfig } from 'swr';
import { usePathname } from 'next/navigation';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION CONSTANTS
// ═══════════════════════════════════════════════════════════

const DEFAULT_DEDUPING_INTERVAL = 60000; // 60 seconds (1 minute)
const ADMIN_DEDUPING_INTERVAL = 5000; // 5 seconds for admin pages
const HEAVY_HOOK_DEDUPING_INTERVAL_MIN = 300000; // 5 minutes
const HEAVY_HOOK_DEDUPING_INTERVAL_MAX = 600000; // 10 minutes

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEBUG_MODE = IS_DEV || process.env.NEXT_PUBLIC_SWR_DEBUG === 'true';
const SAFETY_MODE = IS_DEV || process.env.NEXT_PUBLIC_SWR_SAFETY_DEBUG === 'true';

// Single shared cache for entire app (public + admin in one cache space)
// Isolation is by namespaced keys, not separate cache instances.
const GLOBAL_SWR_CACHE = new Map();

// Persistent key registry to detect real ownership conflicts.
// key => { namespace, owners: Map(owner -> { route, lastSeen }), lastSeen }
const keyRegistry = new Map();
const REGISTRY_TTL_MS = 15 * 60 * 1000;

function serializeKey(key) {
  if (key === null || key === undefined) return null;
  if (typeof key === 'string') return key;
  if (Array.isArray(key)) return JSON.stringify(key);
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

function extractNamespaceFromKey(serializedKey, fallbackNamespace = 'public') {
  if (!serializedKey) return fallbackNamespace;
  if (serializedKey.startsWith('admin:')) return 'admin';
  if (serializedKey.startsWith('public:')) return 'public';
  if (serializedKey.includes('__ns:admin')) return 'admin';
  if (serializedKey.includes('__ns:public')) return 'public';
  return fallbackNamespace;
}

function scopeKeyForNamespace(key, namespace) {
  if (key === null || key === undefined) return key;

  if (Array.isArray(key)) {
    const marker = `__ns:${namespace}`;
    const lastPart = key[key.length - 1];
    if (typeof lastPart === 'string' && lastPart.startsWith('__ns:')) return key;
    return [...key, marker];
  }

  const serialized = serializeKey(key);
  if (!serialized) return key;
  if (serialized.startsWith('admin:') || serialized.startsWith('public:')) return key;
  return `${namespace}:${serialized}`;
}

function cleanupRegistry(now = Date.now()) {
  for (const [key, entry] of keyRegistry.entries()) {
    if (now - entry.lastSeen > REGISTRY_TTL_MS) {
      keyRegistry.delete(key);
    }
  }
}

function swrTraceLog(payload) {
  if (!DEBUG_MODE) return;
  console.log('[SWR TRACE]', {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

/**
 * Persistent duplicate key guard (namespace + key + owner + route).
 * This avoids StrictMode false positives caused by render-cycle tracking.
 */
export function checkDuplicateSWRKey({ key, owner = 'unknown-owner', route = 'unknown-route', namespace = 'public' }) {
  if (!SAFETY_MODE || !key) return false;

  const now = Date.now();
  cleanupRegistry(now);

  const existing = keyRegistry.get(key) || {
    namespace,
    owners: new Map(),
    lastSeen: now,
  };

  existing.lastSeen = now;
  existing.namespace = namespace;

  const ownerRecord = existing.owners.get(owner);
  if (!ownerRecord) {
    const conflictingOwners = Array.from(existing.owners.keys()).filter((trackedOwner) => trackedOwner !== owner);
    if (conflictingOwners.length > 0) {
      const stack = typeof window !== 'undefined' ? new Error().stack?.split('\n').slice(2, 7).join(' | ') : '';
      console.warn(`[SWR SAFETY] Duplicate key detected with different owners: "${key}"`, stack);
      console.warn(`[SWR SAFETY] namespace="${namespace}" route="${route}" ownerB="${owner}"`);
      console.warn(`[SWR SAFETY] ownerA list="${conflictingOwners.join(', ')}"`);
      console.warn('[SWR SAFETY] Consider combining these hooks or using different keys');
    }
  }

  existing.owners.set(owner, { route, lastSeen: now });
  keyRegistry.set(key, existing);

  return false;
}

/**
 * Reset registry manually (kept for diagnostics tooling/tests).
 */
export function resetSWRKeyTracking() {
  keyRegistry.clear();
}

// ═══════════════════════════════════════════════════════════
// HOOK-LEVEL OVERRIDE SYSTEM
// ═══════════════════════════════════════════════════════════

export const HOOK_OVERRIDES = {
  // Heavy hooks - long deduping intervals (5-10 minutes)
  'settings/siteSettings': { dedupingInterval: 300000 }, // 5 min
  'homepage-reviews': { dedupingInterval: 300000 }, // 5 min
  'homepage-products-sections': { dedupingInterval: 600000 }, // 10 min
  'paginated-products': { dedupingInterval: 600000 }, // 10 min
  'related-': { dedupingInterval: 600000 }, // 10 min (prefix match)
  'reviews-': { dedupingInterval: 600000 }, // 10 min (prefix match)
  'product-': { dedupingInterval: 60000 }, // 1 min
};

function normalizeKeyForOverride(key) {
  if (!key) return '';
  if (key.startsWith('admin:')) return key.slice('admin:'.length);
  if (key.startsWith('public:')) return key.slice('public:'.length);
  return key;
}

export function getHookOverride(key) {
  if (!key) return {};

  const normalizedKey = normalizeKeyForOverride(key);

  // Exact match
  if (HOOK_OVERRIDES[normalizedKey]) {
    return HOOK_OVERRIDES[normalizedKey];
  }

  // Prefix match
  for (const [prefix, config] of Object.entries(HOOK_OVERRIDES)) {
    if (prefix.endsWith('-') && normalizedKey.startsWith(prefix)) {
      return config;
    }
  }

  return {};
}

function createDebugFetcher(baseFetcher, traceContext) {
  return async (key, ...args) => {
    const startTime = performance.now();

    try {
      const result = await baseFetcher(key, ...args);
      const duration = performance.now() - startTime;

      swrTraceLog({
        event: 'fetch-success',
        key: traceContext.key,
        namespace: traceContext.namespace,
        owner: traceContext.owner,
        route: traceContext.route,
        cacheStatus: 'MISS/FETCH',
        fetchDurationMs: Number(duration.toFixed(2)),
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      swrTraceLog({
        event: 'fetch-error',
        key: traceContext.key,
        namespace: traceContext.namespace,
        owner: traceContext.owner,
        route: traceContext.route,
        cacheStatus: 'MISS/FETCH',
        fetchDurationMs: Number(duration.toFixed(2)),
        error: error?.message || 'unknown-error',
      });
      throw error;
    }
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN SWR PROVIDER
// ═══════════════════════════════════════════════════════════

export const SWRProvider = ({ children }) => {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin') || false;
  const routeNamespace = isAdminPage ? 'admin' : 'public';

  const baseConfig = {
    // Global defaults
    dedupingInterval: isAdminPage ? ADMIN_DEDUPING_INTERVAL : DEFAULT_DEDUPING_INTERVAL,
    revalidateOnFocus: isAdminPage,
    revalidateOnReconnect: isAdminPage,
    shouldRetryOnError: false,
    keepPreviousData: true,
    errorRetryCount: 0,

    // Always use the same cache instance.
    provider: () => GLOBAL_SWR_CACHE,

    onError: (error, key, config) => {
      const owner = config?.meta?.owner || 'unknown-owner';
      const route = config?.meta?.route || pathname || 'unknown-route';
      const namespace = config?.meta?.namespace || extractNamespaceFromKey(key, routeNamespace);

      console.error('[SWR ERROR]', {
        key,
        namespace,
        owner,
        route,
        error: error?.message || error,
      });
    },

    onSuccess: (data, key, config) => {
      const owner = config?.meta?.owner || 'unknown-owner';
      const route = config?.meta?.route || pathname || 'unknown-route';
      const namespace = config?.meta?.namespace || extractNamespaceFromKey(key, routeNamespace);

      swrTraceLog({
        event: 'cache-hit-or-revalidate-success',
        key,
        namespace,
        owner,
        route,
        cacheStatus: GLOBAL_SWR_CACHE.has(key) ? 'HIT' : 'MISS',
        dataSize: data ? JSON.stringify(data).length : 0,
      });
    },

    use: [
      (useSWRNext) => (key, fetcher, config = {}) => {
        const scopedKey = scopeKeyForNamespace(key, routeNamespace);
        const serializedKey = serializeKey(scopedKey);
        const owner = config?.meta?.owner || 'unknown-owner';
        const route = config?.meta?.route || pathname || 'unknown-route';
        const namespace = config?.meta?.namespace || extractNamespaceFromKey(serializedKey, routeNamespace);

        if (serializedKey) {
          swrTraceLog({
            event: 'hook-register',
            key: serializedKey,
            namespace,
            owner,
            route,
            cacheStatus: GLOBAL_SWR_CACHE.has(serializedKey) ? 'HIT' : 'MISS',
          });

          checkDuplicateSWRKey({
            key: serializedKey,
            owner,
            route,
            namespace,
          });
        }

        const hookOverride = getHookOverride(typeof serializedKey === 'string' ? serializedKey : '');

        const mergedConfig = {
          ...config,
          ...hookOverride,
          ...(config?.dedupingInterval !== undefined && { dedupingInterval: config.dedupingInterval }),
          ...(config?.revalidateOnFocus !== undefined && { revalidateOnFocus: config.revalidateOnFocus }),
          meta: {
            ...(config?.meta || {}),
            owner,
            route,
            namespace,
          },
        };

        // Duplicate checks are intentionally ONLY in middleware, never in fetcher wrapper.
        const wrappedFetcher = DEBUG_MODE && fetcher
          ? createDebugFetcher(fetcher, {
              key: serializedKey,
              owner,
              route,
              namespace,
            })
          : fetcher;

        return useSWRNext(scopedKey, wrappedFetcher, mergedConfig);
      },
    ],
  };

  return <SWRConfig value={baseConfig}>{children}</SWRConfig>;
};

// ═══════════════════════════════════════════════════════════
// UTILITY EXPORTS FOR HOOKS
// ═══════════════════════════════════════════════════════════

export function createHeavyHookConfig(minutes = 5) {
  const clampedMinutes = Math.min(Math.max(minutes, 5), 10);
  return {
    dedupingInterval: clampedMinutes * 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  };
}

export function createRealtimeHookConfig() {
  return {
    dedupingInterval: 5000,
    revalidateOnFocus: true,
    refreshInterval: 30000,
  };
}

export function createAdminHookConfig() {
  return {
    dedupingInterval: 5000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  };
}
