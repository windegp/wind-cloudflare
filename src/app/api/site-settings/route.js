// site-settings/route.js - مع TTL محدد (300s) و KV-first pattern
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvFirstFetch, TTL, getStaleThresholdForKey } from '@/lib/kv-cache';

export const revalidate = 300;
const CACHE_KEY = 'site_settings_v2'; // v2 for TTL support

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const isFreshRequested = searchParams.get('fresh') === 'true';

  // If fresh data requested, bypass cache
  if (isFreshRequested) {
    console.log('[KV SKIP] site_settings: fresh data requested');
    const data = await fetchSiteSettings();
    return Response.json(
      { success: true, source: 'firebase', data, fresh: true },
      { headers: { 'X-Cache': 'BYPASS', 'X-Cache-TTL': String(TTL.SITE_SETTINGS) } }
    );
  }

  // KV-first fetch with stale-while-revalidate (TTL: 300s, Stale: 600s)
  const result = await kvFirstFetch(
    CACHE_KEY,
    async () => fetchSiteSettings(),
    TTL.SITE_SETTINGS,
    getStaleThresholdForKey(CACHE_KEY),
    'medium' // Medium priority - settings change occasionally
  );

  // Log cache status
  const isHit = result.source === 'cache' || result.source === 'cache-stale';
  console.log(`[KV ${isHit ? 'HIT' : 'MISS'}] site_settings: ${result.source}${result.isStale ? ' (stale)' : ''}`);

  // Return data with cache headers
  return Response.json(
    { 
      success: true, 
      source: result.source, 
      data: result.data,
      isStale: result.isStale 
    },
    { 
      headers: { 
        'Cache-Control': `public, s-maxage=${TTL.SITE_SETTINGS}, stale-while-revalidate=${getStaleThresholdForKey(CACHE_KEY) - TTL.SITE_SETTINGS}`,
        'X-Cache': result.isStale ? 'HIT-STALE' : (isHit ? 'HIT' : 'MISS'),
        'X-Cache-TTL': String(TTL.SITE_SETTINGS),
        'X-Cache-Source': result.source,
        'X-Cache-Reason': result.isStale ? 'kv-stale-served-background-refresh' : (isHit ? 'kv-fresh-hit' : 'kv-empty-or-expired')
      } 
    }
  );
}

/**
 * Fetches site settings from Firestore
 */
async function fetchSiteSettings() {
  const startedAt = Date.now();
  const db = getDb();
  const snap = await getDoc(doc(db, "settings", "siteSettings"));

  if (!snap.exists()) {
    const error = new Error('Settings not found');
    error.status = 404;
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  if (durationMs > 300) {
    console.warn(`[Firestore Slow Query] site_settings_v2 took ${durationMs}ms`);
  }

  return snap.data();
}
