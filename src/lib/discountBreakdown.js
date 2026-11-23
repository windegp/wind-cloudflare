/** One product offer, one code, and the best welcome discount. Never exceed subtotal.
 * Percent amounts arrive precomputed on their existing eligible paid-product bases.
 * Allocate offer first (preserves gift/unit pricing), then code, then welcome.
 */
export function buildDiscountBreakdown({ subtotal, offerAmount = 0, offerLabel = "عرض", promoAmount = 0, promoLabel = "خصم الكود", firstOrderAmount = 0, subscriberAmount = 0, subscriberLabel = "خصم المشتركين" }) {
  let remaining = Math.max(0, Number(subtotal) || 0);
  const automatic = Number(subscriberAmount) > Number(firstOrderAmount)
    ? { source: "subscriber", label: subscriberLabel, amount: subscriberAmount }
    : { source: "first_order", label: "خصم الطلب الأول", amount: firstOrderAmount };
  const lines = [
    { source: "offer", label: offerLabel, amount: offerAmount },
    { source: "promo", label: promoLabel, amount: promoAmount },
    automatic,
  ].flatMap(line => {
    const amount = Math.min(remaining, Math.max(0, Math.round(Number(line.amount) || 0)));
    remaining -= amount;
    return amount > 0 ? [{ ...line, amount }] : [];
  });
  return { lines, discount: lines.reduce((sum, line) => sum + line.amount, 0), source: lines[0]?.source || "none" };
}

/** Mode depends on enabled settings, not on whether this particular cart/customer qualifies. */
export function isStackingEnabled(promotions = {}, shippingRule = null) {
  return promotions.firstOrderEnabled === true ||
    promotions.subscriberDiscount?.enabled === true ||
    Number(promotions.freeShippingThreshold) > 0 ||
    shippingRule?.enabled === true;
}
