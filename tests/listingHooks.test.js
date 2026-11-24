import { beforeEach, expect, it, vi } from "vitest";
vi.mock("swr", () => ({ default: (key, fetcher) => ({ key, fetcher }) }));
vi.mock("@/lib/firebase", () => ({ getDb: () => ({}) }));
const fs = vi.hoisted(() => ({ calls: 0, docs: [] }));
vi.mock("firebase/firestore/lite", () => ({
  collection: () => ({}), doc: (_d, _n, id) => ({ id }), where: () => ({}), orderBy: () => ({}), limit: () => ({}), startAfter: () => ({}),
  query: () => ({}), getDoc: vi.fn(async () => ({ exists: () => false })), documentId: () => ({}),
  getDocs: vi.fn(async () => { fs.calls++; const d = fs.docs.map((p) => ({ id: p.id, data: () => ({ ...p }) })); return { empty: d.length === 0, docs: d, forEach: (f) => d.forEach(f) }; }),
}));
import { usePaginatedProducts, useRelatedProducts } from "@/hooks/useFirestore";

const urls = [];
const mockFetch = (map) => vi.stubGlobal("fetch", vi.fn(async (url) => {
  urls.push(String(url));
  for (const [prefix, res] of Object.entries(map)) if (String(url).startsWith(prefix)) return res;
  return { ok: false, json: async () => ({}) };
}));
const ok = (body) => ({ ok: true, json: async () => body });
beforeEach(() => { urls.length = 0; fs.calls = 0; fs.docs = []; });

it("category first page comes from the API, with stats merged and the cursor as a doc id", async () => {
  mockFetch({
    "/api/category-products": ok({ products: [{ id: "a", handle: "a" }, { id: "b", handle: "b" }], lastDocId: "b", hasMore: true }),
    "/api/product-stats-batch": ok({ stats: { a: { count: 3, rating: 4.5 } } }),
  });
  const { fetcher } = usePaginatedProducts("shawls", 12, null);
  const r = await fetcher();
  expect(fs.calls).toBe(0);
  expect(r.products.map((p) => p.id)).toEqual(["a", "b"]);
  expect(r.products[0]).toMatchObject({ reviewsCount: 3, rating: 4.5 });
  expect(r.lastDoc).toEqual({ id: "b" }); expect(r.hasMore).toBe(true);
});
it("falls back to the same Firestore query when the API is down", async () => {
  mockFetch({});
  fs.docs = [{ id: "z", handle: "z", variants: [] }];
  const r = await usePaginatedProducts("shawls", 12, null).fetcher();
  expect(fs.calls).toBeGreaterThan(0); expect(r.products.map((p) => p.id)).toEqual(["z"]);
});
it("later pages and other page sizes never use the cached first page", async () => {
  mockFetch({}); fs.docs = [];
  await usePaginatedProducts("shawls", 10, null).fetcher();
  await usePaginatedProducts("shawls", 12, { id: "x" }).fetcher();
  expect(urls.some((u) => u.startsWith("/api/category-products"))).toBe(false);
});
it("related products: own product and hidden ones removed, max 5, same as before", async () => {
  const list = [{ id: "me" }, ...Array.from({ length: 4 }, (_, i) => ({ id: `r${i}` })), { id: "hid", variants: [{ inventoryStatus: "SEASONAL" }] }, { id: "r5" }];
  mockFetch({ "/api/related-by-collection": ok({ products: list }) });
  const r = await useRelatedProducts({ id: "me", collections: ["shawls"] }).fetcher();
  expect(fs.calls).toBe(0); expect(r.map((p) => p.id)).toEqual(["r0", "r1", "r2", "r3", "r5"]);
});
it("related products fall back to Firestore when the API is down", async () => {
  mockFetch({}); fs.docs = [{ id: "r1" }];
  const r = await useRelatedProducts({ id: "me", collections: ["shawls"] }).fetcher();
  expect(fs.calls).toBeGreaterThan(0); expect(r.map((p) => p.id)).toEqual(["r1"]);
});
