// product/[id]/route.js - مع TTL محدد (120s) و KV-first pattern
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvFirstFetch, TTL, getStaleThresholdForKey } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const cacheKey = `product_${id}_v2`; // v2 for TTL support

  // KV-first fetch with stale-while-revalidate (TTL: 120s, Stale: 240s)
  const result = await kvFirstFetch(
    cacheKey,
    async () => fetchProduct(id),
    TTL.PRODUCT,
    getStaleThresholdForKey(cacheKey),
    'high' // High priority - products change frequently
  );

  // Log cache status
  const isHit = result.source === 'cache' || result.source === 'cache-stale';
  console.log(`[KV ${isHit ? 'HIT' : 'MISS'}] product_${id}: ${result.source}${result.isStale ? ' (stale)' : ''}`);

  // Return data (cached, stale, or fresh)
  return Response.json(
    result.data,
    { 
      headers: { 
        'X-Cache': result.isStale ? 'HIT-STALE' : (isHit ? 'HIT' : 'MISS'),
        'X-Cache-TTL': String(TTL.PRODUCT),
        'X-Cache-Source': result.source
      } 
    }
  );
}

/**
 * Fetches product from Firestore
 */
async function fetchProduct(id) {
  const db = getDb();
  const snap = await getDoc(doc(db, "products", id));
  
  if (!snap.exists()) {
    const error = new Error('Product not found');
    error.status = 404;
    throw error;
  }

  const data = snap.data();
  
  // تحويل Timestamps لـ strings (Firebase requirement)
  if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
  if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();

  return { id: snap.id, ...data };
}