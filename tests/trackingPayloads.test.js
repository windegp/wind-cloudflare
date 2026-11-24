import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The payloads relayed to Meta and TikTok must not depend on how the rate limiter counts.
// The expected values live in tests/__snapshots__/trackingPayloads.test.js.snap and were
// generated from the code BEFORE the rate-limit key change.
const kvState = vi.hoisted(() => ({ mode: "ok" }));
vi.mock("@/lib/kv-cache", () => ({
  getKV: vi.fn(async () => {
    if (kvState.mode === "missing") return null;
    if (kvState.mode === "throws") return { get: async () => { throw new Error("KV down"); }, put: async () => { throw new Error("KV put limit exceeded"); }, delete: async () => {} };
    const m = new Map();
    return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
  }),
}));

import { POST as fbPost } from "@/app/api/fb-track/route";
import { POST as ttPost } from "@/app/api/tt-track/route";

const headers = { origin: "https://windeg.com", "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", "user-agent": "UA/1.0", cookie: "_fbp=fb.1.1700000000000.123" };
const mk = (url, body) => new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
let sent;
beforeEach(() => {
  kvState.mode = "ok"; sent = [];
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
  process.env.FB_CONVERSIONS_TOKEN = "tok"; process.env.TIKTOK_ACCESS_TOKEN = "tt";
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    sent.push({ url: String(url).replace(/access_token=[^&]+/, "access_token=X"), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const fbBody = { event_name: "Purchase", event_id: "Purchase-evt-1", value: 450, currency: "EGP", content_ids: [1, "b"], contents: [{ id: "a", quantity: 2, item_price: 225 }], order_id: "WIND-1", email: "A@b.com", phone: "01012345678", external_id: "ext1", event_source_url: "https://windeg.com/thank-you" };
const ttBody = { event: "CompletePayment", event_id: "Purchase-evt-1", value: 450, currency: "EGP", contents: [{ content_id: "a", quantity: 2 }], order_id: "WIND-1", email: "a@b.com", phone: "01012345678", external_id: "ext1", page_url: "https://windeg.com/thank-you" };

for (const mode of ["ok", "missing", "throws"]) {
  it(`Meta and TikTok payloads (event name, event_id, dedupe fields) are identical, KV ${mode}`, async () => {
    kvState.mode = mode;
    const r1 = await fbPost(mk("https://windeg.com/api/fb-track", fbBody));
    const r2 = await ttPost(mk("https://windeg.com/api/tt-track", ttBody));
    expect(r1.status).toBe(200); expect(r2.status).toBe(200);
    expect(sent).toMatchSnapshot();
  });
}
