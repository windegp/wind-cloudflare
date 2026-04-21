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

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const cacheKey = `product_${id}`;
  const kv = await getKV();

  // 1. حاول من KV
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return Response.json(JSON.parse(cached), {
          headers: { 'X-Cache': 'HIT' }
        });
      }
    } catch {}
  }

  // 2. Firebase fallback
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return Response.json(null, { status: 404 });

    const data = snap.data();
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
    if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();

    const product = { id: snap.id, ...data };

    // 3. خزّن في KV
    if (kv) {
      try { await kv.put(cacheKey, JSON.stringify(product)); } catch {}
    }

    return Response.json(product, {
      headers: { 'X-Cache': 'MISS' }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}