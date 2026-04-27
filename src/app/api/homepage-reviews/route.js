import { getDb } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, documentId } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
const CACHE_KEY = 'homepage_reviews_v1';

export async function GET() {
  // 1. جرب KV أولاً
  const cached = await kvGet(CACHE_KEY);
  if (cached) {
    return Response.json(cached, { headers: { 'X-Cache': 'HIT' } });
  }

  // 2. جيب من Firebase
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

    // ✅ Bug Fix: result كانت مش معرّفة
    // 🔥 Filter out orphaned reviews (reviews for deleted products)
    const validReviews = fetchedReviews.filter(r => productsMap[r.productHandle]);
    const result = { reviews: validReviews, products: productsMap };

    // 3. خزّن في KV
    await kvSet(CACHE_KEY, result);

    return Response.json(result, { headers: { 'X-Cache': 'MISS' } });

  } catch (error) {
    return Response.json({ reviews: [], products: {} }, { status: 500 });
  }
}