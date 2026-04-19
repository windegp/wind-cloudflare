import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  if (!handle) {
    return Response.json({ error: 'handle required' }, { status: 400 });
  }

  const cacheKey = `product_stats_${handle}`;
  const kv = await getKV();

  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return Response.json(JSON.parse(cached), { headers: { 'X-Cache': 'HIT' } });
      }
    } catch {}
  }

  try {
    const db = getDb();
    const statsRef = doc(db, "ProductStats", handle);
    const statsSnap = await getDoc(statsRef);

    if (statsSnap.exists()) {
      const data = statsSnap.data();
      const total = data.totalCount || 0;
      const avg = total > 0 ? parseFloat((data.totalRatingSum / total).toFixed(1)) : 5;
      const result = { count: total, rating: avg, handle };

      if (kv) {
        try { await kv.put(cacheKey, JSON.stringify(result)); } catch {}
      }

      return Response.json(result, { headers: { 'X-Cache': 'MISS' } });
    }
    return Response.json({ count: 0, rating: 5, handle });

  } catch (error) {
    return Response.json({ error: error.message, count: 0, rating: 5 }, { status: 500 });
  }
}