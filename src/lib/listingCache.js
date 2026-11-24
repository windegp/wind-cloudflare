// Cached product listings (category first page, related-by-collection).
//
// Both are Firestore reads that every visitor used to repeat. They are now computed once on the
// server, cached in KV, and cleared by /api/revalidate on every admin product change.
// The queries below are the same ones the browser used to run, so the same products come back.

import { collection, query, where, getDocs, limit, orderBy, startAfter, doc, getDoc } from "firebase/firestore/lite";
import { isProductHiddenFromListings } from "@/lib/inventoryHelpers";

export const CATEGORY_PAGE_SIZE = 12;
export const RELATED_QUERY_LIMIT = 6;
// Backstop only. Admin changes clear these keys immediately. A longer backstop keeps KV
// writes low: a 10 minute TTL would rewrite every hot key 144 times a day against a free
// limit of 1,000 writes a day.
export const LISTING_TTL_SECONDS = 6 * 60 * 60;

// Category slugs that use other queries on the client keep their existing path.
const SPECIAL_SLUGS = new Set(["top-rated-all-time", "top-rated-weekly", "most-liked-all-time", "most-liked-weekly"]);
const SAFE_VALUE = /^[^\s\\?#]{1,100}$/;

export const categoryPageKey = (slug) => `catpage_${slug}`;
export const relatedKey = (value) => `relcol_${value}`;

export function isCacheableCategorySlug(slug) {
  return typeof slug === "string" && SAFE_VALUE.test(slug) && !slug.includes("/") && !SPECIAL_SLUGS.has(slug);
}
export function isSafeCollectionValue(value) {
  return typeof value === "string" && SAFE_VALUE.test(value);
}

// KV and JSON cannot hold Firestore Timestamps: convert them to ISO strings.
export function serializeData(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (typeof obj.toDate === "function") return obj.toDate().toISOString();
  if (Array.isArray(obj)) return obj.map(serializeData);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = serializeData(obj[k]);
  return out;
}

/** Same loop as usePaginatedProducts: first page, skipping hidden products, with the cursor doc id. */
export async function fetchCategoryFirstPage(db, slug, limitCount = CATEGORY_PAGE_SIZE) {
  const productsRef = collection(db, "products");
  const products = [];
  let cursor = null;
  let hasMore = false;

  while (products.length < limitCount) {
    const remaining = limitCount - products.length;
    const constraints = [
      where("categories", "array-contains-any", [slug, `/${slug}`]),
      orderBy("createdAt", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(remaining),
    ];
    const snap = await getDocs(query(productsRef, ...constraints));
    if (snap.empty) { hasMore = false; break; }
    cursor = snap.docs[snap.docs.length - 1];
    products.push(
      ...snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => !isProductHiddenFromListings(p.variants))
    );
    hasMore = snap.docs.length === remaining;
    if (snap.docs.length < remaining) { hasMore = false; break; }
  }

  return serializeData({ products, lastDocId: cursor ? cursor.id : null, hasMore });
}

/** Same query as useRelatedProducts step 2: up to 6 products in the collection (own product and hidden ones are removed by the client). */
export async function fetchRelatedByCollection(db, value) {
  const snap = await getDocs(
    query(collection(db, "products"), where("collections", "array-contains", value), limit(RELATED_QUERY_LIMIT))
  );
  return serializeData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/** Cache keys to clear when a product changes: its old and new collections, with and without a leading slash. */
export function listingKeysForCollections(values) {
  const keys = new Set();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const plain = raw.trim().replace(/^\/+/, "");
    if (!plain) continue;
    keys.add(categoryPageKey(plain));
    keys.add(relatedKey(plain));
    keys.add(relatedKey(`/${plain}`));
  }
  return [...keys];
}

/** Collections a product belongs to, from a product document or its cached copy. */
export function collectionsOf(product) {
  if (!product) return [];
  const out = [];
  for (const f of ["collections", "categories"]) if (Array.isArray(product[f])) out.push(...product[f]);
  if (typeof product.category === "string") out.push(product.category);
  return out.filter((v) => typeof v === "string");
}

export async function readProductCollectionsFromFirestore(db, id) {
  const snap = await getDoc(doc(db, "products", String(id)));
  return snap.exists() ? collectionsOf(snap.data()) : [];
}
