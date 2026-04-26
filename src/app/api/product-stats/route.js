import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  if (!handle) {
    return Response.json({ error: 'handle required' }, { status: 400 });
  }

  const cacheKey = `product_stats_${handle}`;

  // 1. جرب KV أولاً
  const cached = await kvGet(cacheKey);
  if (cached) {
    return Response.json(cached, { headers: { 'X-Cache': 'HIT' } });
  }

  // 2. جيب من Firebase
  try {
    const db = getDb();
    const statsSnap = await getDoc(doc(db, "ProductStats", handle));

    if (!statsSnap.exists()) {
      return Response.json({ count: 0, rating: 5, handle });
    }

    const data = statsSnap.data();
    const total = data.totalCount || 0;
    const avg = total > 0 ? parseFloat((data.totalRatingSum / total).toFixed(1)) : 5;
    const result = { count: total, rating: avg, handle };

    // ✅ Bug Fix: kv.put كانت جوا block ناقص
    await kvSet(cacheKey, result);

    return Response.json(result, { headers: { 'X-Cache': 'MISS' } });

  } catch (error) {
    return Response.json({ error: error.message, count: 0, rating: 5 }, { status: 500 });
  }
}