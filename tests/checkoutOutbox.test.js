import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn() }));
import { processCheckoutJob } from "@/lib/checkoutOutbox";
let docs, store, handler, clock, serial;
const id = "WIND-outbox-123.customer_email";
const jobKey = `WindCheckoutOutbox/${id}`;
const seed = (key, data) => docs.set(key, { data: structuredClone(data), version: String(++serial) });
const run = () => processCheckoutJob(id, { store, handlers: { customer_email: handler }, now: () => new Date(clock) });
beforeEach(() => {
  docs = new Map(); serial = 0; clock = Date.parse("2026-11-23T14:00:00Z"); handler = vi.fn(async () => ({ providerId: "email-1" }));
  seed(jobKey, { orderId: "WIND-outbox-123", type: "customer_email", state: "pending", attempts: 0, nextAttemptAt: new Date(clock).toISOString() });
  seed("WindCheckoutAttempts/WIND-outbox-123", { status: "confirmed" });
  store = { get: vi.fn(async (c, key) => structuredClone(docs.get(`${c}/${key}`) || null)),
    commit: vi.fn(async writes => {
      for (const w of writes) if (docs.get(`${w.collection}/${w.id}`)?.version !== w.version) throw Object.assign(new Error("conflict"), { code: "ORDER_WRITE_CONFLICT" });
      for (const w of writes) seed(`${w.collection}/${w.id}`, { ...docs.get(`${w.collection}/${w.id}`).data, ...w.data });
    }) };
});
describe("checkout outbox worker", () => {
  it("claims, sends with stable idempotency key, records provider ID, and skips replay", async () => {
    expect((await run()).state).toBe("sent"); await run(); expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].idempotencyKey).toBe(`wind-order-v1/${id}`);
    expect(docs.get(jobKey).data).toMatchObject({ state: "sent", providerId: "email-1", attempts: 1 });
  });
  it("concurrent workers have only one lease owner", async () => {
    await Promise.all([run(), run()]); expect(handler).toHaveBeenCalledTimes(1);
  });
  it("failure is retryable with backoff and without sensitive error storage", async () => {
    handler.mockRejectedValue(new Error("secret: sensitive@example.com")); expect((await run()).state).toBe("retry");
    expect(docs.get(jobKey).data.lastError).toBe("HANDLER_FAILED"); await run(); expect(handler).toHaveBeenCalledTimes(1);
    clock += 31000; handler.mockResolvedValue({}); expect((await run()).state).toBe("sent");
  });
  it("expired lease retries with the original provider key", async () => {
    Object.assign(docs.get(jobKey).data, { state: "processing", leaseToken: "dead-worker", leaseUntil: new Date(clock - 1).toISOString(), firstAttemptAt: new Date(clock - 1000).toISOString(), attempts: 1 });
    expect((await run()).state).toBe("sent"); expect(handler.mock.calls[0][0].idempotencyKey).toBe(`wind-order-v1/${id}`);
  });
  it("ambiguous lease response recovers ownership before sending", async () => {
    const commit = store.commit; let n = 0; store.commit = vi.fn(async w => { await commit(w); if (++n === 1) throw new Error("lost response"); });
    expect((await run()).state).toBe("sent"); expect(handler).toHaveBeenCalledTimes(1);
  });
  it("ambiguous completion response is recovered", async () => {
    const commit = store.commit; let n = 0; store.commit = vi.fn(async w => { await commit(w); if (++n === 2) throw new Error("lost response"); });
    expect(await run()).toMatchObject({ state: "sent", recovered: true });
  });
  it("stops automatic email retries before the provider idempotency window expires", async () => {
    Object.assign(docs.get(jobKey).data, { firstAttemptAt: new Date(clock - 23 * 3600000).toISOString(), attempts: 2 });
    expect((await run()).state).toBe("review"); expect(handler).not.toHaveBeenCalled();
  });
  it("never sends for an unpaid card attempt", async () => {
    docs.get("WindCheckoutAttempts/WIND-outbox-123").data.status = "pending_payment";
    expect((await run()).state).toBe("retry"); expect(handler).not.toHaveBeenCalled();
  });
  it("old worker cannot overwrite a newer lease", async () => {
    handler.mockImplementation(async () => { seed(jobKey, { ...docs.get(jobKey).data, leaseToken: "new-owner" }); });
    expect((await run()).state).toBe("lease_lost"); expect(docs.get(jobKey).data.leaseToken).toBe("new-owner");
  });
  it("unknown handler fails loudly, not marked as completed", async () => {
    docs.get(jobKey).data.type = "unknown"; await expect(run()).rejects.toMatchObject({ code: "OUTBOX_HANDLER_UNAVAILABLE" });
  });
});
