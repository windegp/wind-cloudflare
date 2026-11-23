import { describe, expect, it } from "vitest";
import { buildDiscountBreakdown, isStackingEnabled } from "@/lib/discountBreakdown";

describe("stacking configuration", () => {
  it("defaults to legacy mode and activates independently for each setting", () => {
    expect(isStackingEnabled({})).toBe(false);
    for (const cfg of [{ firstOrderEnabled: true }, { subscriberDiscount: { enabled: true } }, { freeShippingThreshold: 2000 }]) expect(isStackingEnabled(cfg)).toBe(true);
    expect(isStackingEnabled({}, { enabled: true })).toBe(true);
    expect(isStackingEnabled({ firstOrderEnabled: false, subscriberDiscount: { enabled: false }, freeShippingThreshold: 0 }, { enabled: false })).toBe(false);
  });
  it("preserves offer allocation, caps code then welcome, never creates negative totals", () => {
    const r = buildDiscountBreakdown({ subtotal: 1000, offerAmount: 700, promoAmount: 200, firstOrderAmount: 200, subscriberAmount: 300 });
    expect(r.discount).toBe(1000);
    expect(r.lines.map(l => [l.source, l.amount])).toEqual([["offer", 700], ["promo", 200], ["subscriber", 100]]);
  });
  it("first-order wins an equal welcome tie", () => {
    expect(buildDiscountBreakdown({ subtotal: 1000, firstOrderAmount: 100, subscriberAmount: 100 }).lines[0].source).toBe("first_order");
  });
});
