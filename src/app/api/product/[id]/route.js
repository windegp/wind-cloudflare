// product/[id]/route.js - الكود الصح النهائي
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const cacheKey = `product_${id}`;

  // 1. جرب KV أولاً
  const cached = await kvGet(cacheKey);
  if (cached) {
    return Response.json(cached, { headers: { 'X-Cache': 'HIT' } });
  }

  // 2. Firebase fallback
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return Response.json(null, { status: 404 });

    const data = snap.data();
    // تحويل Timestamps لـ strings (Firebase requirement)
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
    if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();

    const product = { id: snap.id, ...data };

    // 3. خزّن في KV - الداتا خام بدون أي formatting ✅
    await kvSet(cacheKey, product);

    return Response.json(product, { headers: { 'X-Cache': 'MISS' } });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}