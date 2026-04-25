// product-stats/route.js - مع TTL محدد (60s) و KV-first pattern
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvFirstFetch, TTL, getStaleThresholdForKey } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  if (!handle) {
    return Response.json({ error: 'handle required' }, { status: 400 });
  }

  const cacheKey = `product_stats_${handle}_v2`; // v2 for TTL support

  // 🚀 KV-first fetch with stale-while-revalidate (TTL: 60s, Stale: 120s)
  // Shortest TTL - stats change frequently with new reviews
  const result = await kvFirstFetch(
    cacheKey,
    async () => fetchProductStats(handle),
    TTL.PRODUCT_STATS,
    getStaleThresholdForKey(cacheKey),
    'high' // High priority - stats change frequently
  );

  // Log cache status
  const isHit = result.source === 'cache' || result.source === 'cache-stale';
  console.log(`[KV ${isHit ? 'HIT' : 'MISS'}] product_stats_${handle}: ${result.source}${result.isStale ? ' (stale)' : ''}`);

  // Return data with cache headers
  return Response.json(
    result.data,
    { 
      headers: { 
        'X-Cache': result.isStale ? 'HIT-STALE' : (isHit ? 'HIT' : 'MISS'),
        'X-Cache-TTL': String(TTL.PRODUCT_STATS),
        'X-Cache-Source': result.source
      } 
    }
  );
}

/**
 * Fetches product stats from Firestore
 */
async function fetchProductStats(handle) {
  const db = getDb();
  const statsSnap = await getDoc(doc(db, "ProductStats", handle));

  if (!statsSnap.exists()) {
    return { count: 0, rating: 5, handle };
  }

  const data = statsSnap.data();
  const total = data.totalCount || 0;
  const avg = total > 0 ? parseFloat((data.totalRatingSum / total).toFixed(1)) : 5;
  
  return { count: total, rating: avg, handle };
}