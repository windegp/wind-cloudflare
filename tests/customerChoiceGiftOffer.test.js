import { describe, expect, it } from "vitest";
import { computeCustomerChoiceGiftOffer } from "@/lib/customerChoiceGiftOffer";

const offer = (overrides = {}) => ({
  id: "choice-gift",
  active: true,
  type: "buy_x_get_y_select_gift",
  config: { buyQty: 2, getQty: 2 },
  purchaseProductIds: ["A", "B"],
  giftProductIds: ["A", "B", "G"],
  ...overrides,
});
const product = (id, price, qty = 1) => ({ id, productId: id, price, qty });

describe("customer-choice multi-product gift offer", () => {
  it("does not discount until all required gifts are selected", () => {
    const result = computeCustomerChoiceGiftOffer(
      [product("A", 500, 2)],
      [product("G", 100)],
      offer()
    );
    expect(result).toMatchObject({
      eligiblePurchaseQty: 2,
      requiredGiftQty: 2,
      selectedGiftQty: 1,
      complete: false,
      discount: 0,
      discountedUnits: [],
    });
  });

  it("requires purchase quantities across different eligible products", () => {
    const result = computeCustomerChoiceGiftOffer(
      [product("A", 500), product("B", 400)],
      [product("G", 100), product("A", 200)],
      offer()
    );
    expect(result.complete).toBe(true);
    expect(result.requiredGiftQty).toBe(2);
    expect(result.discount).toBe(300);
  });

  it.each([
    [2, 2],
    [4, 4],
    [6, 6],
  ])("%i eligible purchases require %i gifts for a 2+2 offer", (purchaseQty, giftQty) => {
    const result = computeCustomerChoiceGiftOffer(
      [product("A", 500, purchaseQty)],
      [product("G", 100, giftQty)],
      offer()
    );
    expect(result.requiredGiftQty).toBe(giftQty);
    expect(result.complete).toBe(true);
    expect(result.discount).toBe(giftQty * 100);
  });

  it("does not apply a partial or excess gift selection", () => {
    const purchases = [product("A", 500, 2)];
    expect(computeCustomerChoiceGiftOffer(purchases, [product("G", 100)], offer()).discount).toBe(0);
    expect(computeCustomerChoiceGiftOffer(purchases, [product("G", 100, 3)], offer()).discount).toBe(0);
  });

  it("makes the cheapest units free across purchases and selected gifts", () => {
    const result = computeCustomerChoiceGiftOffer(
      [product("A", 700), product("B", 300)],
      [product("G", 100), product("A", 200)],
      offer()
    );
    expect(result.discount).toBe(300);
    expect(result.discountedUnits.map((unit) => [unit.source, unit.originalPrice, unit.discount])).toEqual([
      ["gift", 100, 100],
      ["gift", 200, 200],
    ]);
  });

  it("supports different purchase and gift product groups", () => {
    const result = computeCustomerChoiceGiftOffer(
      [product("BUY-1", 800, 2)],
      [product("GIFT-1", 150), product("GIFT-2", 250)],
      offer({ purchaseProductIds: ["BUY-1"], giftProductIds: ["GIFT-1", "GIFT-2"] })
    );
    expect(result.complete).toBe(true);
    expect(result.discount).toBe(400);
  });

  it("does not count ineligible products in either group", () => {
    const result = computeCustomerChoiceGiftOffer(
      [product("A", 500), product("OUTSIDE", 900)],
      [product("G", 100), product("OUTSIDE", 50)],
      offer()
    );
    expect(result.eligiblePurchaseQty).toBe(1);
    expect(result.requiredGiftQty).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.discount).toBe(0);
  });

  it("always makes each awarded gift unit fully free", () => {
    const result = computeCustomerChoiceGiftOffer(
      [product("A", 500, 2)],
      [product("G", 200), product("B", 300)],
      offer({ maxDiscount: 1 })
    );
    expect(result.discount).toBe(500);
    expect(result.discountedUnits).toHaveLength(2);
    expect(result.discountedUnits.every((unit) => unit.free && unit.finalPrice === 0)).toBe(true);
  });

  it("rejects invalid offer configuration", () => {
    expect(computeCustomerChoiceGiftOffer([product("A", 500, 2)], [], offer({ config: { buyQty: 0, getQty: 1 } })).discount).toBe(0);
    expect(computeCustomerChoiceGiftOffer([product("A", 500, 2)], [], offer({ purchaseProductIds: [] })).discount).toBe(0);
  });
});
