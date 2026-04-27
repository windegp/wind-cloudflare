import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const handlesParam = searchParams.get('handles');

  if (!handlesParam) {
    return Response.json({ error: 'handles required' }, { status: 400 });
  }

  const handles = handlesParam.split(',').filter(Boolean);
  if (handles.length === 0) {
    return Response.json({ stats: {} });
  }

  // Limit to 30 handles max to prevent abuse
  const limitedHandles = handles.slice(0, 30);
  const statsMap = {};

  try {
    const db = getDb();
    
    // Check KV cache first for each handle
    const cacheChecks = await Promise.all(
      limitedHandles.map(async (handle) => {
        const cacheKey = `product_stats_${handle}`;
        const cached = await kvGet(cacheKey);
        return { handle, cached };
      })
    );

    const cacheHits = cacheChecks.filter(c => c.cached);
    const cacheMisses = cacheChecks.filter(c => !c.cached);

    // Add cache hits to result
    cacheHits.forEach(({ handle, cached }) => {
      statsMap[handle] = cached;
    });

    // Fetch missing stats from Firebase in parallel
    if (cacheMisses.length > 0) {
      const firebaseFetches = await Promise.all(
        cacheMisses.map(async ({ handle }) => {
          try {
            const statsSnap = await getDoc(doc(db, "ProductStats", handle));
            
            if (statsSnap.exists()) {
              const data = statsSnap.data();
              const total = data.totalCount || 0;
              const avg = total > 0 ? parseFloat((data.totalRatingSum / total).toFixed(1)) : 5;
              const result = { count: total, rating: avg, handle };
              
              // Store in KV for next time
              await kvSet(`product_stats_${handle}`, result);
              return { handle, result };
            } else {
              // No stats found - return defaults
              const result = { count: 0, rating: 5, handle };
              await kvSet(`product_stats_${handle}`, result);
              return { handle, result };
            }
          } catch (e) {
            return { handle, result: { count: 0, rating: 5, handle } };
          }
        })
      );

      firebaseFetches.forEach(({ handle, result }) => {
        statsMap[handle] = result;
      });
    }

    return Response.json({ 
      stats: statsMap,
      meta: {
        requested: limitedHandles.length,
        cacheHits: cacheHits.length,
        fetched: cacheMisses.length
      }
    }, { 
      headers: { 
        'X-Cache': cacheMisses.length === 0 ? 'HIT' : 'MIX',
        'X-Cache-Hits': String(cacheHits.length)
      } 
    });

  } catch (error) {
    return Response.json({ 
      error: error.message, 
      stats: {} 
    }, { status: 500 });
  }
}
