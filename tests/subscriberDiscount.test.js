import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  docs: new Map(),
  offers: [],
  adminGet: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/firestoreAdmin", () => ({ firestoreAdminGet: (...a) => m.adminGet(...a) }));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_d, c) => ({ kind: "collection", collection: c }),
  doc: (_d, c, id) => ({ kind: "document", collection: c, id: String(id) }),
  where: (f, o, v) => ({ f, o, v }),
  limit: (v) => v,
  query: (t, ...c) => ({ ...t, kind: "query", constraints: c }),
  getDoc: async (r) => {
    const v = m.docs.get(`${r.collection}/${r.id}`);
    return { id: r.id, exists: () => v !== undefined, data: () => v };
  },
  getDocs: async (r) => {
    if (r.collection === "offers" && r.kind === "collection") {
      const docs = m.offers.map(({ id, ...d }) => ({ id, data: () => d }));
      return { docs, empty: docs.length === 0 };
    }
    if (r.collection === "products" && r.kind === "query") {
      const h = (r.constraints || []).find((c) => c.f === "handle");
      const docs = [...m.docs.entries()]
        .filter(([k]) => k.startsWith("products/"))
        .map(([k, data]) => ({ id: k.slice(9), data: () => data }))
        .filter((d) => !h || d.data().handle === h.v)
        .slice(0, 1);
      return { docs, empty: docs.length === 0 };
    }
    return { docs: [], empty: true };
  },
}));

import { createServerCheckoutQuote } from "@/lib/serverCheckoutPricing";
import {
  computeSubscriberDiscountAmount,
  normalizeSubscriberSettings,
} from "@/lib/subscriberDiscount";

const EMAIL = "sara@example.com";
const PHONE = "01012345678";

function setup({ sub, first, offers = [], customers = {}, subscribed = true } = {}) {
  m.docs.clear();
  m.offers = offers;
  m.docs.set("products/A", { handle: "a", title: "A", price: 1000, images: ["x"], variants: [] });
  m.docs.set("settings/siteSettings", {
    promotions: {
      shippingCost: 0,
      freeShippingThreshold: 99999,
      ...(first ? { firstOrderEnabled: true, firstOrderDiscount: first } : {}),
      ...(sub ? { subscriberDiscount: sub } : {}),
    },
  });
  for (const [k, v] of Object.entries(customers)) m.docs.set(`Customers/${k}`, v);
  m.adminGet.mockReset();
  m.adminGet.mockImplementation(async (_c, id) =>
    subscribed && id === EMAIL ? { fields: { status: { stringValue: "active" } } } : null
  );
}

const quote = (over = {}) =>
  createServerCheckoutQuote({
    offersEnvironment: "production",
    governorate: "Cairo",
    cartItems: [{ id: "A", qty: 1, price: 1 }],
    customerEmail: EMAIL,
    customerPhone: PHONE,
    ...over,
  });

const pct = (value, extra = {}) => ({ enabled: true, name: "خصم الأصدقاء", type: "percent", value, firstOrderOnly: true, ...extra });

describe("subscriber discount settings helpers", () => {
  it("is off by default and for invalid values", () => {
    expect(normalizeSubscriberSettings(undefined).enabled).toBe(false);
    expect(normalizeSubscriberSettings({ enabled: true, type: "percent", value: 150 }).enabled).toBe(false);
    expect(normalizeSubscriberSettings({ enabled: true, type: "percent", value: 0 }).enabled).toBe(false);
    expect(normalizeSubscriberSettings({ enabled: true, type: "fixed", value: 150 }).enabled).toBe(true);
  });
  it("computes percent, fixed and caps at subtotal", () => {
    expect(computeSubscriberDiscountAmount({ type: "percent", value: 15 }, 1000)).toBe(150);
    expect(computeSubscriberDiscountAmount({ type: "fixed", value: 200 }, 1000)).toBe(200);
    expect(computeSubscriberDiscountAmount({ type: "fixed", value: 500 }, 300)).toBe(300);
    expect(computeSubscriberDiscountAmount({ type: "percent", value: 10 }, 0)).toBe(0);
  });
});

