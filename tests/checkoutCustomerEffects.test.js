import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn() }));
import { applyCheckoutCustomerEffects } from "@/lib/checkoutCustomerEffects";
let docs, store, serial;
const order = { orderId: "WIND-effects-123", status: "confirmed", financials: { total: 100 }, customer: { email: "test@example.com", firstName: "Test" } };
const seed = (k, data) => docs.set(k, { data: structuredClone(data), version: String(++serial) });
const run = (over = {}) => applyCheckoutCustomerEffects({ order: { ...order, ...over } }, { store, now: () => "2026-11-23 16:00:00" });
beforeEach(() => {
  docs = new Map(); serial = 0;
  seed("settings/siteSettings", { counters: { orders: 10, sales: 1000, customers: 4, other: 9 }, theme: "dark" });
  store = { get: vi.fn(async (c, id) => structuredClone(docs.get(`${c}/${id}`) || null)),
    commit: vi.fn(async writes => {
      for (const w of writes) {
        const d = docs.get(`${w.collection}/${w.id}`);
        if ((w.create && d) || (w.version && d?.version !== w.version)) throw Object.assign(new Error("conflict"), { code: "ORDER_WRITE_CONFLICT" });
      }
      for (const w of writes) seed(`${w.collection}/${w.id}`, w.merge ? { ...docs.get(`${w.collection}/${w.id}`).data, ...w.data } : w.data);
    }) };
});
describe("atomic customer and counter effect", () => {
  it("creates customer and increments counters once with ledger, preserving settings", async () => {
    await run(); await run();
    expect(docs.get("settings/siteSettings").data).toEqual({ counters: { orders: 11, sales: 1100, customers: 5, other: 9 }, theme: "dark" });
    expect(docs.get("Customers/test@example.com").data["Total Orders"]).toBe(1); expect(store.commit).toHaveBeenCalledTimes(1);
  });
  it("same-order concurrent processing applies once", async () => {
    await Promise.all([run(), run()]); expect(docs.get("settings/siteSettings").data.counters.orders).toBe(11);
  });
  it("different orders for one customer update totals without lost writes", async () => {
    await Promise.all([run(), run({ orderId: "WIND-effects-456" })]);
    expect(docs.get("Customers/test@example.com").data).toMatchObject({ "Total Orders": 2, "Total Spent": 200, segments: ["VIP_Customer"] });
    expect(docs.get("settings/siteSettings").data.counters).toMatchObject({ customers: 5, orders: 12 });
  });
  it("abandoned-cart customer with zero orders counts as a new purchasing customer", async () => {
    seed("Customers/test@example.com", { "Total Orders": 0, custom: true }); await run();
    expect(docs.get("settings/siteSettings").data.counters.customers).toBe(5);
    expect(docs.get("Customers/test@example.com").data.custom).toBe(true);
  });
  it("a lost commit response recovers through ledger", async () => {
    const commit = store.commit; store.commit = vi.fn(async w => { await commit(w); throw new Error("lost response"); });
    expect((await run()).replay).toBe(true); expect(docs.get("settings/siteSettings").data.counters.orders).toBe(11);
  });
  it("missing settings fail before any partial effects", async () => {
    docs.delete("settings/siteSettings"); await expect(run()).rejects.toMatchObject({ code: "SITE_SETTINGS_NOT_FOUND" }); expect(store.commit).not.toHaveBeenCalled();
  });
  it("promo usage shares the ledger transaction and cannot double count on replay", async () => {
    seed("promoCodes/SAVE", { usedCount: 2, usedBy: ["old@example.com"] });
    const financials = { total: 100, appliedPromo: { valid: true, code: "SAVE", usageType: "once_per_customer" } };
    await run({ financials }); await run({ financials });
    expect(docs.get("promoCodes/SAVE").data).toEqual({ usedCount: 3, usedBy: ["old@example.com", "test@example.com"] });
  });
  it("unpaid orders never count", async () => {
    await expect(run({ status: "pending_payment" })).rejects.toMatchObject({ code: "ORDER_NOT_CONFIRMED" }); expect(store.commit).not.toHaveBeenCalled();
  });
});
