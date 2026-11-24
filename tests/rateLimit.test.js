import { beforeEach, expect, it, vi } from "vitest";
const kv = vi.hoisted(() => ({ mode: "ok", store: new Map(), puts: [] }));
vi.mock("@/lib/kv-cache", () => ({
  getKV: vi.fn(async () => {
    if (kv.mode === "missing") return null;
    return {
      get: async (k) => { if (kv.mode === "throws") throw new Error("down"); return kv.store.get(k) ?? null; },
      put: async (k, v) => { if (kv.mode === "throws") throw new Error("put limit"); kv.puts.push(k); kv.store.set(k, v); },
      delete: async (k) => { kv.store.delete(k); },
    };
  }),
}));
import { checkRateLimit } from "@/lib/rateLimit";
let n = 0; const ip = () => `10.0.0.${++n}`;
beforeEach(() => { kv.mode = "ok"; kv.store.clear(); kv.puts = []; });

it("Meta and TikTok relays count separately for the same IP", async () => {
  const a = ip();
  for (let i = 0; i < 90; i++) expect((await checkRateLimit(a, "TRACKING_FB")).allowed).toBe(true);
  expect((await checkRateLimit(a, "TRACKING_FB")).allowed).toBe(false);
  expect((await checkRateLimit(a, "TRACKING_TT")).allowed).toBe(true);
  expect(kv.puts.some((k) => k === `ratelimit_TRACKING_FB_${a}`)).toBe(true);
  expect(kv.puts.some((k) => k === `ratelimit_TRACKING_TT_${a}`)).toBe(true);
});
it("a normal request uses the same number of KV calls as before (one put per request)", async () => {
  const a = ip(); await checkRateLimit(a, "TRACKING_FB"); expect(kv.puts).toHaveLength(1);
});
for (const mode of ["throws", "missing"]) {
  it(`tracking stays fail-open when KV is ${mode}`, async () => {
    kv.mode = mode; const a = ip();
    for (let i = 0; i < 500; i++) expect((await checkRateLimit(a, i % 2 ? "TRACKING_FB" : "TRACKING_TT")).allowed).toBe(true);
  });
  it(`sensitive endpoints keep a limit when KV is ${mode}, normal use is never blocked`, async () => {
    kv.mode = mode;
    const t = ip();
    for (let i = 0; i < 8; i++) expect((await checkRateLimit(t, "TRACK_ORDER")).allowed).toBe(true);
    const blocked = await checkRateLimit(t, "TRACK_ORDER");
    expect(blocked.allowed).toBe(false); expect(blocked.resetTime).toBeGreaterThan(0);
    const c = ip();
    for (let i = 0; i < 5; i++) expect((await checkRateLimit(c, "CONTACT")).allowed).toBe(true);
    expect((await checkRateLimit(c, "CONTACT")).allowed).toBe(false);
    const o = ip();
    for (let i = 0; i < 60; i++) expect((await checkRateLimit(o, "CREATE_ORDER")).allowed).toBe(true);
    expect((await checkRateLimit(o, "CREATE_ORDER")).allowed).toBe(false);
    // a different visitor is unaffected
    expect((await checkRateLimit(ip(), "TRACK_ORDER")).allowed).toBe(true);
  });
}
it("with KV healthy, limits behave as before", async () => {
  const t = ip();
  for (let i = 0; i < 8; i++) expect((await checkRateLimit(t, "TRACK_ORDER")).allowed).toBe(true);
  expect((await checkRateLimit(t, "TRACK_ORDER")).allowed).toBe(false);
});
