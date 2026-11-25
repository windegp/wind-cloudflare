import { describe, expect, it, vi, beforeEach } from "vitest";
const h = vi.hoisted(() => ({ kv: null }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { WIND_KV: h.kv } }) }));
import { kvDeleteManyReport, kvDeleteMany, kvSet } from "@/lib/kv-cache";

describe("kvDeleteManyReport", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
  it("retries a failed key and succeeds", async () => {
    let n = 0;
    h.kv = { delete: vi.fn(async (k) => { if (k === "b" && n++ < 1) throw new Error("boom"); }) };
    expect(await kvDeleteManyReport(["a", "b"])).toEqual({ ok: true, failed: [] });
    expect(h.kv.delete).toHaveBeenCalledTimes(3);
  });
  it("one failing key does not stop the others and is reported", async () => {
    h.kv = { delete: vi.fn(async (k) => { if (k === "bad") throw new Error("boom"); }) };
    const r = await kvDeleteManyReport(["a", "bad", "c"]);
    expect(r).toEqual({ ok: false, failed: ["bad"] });
    expect(h.kv.delete).toHaveBeenCalledWith("a");
    expect(h.kv.delete).toHaveBeenCalledWith("c");
    expect(await kvDeleteMany(["bad"])).toBe(false);
  });
  it("homepage reviews cache gets a TTL, other homepage keys do not", async () => {
    h.kv = { put: vi.fn(async () => {}) };
    await kvSet("homepage_reviews_v1", { a: 1 }, 3600);
    expect(h.kv.put).toHaveBeenLastCalledWith("homepage_reviews_v1", JSON.stringify({ a: 1 }), { expirationTtl: 3600 });
    await kvSet("homepage_data_v1", { a: 1 }, 3600);
    expect(h.kv.put).toHaveBeenLastCalledWith("homepage_data_v1", JSON.stringify({ a: 1 }));
  });
});
