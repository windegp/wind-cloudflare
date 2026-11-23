import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn() }));
import { receiveVerifiedPayment, processPaymentReceipt, PAYMENT_RECEIPTS } from "@/lib/durablePayments";
import { CHECKOUT_ATTEMPTS } from "@/lib/durableCheckout";
let store, docs, serial;
const event = { merchantOrderId: "WIND-payment-1234", transactionId: "tx-123", status: "SUCCESS", transactionResponseCode: "APPROVED", amount: "100.00", currency: "EGP" };
const key = `${CHECKOUT_ATTEMPTS}/${event.merchantOrderId}`;
const get = (c, id) => docs.get(`${c}/${id}`);
const seed = (k, data) => docs.set(k, { data: structuredClone(data), version: String(++serial) });
const run = (over = {}) => receiveVerifiedPayment({ ...event, ...over }, { store });
beforeEach(() => {
  serial = 0; docs = new Map();
  seed(key, { paymentMethod: "card", status: "pending_payment", financials: { total: 100, currency: "EGP" } });
  seed(`Orders/${event.merchantOrderId}`, { Total: 100 });
  store = {
    get: vi.fn(async (c, id) => structuredClone(get(c, id) || null)),
    commit: vi.fn(async writes => {
      for (const w of writes) {
        const existing = get(w.collection, w.id);
        if ((w.create && existing) || (w.version && existing?.version !== w.version)) throw Object.assign(new Error("conflict"), { code: "ORDER_WRITE_CONFLICT" });
      }
      for (const w of writes) {
        const data = w.merge ? { ...get(w.collection, w.id).data, ...w.data } : w.data;
        for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
        seed(`${w.collection}/${w.id}`, data);
      }
    }),
  };
});
describe("durable payments", () => {
  it("persists receipt before atomic paid transition and four jobs", async () => {
    const r = await run(); expect(r.state).toBe("applied");
    expect(store.commit.mock.calls[0][0]).toHaveLength(1);
    expect(store.commit.mock.calls[1][0]).toHaveLength(7);
    expect(docs.get(key).data).toMatchObject({ status: "paid", paymentReference: "tx-123" });
    expect(get(PAYMENT_RECEIPTS, r.receiptId).data.nextAttemptAt).toBeUndefined();
  });
  it.each(["00", "APPROVED"])("accepts SUCCESS with approved response code %s", async code => {
    const result = await run({ transactionResponseCode: code });
    expect(result.state).toBe("applied");
    expect(docs.get(key).data.status).toBe("paid");
    expect(store.commit.mock.calls[1][0]).toHaveLength(7);
  });
  it.each(["", "0", "05", "DECLINED", "AUTHENTICATION_IN_PROGRESS", "approved", " 00 "])("does not broaden success approval to %s", async code => {
    expect(await run({ transactionResponseCode: code })).toMatchObject({ state: "review", reason: "PAYMENT_NOT_APPROVED" });
    expect(docs.get(key).data.status).toBe("pending_payment");
    expect(docs.size).toBe(3);
  });
  it.each(["PENDING", "FAILURE"])("code 00 does not approve a %s transaction", async status => {
    expect(await run({ status, transactionResponseCode: "00" })).toMatchObject({ state: "observed" });
    expect(docs.get(key).data.status).toBe("pending_payment");
    expect(docs.size).toBe(3);
  });
  it.each([{ amount: "101" }, { currency: "USD" }])("code 00 still requires matching private financials: %o", async mismatch => {
    expect(await run({ transactionResponseCode: "00", ...mismatch })).toMatchObject({ state: "review", reason: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH" });
    expect(docs.get(key).data.status).toBe("pending_payment");
  });
  it("replays a code 00 success without duplicate jobs", async () => {
    await Promise.all([run({ transactionResponseCode: "00" }), run({ transactionResponseCode: "00" })]);
    await run({ transactionResponseCode: "00" });
    expect(docs.size).toBe(7);
  });
  it("duplicate and concurrent deliveries create jobs and count opportunities once", async () => {
    const r = await Promise.all([run(), run()]); expect(r.every(v => v.state === "applied")).toBe(true);
    await run(); expect(docs.size).toBe(7);
  });
  it("ignores quote expiry entirely for verified paid canonical financials", async () => {
    docs.get(key).data.quoteExpiresAt = "2000-01-01"; expect((await run()).state).toBe("applied");
  });
  it.each([{ amount: "101" }, { currency: "USD" }, { currency: "" }, { amount: "" }])("retains mismatch for review without marking paid: %o", async over => {
    expect(await run(over)).toMatchObject({ state: "review", reason: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH" });
    expect(docs.get(key).data.status).toBe("pending_payment"); expect(docs.size).toBe(3);
  });
  it("missing order is durable and can recover after it becomes visible", async () => {
    const canonical = docs.get(key); docs.delete(key);
    const r = await run(); expect(r.state).toBe("awaiting_order");
    docs.set(key, canonical);
    expect((await processPaymentReceipt(r.receiptId, { store })).state).toBe("applied");
  });
  it("a crash after receipt persistence can be recovered independently", async () => {
    const commit = store.commit; let count = 0;
    store.commit = vi.fn(async writes => { if (++count > 1) throw new Error("network"); return commit(writes); });
    await expect(run()).rejects.toThrow("network");
    const receipt = [...docs].find(([k]) => k.startsWith(`${PAYMENT_RECEIPTS}/`));
    expect(receipt[1].data.state).toBe("received"); store.commit = commit;
    expect((await processPaymentReceipt(receipt[0].split("/")[1], { store })).state).toBe("applied");
  });
  it("lost final commit response reads back the applied state", async () => {
    const commit = store.commit; store.commit = vi.fn(async writes => { await commit(writes); throw new Error("lost response"); });
    expect((await run()).state).toBe("applied");
  });
  it("a second successful transaction is flagged, never creates duplicate jobs", async () => {
    await run(); expect(await run({ transactionId: "tx-another" })).toMatchObject({ state: "review", reason: "SECOND_SUCCESSFUL_TRANSACTION" });
    expect(docs.size).toBe(8);
  });
  it("pending/failure after success never downgrades the paid order", async () => {
    await run(); await run({ status: "FAILURE" }); await run({ status: "PENDING" });
    expect(docs.get(key).data.status).toBe("paid"); expect(docs.size).toBe(9);
  });
  it("same transaction/status with changed payload is a conflict", async () => {
    await run(); await expect(run({ amount: "1" })).rejects.toMatchObject({ code: "PAYMENT_EVENT_CONFLICT" });
  });
  it("a missing dashboard projection is flagged rather than recreated without customer data", async () => {
    docs.delete(`Orders/${event.merchantOrderId}`);
    expect(await run()).toMatchObject({ state: "review", reason: "ORDER_PROJECTION_MISSING" });
    expect(docs.get(key).data.status).toBe("pending_payment");
  });
  it("successful authentication is not an approved payment", async () => {
    expect(await run({ transactionResponseCode: "AUTHENTICATION_IN_PROGRESS" })).toMatchObject({ state: "review", reason: "PAYMENT_NOT_APPROVED" });
    expect(docs.get(key).data.status).toBe("pending_payment");
  });
  it("malformed event never persists", async () => {
    await expect(run({ transactionId: "" })).rejects.toMatchObject({ code: "INVALID_PAYMENT_EVENT" }); expect(store.commit).not.toHaveBeenCalled();
  });
});
