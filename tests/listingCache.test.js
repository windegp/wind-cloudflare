import { beforeEach, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ kv: new Map(), deleted: [], sets: [], docs: {}, queryResults: [] }));
vi.mock("@/lib/kv-cache", () => ({
  kvGet: vi.fn(async (k) => st.kv.get(k) ?? null),
  kvSet: vi.fn(async (k, v, ttl) => { st.sets.push([k, ttl]); st.kv.set(k, v); return true; }),
  kvDeleteManyReport: vi.fn(async (keys) => { st.deleted.push(...keys); keys.forEach((k) => st.kv.delete(k)); return { ok: true, failed: [] }; }),
  getKV: vi.fn(async () => null),
}));
vi.mock("@/lib/firebase", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/verifyAdminIdToken", () => ({ verifyAdminPermission: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/apiGuards", () => ({ isSameOrigin: () => true, enforceRateLimit: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_d, n) => ({ n }), doc: (_d, n, id) => ({ id }),
  where: (...a) => ({ w: a }), orderBy: (...a) => ({ o: a }), limit: (n) => ({ l: n }), startAfter: (c) => ({ s: c }),
  query: (...c) => ({ c }),
  getDoc: vi.fn(async (r) => ({ exists: () => !!st.docs[r.id], data: () => st.docs[r.id], id: r.id })),
  getDocs: vi.fn(async () => {
    const docs = (st.queryResults.shift() || []).map((p) => ({ id: p.id, data: () => { const { id, ...rest } = p; return rest; } }));
    return { empty: docs.length === 0, docs, forEach: (f) => docs.forEach(f) };
  }),
}));

import { GET as categoryGET } from "@/app/api/category-products/route";
import { GET as relatedGET } from "@/app/api/related-by-collection/route";
import { POST as revalidatePOST } from "@/app/api/revalidate/route";
import { listingKeysForCollections, collectionsOf, serializeData } from "@/lib/listingCache";

const ts = (iso) => ({ toDate: () => new Date(iso) });
const prod = (id, extra = {}) => ({ id, handle: id, title: id, createdAt: ts("2026-11-01T00:00:00Z"), variants: [{ inventoryStatus: "IN_STOCK" }], ...extra });
const req = (url) => new Request(url);
const rev = (body) => revalidatePOST(new Request("https://windeg.com/api/revalidate", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => { st.kv.clear(); st.deleted = []; st.sets = []; st.docs = {}; st.queryResults = []; });

it("keys cover plain and slash forms, once", () => {
  expect(listingKeysForCollections(["shawls", "/shawls", "isdal"]).sort()).toEqual(
    ["catpage_isdal", "catpage_shawls", "relcol_/isdal", "relcol_/shawls", "relcol_isdal", "relcol_shawls"].sort());
  expect(collectionsOf({ collections: ["a"], categories: ["/b"], category: "c" })).toEqual(["a", "/b", "c"]);
  expect(serializeData({ a: ts("2026-11-01T00:00:00Z"), b: [{ c: ts("2026-11-02T00:00:00Z") }] })).toEqual({ a: "2026-11-01T00:00:00.000Z", b: [{ c: "2026-11-02T00:00:00.000Z" }] });
});

it("category first page: miss reads Firestore, stores with a TTL, hit does not read", async () => {
  st.queryResults = [[prod("p1"), prod("p2")]];
  const miss = await categoryGET(req("https://windeg.com/api/category-products?slug=shawls"));
  const body = await miss.json();
  expect(body.products.map((p) => p.id)).toEqual(["p1", "p2"]);
  expect(body.lastDocId).toBe("p2"); expect(body.hasMore).toBe(false);
  expect(body.products[0].createdAt).toBe("2026-11-01T00:00:00.000Z");
  expect(st.sets).toEqual([["catpage_shawls", 21600]]);
  const hit = await categoryGET(req("https://windeg.com/api/category-products?slug=shawls"));
  expect(hit.headers.get("X-Cache")).toBe("HIT"); expect(st.queryResults).toEqual([]);
});
it("hidden (seasonal) products are skipped and the page is filled like the browser query did", async () => {
  const hidden = prod("h", { variants: [{ inventoryStatus: "SEASONAL" }] });
  // 12 requested: first batch of 12 has 1 hidden, so a second batch fetches 1 more
  st.queryResults = [[...Array.from({ length: 11 }, (_, i) => prod(`p${i}`)), hidden], [prod("extra")]];
  const body = await (await categoryGET(req("https://windeg.com/api/category-products?slug=x"))).json();
  expect(body.products).toHaveLength(12); expect(body.products.at(-1).id).toBe("extra"); expect(body.lastDocId).toBe("extra");
});
it("empty results and bad slugs are not cached", async () => {
  expect((await categoryGET(req("https://windeg.com/api/category-products?slug=nope"))).status).toBe(200);
  expect(st.sets).toEqual([]);
  for (const s of ["", "a/b", "top-rated-weekly"]) expect((await categoryGET(req(`https://windeg.com/api/category-products?slug=${encodeURIComponent(s)}`))).status).toBe(400);
});
it("related: cached per collection value", async () => {
  st.queryResults = [[prod("a"), prod("b")]];
  const body = await (await relatedGET(req("https://windeg.com/api/related-by-collection?value=shawls"))).json();
  expect(body.products.map((p) => p.id)).toEqual(["a", "b"]); expect(st.sets).toEqual([["relcol_shawls", 21600]]);
  const hit = await relatedGET(req("https://windeg.com/api/related-by-collection?value=shawls"));
  expect(hit.headers.get("X-Cache")).toBe("HIT");
});

it("product save clears category and related caches for OLD and NEW collections, both slug forms", async () => {
  st.kv.set("product_p1", { id: "p1", collections: ["old-cat"], categories: ["old-cat"] });  // pre-edit cached copy
  st.docs.p1 = { collections: ["new-cat"], categories: ["new-cat"] };                       // saved version
  const res = await rev({ type: "product", id: "p1", handle: "p1" });
  expect((await res.json()).revalidated).toBe(true);
  for (const k of ["catpage_old-cat", "relcol_old-cat", "relcol_/old-cat", "catpage_new-cat", "relcol_new-cat", "relcol_/new-cat", "product_p1", "homepage_data_v1"]) expect(st.deleted).toContain(k);
});
it("product delete (document gone) still clears the collections found in its cached copy", async () => {
  st.kv.set("product_p9", { id: "p9", categories: ["/shawls"] });
  await rev({ type: "product", id: "p9" });
  expect(st.deleted).toContain("catpage_shawls"); expect(st.deleted).toContain("relcol_/shawls");
});
it("product save still works if reading the old or new collections fails", async () => {
  const res = await rev({ type: "product", id: "unknown" });
  expect((await res.json()).revalidated).toBe(true); expect(st.deleted).toContain("product_unknown");
});
it("collection revalidate also clears that collection's lists", async () => {
  await rev({ type: "collection", slug: "shawls" });
  expect(st.deleted).toEqual(expect.arrayContaining(["collection_shawls", "catpage_shawls", "relcol_shawls", "relcol_/shawls"]));
});
it("admin raw-key clears accept the new prefixes", async () => {
  const res = await rev({ keys: ["catpage_x", "relcol_/y"] });
  expect((await res.json()).revalidated).toBe(true);
});
