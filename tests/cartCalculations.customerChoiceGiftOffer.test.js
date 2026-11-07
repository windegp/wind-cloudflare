import { describe, expect, it } from "vitest";
import { calculateAllTotals } from "@/lib/cartCalculations";
import { computeBestOffer } from "@/lib/offerEngine";

const choiceOffer = (overrides = {}) => ({
  id: "choice-gift",
  name: "اشترِ 2 واختر 2 مجانًا",
  active: true,
  type: "buy_x_get_y_select_gift",
  config: { buyQty: 2, getQty: 2 },
  purchaseProductIds: ["A", "B"],
  giftProductIds: ["G", "A", "B"],
  ...overrides,
});

const item = (id, price, qty = 1, extra = {}) => ({
  id,
  productId: id,
  handle: id.toLowerCase(),
  title: id,
  price,
  qty,
  ...extra,
});

const zeroShipping = { shippingCost: 0, freeShippingThreshold: 999999 };

describe("customer-choice gift offer integration", () => {
  it("keeps incomplete gift selections out of subtotal and applies no discount", () => {
    const purchases = [item("A", 500), item("B", 400)];
    const selections = [item("G", 100, 1, { selectionId: "gift-1" })];

    const result = calculateAllTotals(
      purchases,
      null,
      zeroShipping,
      false,
      [choiceOffer()],
      null,
      selections
    );

    expect(result).toMatchObject({
      subtotal: 900,
      discount: 0,
      total: 900,
      discountSource: "none",
      customerChoiceGiftStatus: {
        eligiblePurchaseQty: 2,
        requiredGiftQty: 2,
        selectedGiftQty: 1,
        complete: false,
      },
    });
    expect(result.offerBenefits).toBeNull();
  });

  it("includes complete selected gifts and makes the cheapest selected units free", () => {
    const purchases = [item("A", 500), item("B", 400)];
    const selections = [
      item("G", 100, 1, { selectionId: "gift-1" }),
      item("A", 200, 1, { selectionId: "gift-2" }),
    ];

    const result = calculateAllTotals(
      purchases,
      null,
      zeroShipping,
      false,
      [choiceOffer()],
      null,
      selections
    );

    expect(result).toMatchObject({
      subtotal: 1200,
      discount: 300,
      total: 900,
      discountSource: "offer",
      appliedOffer: { id: "choice-gift", type: "buy_x_get_y_select_gift" },
      customerChoiceGiftStatus: { complete: true, requiredGiftQty: 2, selectedGiftQty: 2 },
    });
    expect(result.offerBenefits.giftLines).toHaveLength(2);
    expect(result.offerBenefits.giftLines.map((line) => line.regularQty)).toEqual([0, 0]);
    expect(result.offerBenefits.giftLines.flatMap((line) => line.discountedUnits).map((unit) => unit.finalPrice)).toEqual([0, 0]);
  });

  it("allows the cheapest purchased units to receive the free benefit", () => {
    const purchases = [item("A", 100), item("B", 200)];
    const selections = [
      item("G", 500, 1, { selectionId: "gift-1" }),
      item("A", 600, 1, { selectionId: "gift-2" }),
    ];

    const result = computeBestOffer(purchases, [choiceOffer()], new Date(), selections);

    expect(result.discount).toBe(300);
    expect(result.offerBenefits.lines).toHaveLength(2);
    expect(result.offerBenefits.lines.map((line) => line.discountedUnits[0].originalPrice)).toEqual([100, 200]);
    expect(result.offerBenefits.giftLines).toHaveLength(2);
    expect(result.offerBenefits.giftLines.every((line) => line.regularQty === 1)).toBe(true);
  });

  it("reports the winning customer-choice offer when multiple such offers are active", () => {
    const purchases = [item("A", 500, 2)];
    const selections = [item("G", 50, 1, { selectionId: "gift-1" })];
    const lowerPriorityOffer = choiceOffer({
      id: "priority-first",
      priority: 1,
      config: { buyQty: 1, getQty: 2 },
    });
    const winningOffer = choiceOffer({
      id: "winning-choice",
      priority: 2,
      config: { buyQty: 2, getQty: 1 },
    });

    const result = computeBestOffer(
      purchases,
      [lowerPriorityOffer, winningOffer],
      new Date(),
      selections
    );

    expect(result.offer.id).toBe("winning-choice");
    expect(result.customerChoiceGiftStatus).toMatchObject({
      offerId: "winning-choice",
      requiredGiftQty: 1,
      selectedGiftQty: 1,
      complete: true,
    });
  });

  it("charges selected gift products when cheaper purchased units receive the free benefit", () => {
    const purchases = [item("A", 100), item("B", 200)];
    const selections = [
      item("G", 500, 1, { selectionId: "gift-1" }),
      item("A", 600, 1, { selectionId: "gift-2" }),
    ];

    const result = calculateAllTotals(
      purchases,
      null,
      zeroShipping,
      false,
      [choiceOffer()],
      null,
      selections
    );

    expect(result).toMatchObject({
      subtotal: 1400,
      discount: 300,
      total: 1100,
      discountSource: "offer",
    });
    expect(result.offerBenefits.lines.flatMap((line) => line.discountedUnits)
      .map((unit) => unit.originalPrice)).toEqual([100, 200]);
    expect(result.offerBenefits.giftLines.every((line) => line.regularQty === 1)).toBe(true);
  });

  it("shows the gift offer matching selected gifts when another discount wins", () => {
    const purchases = [item("A", 500, 2)];
    const selections = [item("G2", 600, 1, { selectionId: "gift-b" })];
    const firstChoice = choiceOffer({
      id: "first-choice",
      priority: 1,
      config: { buyQty: 1, getQty: 2 },
      giftProductIds: ["G1"],
    });
    const matchingChoice = choiceOffer({
      id: "matching-choice",
      priority: 2,
      config: { buyQty: 2, getQty: 1 },
      giftProductIds: ["G2"],
    });
    const strongerCartOffer = {
      id: "cart-winner",
      active: true,
      type: "cart_percent",
      config: { percent: 80 },
      productScope: "all",
      priority: 100,
    };

    const result = computeBestOffer(
      purchases,
      [firstChoice, matchingChoice, strongerCartOffer],
      new Date(),
      selections
    );

    expect(result.offer.id).toBe("cart-winner");
    expect(result.customerChoiceGiftStatus).toMatchObject({
      offerId: "matching-choice",
      requiredGiftQty: 1,
      selectedGiftQty: 1,
      complete: true,
    });
  });

  it("does not charge selected gifts when a stronger promo wins", () => {
    const purchases = [item("A", 500), item("B", 400)];
    const selections = [
      item("G", 100, 1, { selectionId: "gift-1" }),
      item("A", 200, 1, { selectionId: "gift-2" }),
    ];
    const promo = { valid: true, type: "fixed", value: 400, discountAmount: 400 };

    const result = calculateAllTotals(
      purchases,
      promo,
      zeroShipping,
      false,
      [choiceOffer()],
      null,
      selections
    );

    expect(result).toMatchObject({
      subtotal: 900,
      discount: 400,
      total: 500,
      discountSource: "promo",
    });
    expect(result.offerBenefits).toBeNull();
  });
});
