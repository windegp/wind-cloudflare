import { getDb } from "@/lib/firebase";
import { kvGet, kvSet } from "@/lib/kv-cache";
import {
  isSafeCollectionValue, relatedKey, fetchRelatedByCollection, LISTING_TTL_SECONDS,
} from "@/lib/listingCache";

export const dynamic = "force-dynamic";

// Up to 6 products of a collection (used for "related products"), cached in KV.
export async function GET(request) {
  const value = new URL(request.url).searchParams.get("value") || "";
  if (!isSafeCollectionValue(value)) return Response.json({ error: "invalid value" }, { status: 400 });

  const key = relatedKey(value);
  const cached = await kvGet(key);
  if (cached) return Response.json({ products: cached }, { headers: { "X-Cache": "HIT" } });

  try {
    const products = await fetchRelatedByCollection(getDb(), value);
    if (products.length > 0) await kvSet(key, products, LISTING_TTL_SECONDS);
    return Response.json({ products }, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
