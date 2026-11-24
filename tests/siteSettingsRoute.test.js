import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/kv-cache", () => ({ kvGet: vi.fn(), kvSet: vi.fn(async () => true) }));
vi.mock("@/lib/firebase", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("firebase/firestore/lite", () => ({ doc: vi.fn(), getDoc: vi.fn() }));
import { GET } from "@/app/api/site-settings/route";
import { kvGet, kvSet } from "@/lib/kv-cache";
import { getDoc } from "firebase/firestore/lite";

const settings = { inventory: { defaultLowStockThreshold: 5 }, promotions: { a: 1 }, counters: { visitors: 10 } };
const call = (q = "") => GET(new Request(`https://windeg.com/api/site-settings${q}`));
beforeEach(() => {
  vi.clearAllMocks();
  getDoc.mockResolvedValue({ exists: () => true, data: () => JSON.parse(JSON.stringify(settings)) });
});

it("visitor request served from KV without touching Firestore or writing", async () => {
  kvGet.mockResolvedValueOnce(settings);
  const res = await call();
  expect((await res.json()).source).toBe("cache");
  expect(getDoc).not.toHaveBeenCalled(); expect(kvSet).not.toHaveBeenCalled();
});
it("KV miss reads Firestore once and stores the result", async () => {
  kvGet.mockResolvedValueOnce(null);
  const body = await (await call()).json();
  expect(body.data).toEqual(settings); expect(kvSet).toHaveBeenCalledTimes(1);
});
it("fresh=true with unchanged data does not write to KV, and still returns fresh data", async () => {
  kvGet.mockResolvedValueOnce(JSON.parse(JSON.stringify(settings)));
  const body = await (await call("?fresh=true")).json();
  expect(getDoc).toHaveBeenCalledTimes(1); expect(body.data).toEqual(settings); expect(kvSet).not.toHaveBeenCalled();
});
it("fresh=true with changed data writes the new document to KV", async () => {
  kvGet.mockResolvedValueOnce({ ...settings, promotions: { a: 2 } });
  await call("?fresh=true");
  expect(kvSet).toHaveBeenCalledTimes(1); expect(kvSet.mock.calls[0][1]).toEqual(settings);
});
it("fresh=true with empty KV writes", async () => {
  kvGet.mockResolvedValueOnce(null);
  await call("?fresh=true"); expect(kvSet).toHaveBeenCalledTimes(1);
});