describe("server quote: subscriber discount", () => {
  beforeEach(() => setup());

  it("percent discount for a subscriber, labelled as subscriber", async () => {
    setup({ sub: pct(15) });
    const q = await quote();
    expect(q.discountSource).toBe("subscriber");
    expect(q.discount).toBe(150);
    expect(q.total).toBe(850);
    expect(q.subscriberDiscount).toMatchObject({ name: "خصم الأصدقاء", type: "percent", value: 15, amount: 150 });
  });

  it("fixed discount, and cap at subtotal", async () => {
    setup({ sub: pct(200, { type: "fixed" }) });
    expect((await quote()).discount).toBe(200);
    setup({ sub: pct(5000, { type: "fixed" }) });
    const q = await quote();
    expect(q.discount).toBe(1000);
    expect(q.total).toBe(0);
  });

  it("no discount when the feature is disabled (default)", async () => {
    setup({ sub: pct(15, { enabled: false }) });
    expect((await quote()).discountSource).toBe("none");
    setup({});
    const q = await quote();
    expect(q.discount).toBe(0);
    expect(m.adminGet).not.toHaveBeenCalled();
  });

  it("no discount for a non-subscriber", async () => {
    setup({ sub: pct(15), subscribed: false });
    const q = await quote();
    expect(q.discountSource).toBe("none");
    expect(q.discount).toBe(0);
  });

  it("unsubscribed status does not qualify", async () => {
    setup({ sub: pct(15) });
    m.adminGet.mockImplementation(async () => ({ fields: { status: { stringValue: "unsubscribed" } } }));
    expect((await quote()).discount).toBe(0);
  });

  it("first-order-only: blocked after a prior order, allowed for a new customer", async () => {
    setup({ sub: pct(15), customers: { [EMAIL]: { "Total Orders": 2 } } });
    expect((await quote()).discountSource).toBe("none");
    setup({ sub: pct(15) });
    expect((await quote()).discountSource).toBe("subscriber");
  });

  it("first-order-only off: repeat customers keep the discount", async () => {
    setup({ sub: pct(15, { firstOrderOnly: false }), customers: { [EMAIL]: { "Total Orders": 5 } } });
    const q = await quote();
    expect(q.discountSource).toBe("subscriber");
    expect(q.discount).toBe(150);
  });

  it("best single discount wins, no stacking: larger first-order discount beats subscriber", async () => {
    setup({ sub: pct(10), first: 20 });
    const q = await quote();
    expect(q.discountSource).toBe("first_order");
    expect(q.discount).toBe(200);
  });

  it("best single discount wins: larger subscriber discount beats first-order", async () => {
    setup({ sub: pct(25), first: 10 });
    const q = await quote();
    expect(q.discountSource).toBe("subscriber");
    expect(q.discount).toBe(250);
    expect(q.total).toBe(750);
  });

  it("non-subscriber with a new email still gets the first-order discount", async () => {
    setup({ sub: pct(25), first: 10, subscribed: false });
    const q = await quote();
    expect(q.discountSource).toBe("first_order");
    expect(q.discount).toBe(100);
  });

  it("a larger offer beats the subscriber discount, a smaller one loses", async () => {
    const offer = (percent) => ({
      id: "o1", name: "عرض السلة", active: true, environment: "production",
      type: "cart_percent", config: { percent }, productScope: "all", priority: 1,
    });
    setup({ sub: pct(10), offers: [offer(40)] });
    let q = await quote();
    expect(q.discountSource).toBe("offer");
    expect(q.discount).toBe(400);
    setup({ sub: pct(30), offers: [offer(5)] });
    q = await quote();
    expect(q.discountSource).toBe("subscriber");
    expect(q.discount).toBe(300);
  });

  it("fails closed when the Subscribers read throws", async () => {
    setup({ sub: pct(15) });
    m.adminGet.mockRejectedValue(new Error("boom"));
    const q = await quote();
    expect(q.discountSource).toBe("none");
    expect(q.discount).toBe(0);
  });

  it("rejects malformed emails without reading Subscribers", async () => {
    setup({ sub: pct(15, { firstOrderOnly: false }) });
    const q = await quote({ customerEmail: "not-an-email" });
    expect(q.discount).toBe(0);
    expect(m.adminGet).not.toHaveBeenCalled();
  });

  it("stacks a promo code with the subscriber discount (both applied, shown separately)", async () => {
    setup({ sub: pct(10) });
    m.docs.set("promoCodes/SAVE100", { active: true, type: "fixed", value: 100, usageType: "unlimited", scope: "all" });
    const q = await quote({ promoCode: "SAVE100" });
    expect(q.discountSource).toBe("promo");
    expect(q.promoDiscountAmount).toBe(100);
    expect(q.stackedDiscount).toMatchObject({ source: "subscriber", amount: 100, label: "خصم الأصدقاء" });
    expect(q.discount).toBe(200);
    expect(q.total).toBe(800);
  });

  it("stacks a promo code with first-order when the customer is not a subscriber", async () => {
    setup({ first: 10, subscribed: false });
    m.docs.set("promoCodes/P20", { active: true, type: "percent", value: 20, usageType: "unlimited", scope: "all" });
    const q = await quote({ promoCode: "P20" });
    expect(q.promoDiscountAmount).toBe(200);
    expect(q.stackedDiscount).toMatchObject({ source: "first_order", amount: 100 });
    expect(q.discount).toBe(300);
  });

  it("only the best automatic discount stacks with the code (not both subscriber and first-order)", async () => {
    setup({ sub: pct(25), first: 10 });
    m.docs.set("promoCodes/SAVE100", { active: true, type: "fixed", value: 100, usageType: "unlimited", scope: "all" });
    const q = await quote({ promoCode: "SAVE100" });
    expect(q.stackedDiscount).toMatchObject({ source: "subscriber", amount: 250 });
    expect(q.discount).toBe(350);
  });

  it("total discount never exceeds the subtotal when stacking", async () => {
    setup({ sub: pct(60) });
    m.docs.set("promoCodes/BIG", { active: true, type: "percent", value: 60, usageType: "unlimited", scope: "all" });
    const q = await quote({ promoCode: "BIG" });
    expect(q.discount).toBe(1000);
    expect(q.promoDiscountAmount + q.stackedDiscount.amount).toBe(1000);
  });

  it("an abandoned customer record (Total Orders 0) is still a first order", async () => {
    setup({ sub: pct(15), customers: { [EMAIL]: { "Total Orders": 0, Last_Order_Status: "abandoned" } } });
    expect((await quote()).discountSource).toBe("subscriber");
  });
  const shippingRule = { enabled: true, scope: "selected", productIds: ["A"], condition: "quantity", minQuantity: 1 };
  function shippingSettings(extra = {}) {
    const settings = m.docs.get("settings/siteSettings");
    settings.promotions = { ...settings.promotions, shippingCost: 70, freeShippingThreshold: 0, ...extra };
  }
  function addCode(type = "fixed", value = 100) {
    m.docs.set("promoCodes/CODE", { active: true, type, value, usageType: "unlimited", scope: "all" });
  }
  it("free shipping rule + subscriber + code all stack", async () => {
    setup({ sub: pct(15) }); shippingSettings(); addCode();
    m.docs.set("settings/offerShippingRules_production", shippingRule);
    const q = await quote({ promoCode: "CODE" });
    expect(q).toMatchObject({ discount: 250, shipping: 0, total: 750, freeShippingByRule: true });
    expect(q.stackedDiscount).toMatchObject({ source: "subscriber", amount: 150 });
    expect(q.promoDiscountAmount).toBe(100);
  });
  it("free shipping rule + first-order + fixed voucher all stack", async () => {
    setup({ first: 10, offers: [{ id: "v", active: true, type: "coupon_fixed", couponCode: "VOUCHER", productScope: "all", config: { amount: 100 } }] });
    shippingSettings(); m.docs.set("settings/offerShippingRules_production", shippingRule);
    const q = await quote({ promoCode: "VOUCHER" });
    expect(q).toMatchObject({ discount: 200, shipping: 0, total: 800 });
    expect(q.stackedDiscount.source).toBe("first_order");
  });
  it("threshold shipping stays free when eligible after both cash discounts", async () => {
    setup({ sub: pct(15) }); shippingSettings({ freeShippingThreshold: 750 }); addCode();
    expect(await quote({ promoCode: "CODE" })).toMatchObject({ discount: 250, shipping: 0, total: 750 });
    shippingSettings({ freeShippingThreshold: 751 });
    expect(await quote({ promoCode: "CODE" })).toMatchObject({ discount: 250, shipping: 70, total: 820 });
  });
  it("a free-shipping code stacks with subscriber without a cash code", async () => {
    setup({ sub: pct(15) }); shippingSettings(); addCode("free_shipping", 0);
    expect(await quote({ promoCode: "CODE" })).toMatchObject({ discount: 150, shipping: 0, total: 850, freeShippingByPromo: true });
  });
  it("disabled autos preserve code and voucher amounts, free shipping remains independent", async () => {
    for (const ruleEnabled of [true, false]) {
      setup({ sub: pct(15, { enabled: false }) }); shippingSettings(); addCode();
      m.docs.set("settings/offerShippingRules_production", { ...shippingRule, enabled: ruleEnabled });
      const q = await quote({ promoCode: "CODE" });
      expect(q).toMatchObject({ discount: 100, shipping: ruleEnabled ? 0 : 70, total: ruleEnabled ? 900 : 970, stackedDiscount: null });
    }
  });
  it("non-shipping qualifying offers still reject a cash code, with autos on or off", async () => {
    for (const enabled of [true, false]) {
      setup({ sub: pct(15, { enabled }), offers: [{ id: "o", active: true, type: "cart_percent", productScope: "all", config: { percent: 20 } }] });
      shippingSettings(); addCode();
      m.docs.set("settings/offerShippingRules_production", shippingRule);
      await expect(quote({ promoCode: "CODE" })).rejects.toMatchObject({ status: 409 });
    }
  });

});
