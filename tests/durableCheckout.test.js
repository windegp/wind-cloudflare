import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn() }));
import { persistVerifiedCheckout, readCheckoutStatus, CHECKOUT_ATTEMPTS, ORDER_NUMBER_COLLECTION, ORDER_SEQUENCE_ID, orderNumberIndexId } from "@/lib/durableCheckout";

const quote = { subtotal: 1000, discount: 150, shipping: 70, total: 920, cartItems: [{ id: "A", qty: 1 }], lineItems: [{ productId: "A", price: 1000, quantity: 1 }], discountLines: [{ source: "first_order", amount: 150, label: "خصم الطلب الأول" }], customerIdentity: { email: "new@example.com", phone: "01012345678", governorate: "Cairo" } };
const input = { orderId: "WIND-reliability-123", paymentMethod: "cod", quoteToken: "signed", formData: { email: "new@example.com", phone: "01012345678", firstName: "Ali", lastName: "Test", address: "Address", city: "Cairo", governorate: "Cairo" } };
let store, docs, verify, versions, serial;
beforeEach(() => {
  docs = new Map(); versions = new Map(); serial = 0;
  verify = vi.fn(async () => structuredClone(quote));
  store = {
    get: vi.fn(async (c, id) => docs.has(`${c}/${id}`) ? { data: structuredClone(docs.get(`${c}/${id}`)), version: versions.get(`${c}/${id}`) || "seed" } : null),
    commit: vi.fn(async writes => {
      if (writes.some(w => (w.create && docs.has(`${w.collection}/${w.id}`)) || (w.version && versions.get(`${w.collection}/${w.id}`) !== w.version))) throw Object.assign(new Error("conflict"), { code: "ORDER_WRITE_CONFLICT" });
      for (const w of writes) { docs.set(`${w.collection}/${w.id}`, structuredClone(w.data)); versions.set(`${w.collection}/${w.id}`, String(++serial)); }
    }),
  };
});
const run = (over = {}) => persistVerifiedCheckout({ ...input, ...over }, { store, verify, now: () => new Date("2026-11-23T14:00:00Z") });
describe("durable checkout foundation", () => {
  it("atomically persists the canonical snapshot, projection and jobs, without sending", async () => {
    expect(await run()).toMatchObject({ persisted: true, replay: false, status: "confirmed" });
    expect(store.commit).toHaveBeenCalledTimes(1);
    expect(docs.size).toBe(8);
    expect(docs.get(`Orders/${input.orderId}`)).toMatchObject({ Total: 920, "Financial Status": "pending" });
    expect(docs.get(`${CHECKOUT_ATTEMPTS}/${input.orderId}`).financials.lineItems).toEqual(quote.lineItems);
  });
  it("same key and parameters replay with no duplicate writes or jobs", async () => {
    await run(); expect((await run()).replay).toBe(true); expect(store.commit).toHaveBeenCalledTimes(1);
  });
  it("concurrent identical retries converge on one durable attempt", async () => {
    const results = await Promise.all([run(), run()]);
    expect(results.every(r => r.persisted)).toBe(true); expect(docs.size).toBe(8);
  });
  it("lost commit response is recovered by key", async () => {
    const commit = store.commit;
    store.commit = vi.fn(async w => { await commit(w); throw new Error("connection reset after commit"); });
    expect(await run()).toMatchObject({ persisted: true, replay: true }); expect(docs.size).toBe(8);
  });
  it("different parameters under the same key are rejected, never overwritten", async () => {
    await run();
    await expect(run({ formData: { ...input.formData, address: "Changed" } })).rejects.toMatchObject({ code: "CHECKOUT_ID_REUSED", status: 409 });
    expect(store.commit).toHaveBeenCalledTimes(1);
  });
  it("card snapshot exists before any payment work; no confirmation jobs before payment", async () => {
    expect(await run({ paymentMethod: "card" })).toMatchObject({ status: "pending_payment" });
    expect(docs.size).toBe(4);
  });
  it("configuration/storage failure is surfaced, never success", async () => {
    store.get.mockRejectedValue(new Error("not configured"));
    await expect(run()).rejects.toMatchObject({ code: "CHECKOUT_STORAGE_UNAVAILABLE", status: 503 });
    expect(store.commit).not.toHaveBeenCalled();
  });
  it("an existing legacy order collision never overwrites the old order", async () => {
    docs.set(`Orders/${input.orderId}`, { Total: 123 });
    await expect(run()).rejects.toMatchObject({ code: "CHECKOUT_CONFLICT" });
    expect(docs.get(`Orders/${input.orderId}`).Total).toBe(123); expect(docs.size).toBe(1);
  });
  it("invalid and expired quote causes zero writes", async () => {
    verify.mockResolvedValue(null);
    await expect(run()).rejects.toMatchObject({ code: "INVALID_CHECKOUT_QUOTE" });
    expect(store.get).not.toHaveBeenCalled();
  });
  it("malformed input or financials causes zero writes", async () => {
    await expect(run({ paymentMethod: "card_success" })).rejects.toMatchObject({ code: "INVALID_PAYMENT_METHOD" });
    verify.mockResolvedValue({ ...quote, total: 1 });
    await expect(run()).rejects.toMatchObject({ code: "INVALID_CHECKOUT_FINANCIALS" });
    expect(store.commit).not.toHaveBeenCalled();
  });
  it("fresh quote tokens with identical content have the same idempotency identity", async () => {
    await run(); expect((await run({ quoteToken: "a fresh signature" })).replay).toBe(true);
  });
  it("expired signatures only recover an existing identical attempt, never create", async () => {
    await run(); verify.mockImplementation(async (_token, _id, options) => options?.allowExpired ? structuredClone(quote) : null);
    expect((await run()).replay).toBe(true);
    docs.clear(); await expect(run()).rejects.toMatchObject({ code: "INVALID_CHECKOUT_QUOTE" });
  });
  it("authenticated status never exposes customer data and accepts expired signed credentials", async () => {
    await run(); const result = await readCheckoutStatus(input, { store, verify });
    expect(result).toEqual({ orderId: input.orderId, status: "confirmed", orderNumber: 1001, paymentMethod: "cod", total: 920, currency: "EGP" });
    verify.mockResolvedValue({ ...quote, customerIdentity: { email: "other@example.com", phone: "01012345678" } });
    await expect(readCheckoutStatus(input, { store, verify })).rejects.toMatchObject({ code: "CHECKOUT_CREDENTIAL_MISMATCH" });
  });
  it("shipping destination is signed and cannot be substituted after pricing", async () => {
    await expect(run({ formData: { ...input.formData, governorate: "Alexandria" } })).rejects.toMatchObject({ code: "CHECKOUT_IDENTITY_MISMATCH" });
  });
  it("requires the eligibility identity to be signed, never client-substituted", async () => {
    await expect(run({ formData: { ...input.formData, email: "other@example.com" } })).rejects.toMatchObject({ code: "CHECKOUT_IDENTITY_MISMATCH" });
    expect(store.commit).not.toHaveBeenCalled();
  });

});

