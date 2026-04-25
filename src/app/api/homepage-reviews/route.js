// homepage-reviews/route.js - مع TTL (300s) و KV-first pattern
import { getDb } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, documentId } from "firebase/firestore/lite";
import { kvFirstFetch, TTL, getStaleThresholdForKey } from '@/lib/kv-cache';

export const revalidate = 300;
const CACHE_KEY = 'homepage_reviews_v2'; // v2 for TTL support

export async function GET() {
  // KV-first fetch with stale-while-revalidate (TTL: 300s, Stale: 600s)
  const result = await kvFirstFetch(
    CACHE_KEY,
    async () => fetchHomepageReviews(),
    TTL.HOMEPAGE_DATA, // Same TTL as homepage_data since they're related
    getStaleThresholdForKey(CACHE_KEY),
    'medium' // Medium priority
  );

  // Log cache status
  const isHit = result.source === 'cache' || result.source === 'cache-stale';
  console.log(`[KV ${isHit ? 'HIT' : 'MISS'}] homepage_reviews: ${result.source}${result.isStale ? ' (stale)' : ''}`);

  // Return data with cache headers
  return Response.json(
    result.data,
    { 
      headers: { 
        'Cache-Control': `public, s-maxage=${TTL.HOMEPAGE_DATA}, stale-while-revalidate=${getStaleThresholdForKey(CACHE_KEY) - TTL.HOMEPAGE_DATA}`,
        'X-Cache': result.isStale ? 'HIT-STALE' : (isHit ? 'HIT' : 'MISS'),
        'X-Cache-TTL': String(TTL.HOMEPAGE_DATA),
        'X-Cache-Source': result.source,
        'X-Cache-Reason': result.isStale ? 'kv-stale-served-background-refresh' : (isHit ? 'kv-fresh-hit' : 'kv-empty-or-expired')
      } 
    }
  );
}

/**
 * Fetches homepage reviews from Firestore
 */
async function fetchHomepageReviews() {
  const startedAt = Date.now();
  const db = getDb();
  
  const qReviews = query(
    collection(db, "Reviews"),
    where("status", "==", "published"),
    orderBy("date", "desc"),
    limit(10)
  );
  
  const snapReviews = await getDocs(qReviews);
  const fetchedReviews = snapReviews.docs.map(d => ({ id: d.id, ...d.data() }));

  if (fetchedReviews.length === 0) {
    return { reviews: [], products: {} };
  }

  const uniqueHandles = [...new Set(
    fetchedReviews.map(r => r.productHandle).filter(Boolean)
  )].slice(0, 10);

  const productsMap = {};
  if (uniqueHandles.length > 0) {
    const qProducts = query(
      collection(db, "products"),
      where(documentId(), "in", uniqueHandles)
    );
    const snapProducts = await getDocs(qProducts);
    snapProducts.docs.forEach(d => {
      const pData = d.data();
      const h = pData.handle || d.id;
      productsMap[h] = { ...pData, id: d.id, mainImage: pData.images?.[0] || pData.image || "" };
    });
  }

  const durationMs = Date.now() - startedAt;
  if (durationMs > 400) {
    console.warn(`[Firestore Slow Query] homepage_reviews_v2 took ${durationMs}ms`);
  }

  return { reviews: fetchedReviews, products: productsMap };
}
