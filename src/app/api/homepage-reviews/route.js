import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, documentId } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';
const CACHE_KEY = 'homepage_reviews_v1';

async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch { return null; }
}

export async function GET() {
  const kv = await getKV();

  // 1. حاول من KV
  if (kv) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) {
        return Response.json(JSON.parse(cached), {
          headers: { 'X-Cache': 'HIT' }
        });
      }
    } catch {}
  }

  // 2. Firebase
  try {
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
      return Response.json({ reviews: [], products: {} });
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

    const result = { reviews: fetchedReviews, products: productsMap };

    // 3. خزّن في KV
    if (kv) {
      try { await kv.put(CACHE_KEY, JSON.stringify(result)); } catch {}
    }

    return Response.json(result, { headers: { 'X-Cache': 'MISS' } });
  } catch (error) {
    return Response.json({ reviews: [], products: {} }, { status: 500 });
  }
}