describe("atomic sequential display number allocation", () => {
  const sequenceKey = "WindCheckoutEffects/order_sequence_v1";
  it("starts at 1001 and commits the private lookup, counter and snapshots together", async () => {
    expect(await run()).toMatchObject({ orderNumber: 1001 });
    expect(docs.get(sequenceKey).lastNumber).toBe(1001);
    expect(docs.get("WindCheckoutEffects/order_number_1001")).toMatchObject({ orderId: input.orderId, orderNumber: 1001 });
    expect(docs.get(`Orders/${input.orderId}`)["Order Number"]).toBe(1001);
    expect(store.commit.mock.calls[0][0]).toHaveLength(8);
  });
  it("different concurrent attempts get distinct contiguous committed numbers", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => run({ orderId: `WIND-concurrent-${i}abcd` })));
    expect(results.map(r => r.orderNumber).sort()).toEqual([1001,1002,1003,1004,1005]);
    expect(docs.get(sequenceKey).lastNumber).toBe(1005);
    expect(new Set(results.map(r => r.orderNumber)).size).toBe(5);
  });
  it("same-attempt concurrent retries and response loss never consume another number", async () => {
    const commit = store.commit;
    store.commit = vi.fn(async writes => { await commit(writes); throw new Error("lost acknowledgement"); });
    const results = await Promise.all([run(),run(),run()]);
    expect(results.every(r => r.orderNumber === 1001)).toBe(true);
    expect(docs.get(sequenceKey).lastNumber).toBe(1001);
    expect((await run()).orderNumber).toBe(1001);
  });
  it("a failed atomic commit consumes nothing and retry uses 1001", async () => {
    store.commit.mockRejectedValueOnce(new Error("offline"));
    await expect(run()).rejects.toMatchObject({ code: "CHECKOUT_STORAGE_UNAVAILABLE" });
    expect(docs.size).toBe(0);
    expect((await run()).orderNumber).toBe(1001);
  });
  it("failed/cancelled payment attempts retain their number without reuse", async () => {
    const result = await run({ paymentMethod: "card" });
    docs.get(`${CHECKOUT_ATTEMPTS}/${input.orderId}`).status = "cancelled";
    expect((await run({ orderId: "WIND-next-order-1234" })).orderNumber).toBe(1002);
    expect(result.orderNumber).toBe(1001);
  });
  it("rejects a malformed counter instead of resetting it", async () => {
    docs.set(sequenceKey, { lastNumber: "1001" });
    await expect(run()).rejects.toMatchObject({ code: "ORDER_SEQUENCE_INVALID" });
    expect(store.commit).not.toHaveBeenCalled();
  });
  it("a reset/deleted counter cannot overwrite or silently skip an existing mapping", async () => {
    docs.set("WindCheckoutEffects/order_number_1001", { orderId: "other", orderNumber: 1001 });
    await expect(run()).rejects.toMatchObject({ code: "ORDER_SEQUENCE_CONFLICT" });
    expect(docs.size).toBe(1);
    expect(docs.has(sequenceKey)).toBe(false);
  });
  it("replays a pre-numbered-era canonical attempt without backfilling or counter writes", async () => {
    await run(); delete docs.get(`${CHECKOUT_ATTEMPTS}/${input.orderId}`).orderNumber;
    const count = store.commit.mock.calls.length;
    expect((await run()).orderNumber).toBeUndefined();
    expect(store.commit).toHaveBeenCalledTimes(count);
  });
});
it('retains the same display number through a fresh server instance/deploy', async () => {
  await run();
  const freshStore = { ...store };
  const result = await persistVerifiedCheckout({ ...input, orderId: 'WIND-next-deploy-123' }, { store: freshStore, verify });
  expect(result.orderNumber).toBe(1002);
});
it('keeps a number assigned to a pending card attempt visible in signed status and replay', async () => {
  await run({ paymentMethod: 'card' });
  expect((await run({ paymentMethod: 'card' })).orderNumber).toBe(1001);
  expect(await readCheckoutStatus(input, { store, verify })).toMatchObject({ orderId: input.orderId, orderNumber: 1001, status: 'pending_payment' });
});
it('never increments on conflicting payload reuse of an attempt ID', async () => {
  await run();
  await expect(run({ formData: { ...input.formData, address: 'changed' } })).rejects.toMatchObject({ code: 'CHECKOUT_ID_REUSED' });
  expect(docs.get('WindCheckoutEffects/order_sequence_v1').lastNumber).toBe(1001);
});

it("counter contention fails after bounded retries, without creating this attempt", async () => {
  store.commit = vi.fn(async () => {
    const key = "WindCheckoutEffects/order_sequence_v1";
    docs.set(key, { lastNumber: (docs.get(key)?.lastNumber || 1000) + 1 });
    versions.set(key, String(++serial));
    throw Object.assign(new Error("contending writer"), { code: "ORDER_WRITE_CONFLICT" });
  });
  await expect(run()).rejects.toMatchObject({ code: "CHECKOUT_CONFLICT" });
  expect(store.commit).toHaveBeenCalledTimes(8);
  expect(docs.has(`${CHECKOUT_ATTEMPTS}/${input.orderId}`)).toBe(false);
  expect(docs.has(`Orders/${input.orderId}`)).toBe(false);
});
