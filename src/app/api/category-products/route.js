import { getDb } from "@/lib/firebase";
import { kvGet, kvSet } from "@/lib/kv-cache";
import {
  isCacheableCategorySlug, categoryPageKey, fetchCategoryFirstPage, LISTING_TTL_SECONDS,
} from "@/lib/listingCache";

export const dynamic = "force-dynamic";

// First page (12 visible products) of a category, cached in KV. Cleared by /api/revalidate on product changes.
export async function GET(request) {
  const slug = new URL(request.url).searchParams.get("slug") || "";
  if (!isCacheableCategorySlug(slug)) return Response.json({ error: "invalid slug" }, { status: 400 });

  const key = categoryPageKey(slug);
  const cached = await kvGet(key);
  if (cached) return Response.json(cached, { headers: { "X-Cache": "HIT" } });

  try {
    const data = await fetchCategoryFirstPage(getDb(), slug);
    // Empty results are not cached, so unknown slugs cannot fill KV.
    if (data.products.length > 0) await kvSet(key, data, LISTING_TTL_SECONDS);
    return Response.json(data, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
