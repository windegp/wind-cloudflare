import { describe, it, expect } from "vitest";
import { calculateAllTotals } from "@/lib/cartCalculations";

describe("شحن مجاني للمنتجات المحددة دون التأثير على إعدادات الشحن العامة", () => {
  it("يمنح الشحن المجاني عند بلوغ عدد قطع المنتج المحدد فقط", () => {
    const cart = [
      { id: "A", price: 500, qty: 2 },
      { id: "B", price: 900, qty: 3 },
    ];
    const rule = { enabled: true, scope: "selected", productIds: ["A"], condition: "quantity", minQuantity: 2 };
    const eligible = calculateAllTotals(cart, null, { shippingCost: 70, freeShippingThreshold: 0 }, false, [], rule);
    const ineligible = calculateAllTotals(
      [{ ...cart[0], qty: 1 }, cart[1]],
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [],
      rule
    );
    expect(eligible.shipping).toBe(0);
    expect(ineligible.shipping).toBe(70);
  });

  it("يمنح الشحن المجاني عند بلوغ قيمة المنتجات المحددة فقط", () => {
    const cart = [
      { id: "A", price: 300, qty: 2 },
      { id: "B", price: 900, qty: 1 },
    ];
    const rule = { enabled: true, scope: "selected", productIds: ["A"], condition: "subtotal", minSubtotal: 600 };
    const eligible = calculateAllTotals(cart, null, { shippingCost: 70, freeShippingThreshold: 0 }, false, [], rule);
    const ineligible = calculateAllTotals(
      [{ ...cart[0], qty: 1 }, cart[1]],
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [],
      rule
    );
    expect(eligible.shipping).toBe(0);
    expect(ineligible.shipping).toBe(70);
  });

  it("يظل حد الشحن المجاني العام فعالًا حتى مع قاعدة منتجات محددة غير مستحقة", () => {
    const cart = [
      { id: "A", price: 100, qty: 1 },
      { id: "B", price: 2400, qty: 1 },
    ];
    const rule = { enabled: true, scope: "selected", productIds: ["A"], condition: "quantity", minQuantity: 2 };
    const result = calculateAllTotals(
      cart,
      null,
      { shippingCost: 70, freeShippingThreshold: 2000 },
      false,
      [],
      rule
    );
    expect(result.freeShippingByRule).toBe(false);
    expect(result.shipping).toBe(0);
  });

  it("كود الشحن المجاني الموجود مسبقًا يظل يعمل مع قاعدة المنتجات المحددة", () => {
    const cart = [{ id: "A", price: 500, qty: 1 }];
    const promo = { valid: true, type: "free_shipping", freeShipping: true, discountAmount: 0 };
    const rule = { enabled: true, scope: "selected", productIds: ["B"], condition: "quantity", minQuantity: 2 };
    const result = calculateAllTotals(
      cart,
      promo,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [],
      rule
    );
    expect(result.freeShippingByRule).toBe(false);
    expect(result.shipping).toBe(0);
  });

  it("قاعدة المتجر القديمة لا تمنح شحنًا مجانيًا من هذا القسم", () => {
    const result = calculateAllTotals(
      [{ id: "A", price: 500, qty: 1 }],
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [],
      { enabled: true, scope: "store", productIds: [] }
    );
    expect(result.shipping).toBe(70);
  });

  it("القواعد المعطّلة لا تمنح شحنًا مجانيًا", () => {
    const result = calculateAllTotals(
      [{ id: "A", price: 500, qty: 1 }],
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [],
      { enabled: false, scope: "selected", productIds: ["A"] }
    );
    expect(result.shipping).toBe(70);
  });
});
