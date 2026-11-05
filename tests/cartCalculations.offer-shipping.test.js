import { describe, it, expect } from "vitest";
import { calculateAllTotals } from "@/lib/cartCalculations";

const CART = [{ id: "p1", handle: "shirt", price: 500, qty: 1 }];

const freeShippingOffer = {
  id: "ship-only",
  name: "شحن مجاني",
  active: true,
  type: "free_shipping",
  config: {},
  productScope: "all",
  priority: 10,
  freeShipping: true,
};

describe("الشحن المجاني من العروض منفعة مستقلة", () => {
  it("يمنح شحنًا مجانيًا حتى لو لم يكن هناك خصم نقدي قابل للتطبيق", () => {
    const result = calculateAllTotals(CART, null, { shippingCost: 70, freeShippingThreshold: 0 }, false, [
      freeShippingOffer,
    ]);
    expect(result).toMatchObject({
      subtotal: 500,
      discount: 0,
      shipping: 0,
      total: 500,
      discountSource: "none",
      appliedOffer: null,
    });
  });

  it("لا يجمع عرض الشحن المنفصل مع كود خصم فائز", () => {
    const promo = { valid: true, type: "fixed", discountAmount: 120, code: "BF120" };
    const result = calculateAllTotals(
      CART,
      promo,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [freeShippingOffer]
    );
    expect(result).toMatchObject({
      discount: 120,
      discountSource: "promo",
      shipping: 70,
      total: 450,
    });
  });

  it("يسمح بالشحن المجاني عندما يكون مرفقاً بالعرض النقدي الفائز نفسه", () => {
    const offer = {
      id: "fixed-free-ship",
      name: "خصم مع شحن مجاني",
      active: true,
      type: "cart_fixed",
      config: { amount: 100 },
      productScope: "all",
      freeShipping: true,
    };
    const result = calculateAllTotals(
      CART,
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [offer]
    );
    expect(result).toMatchObject({
      discount: 100,
      discountSource: "offer",
      shipping: 0,
      total: 400,
    });
  });

  it("لا يمنح الشحن المجاني إذا لم تنطبق شروط نطاق المنتجات", () => {
    const result = calculateAllTotals(
      CART,
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [{ ...freeShippingOffer, productScope: "selected", productIds: ["different-product"] }]
    );
    expect(result).toMatchObject({ discount: 0, shipping: 70, total: 570 });
  });
});
