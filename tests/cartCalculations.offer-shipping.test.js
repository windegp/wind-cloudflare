import { describe, it, expect } from "vitest";
import { calculateAllTotals } from "@/lib/cartCalculations";

describe("قواعد الشحن المجاني المستقلة", () => {
  it("الشحن المجاني للمتجر كله يعمل مع أي عرض خصم", () => {
    const cart = [{ id: "p1", handle: "shirt", price: 500, qty: 1 }];
    const offer = {
      id: "discount",
      name: "خصم ثابت",
      active: true,
      type: "cart_fixed",
      config: { amount: 100 },
      productScope: "all",
    };
    const result = calculateAllTotals(
      cart,
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [offer],
      { enabled: true, scope: "store" }
    );
    expect(result).toMatchObject({
      discount: 100,
      discountSource: "offer",
      shipping: 0,
      total: 400,
    });
  });

  it("شحن المنتجات المحددة بالكمية لا يحتسب المنتجات الأخرى", () => {
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

  it("شحن المنتجات المحددة بالقيمة يحتسب قيمة المنتجات المختارة فقط", () => {
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

  it("قاعدة المنتج المحدد تمنع حد الشحن العام من احتساب منتجات أخرى", () => {
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
    expect(result.shipping).toBe(70);
  });

  it("القواعد المعطّلة لا تمنح شحنًا مجانيًا", () => {
    const result = calculateAllTotals(
      [{ id: "p1", price: 500, qty: 1 }],
      null,
      { shippingCost: 70, freeShippingThreshold: 0 },
      false,
      [],
      { enabled: false, scope: "store" }
    );
    expect(result.shipping).toBe(70);
  });
});
