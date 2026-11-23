/** Best product offer OR code, plus the best welcome discount. Never exceed subtotal.
 * Percent amounts arrive precomputed on their existing eligible paid-product bases.
 * Product offer and code compete, ties go to code; welcome is added within the subtotal cap.
 */
export function buildDiscountBreakdown({ subtotal, offerAmount = 0, offerLabel = "عرض", promoAmount = 0, promoLabel = "خصم الكود", firstOrderAmount = 0, subscriberAmount = 0, subscriberLabel = "خصم المشتركين" }) {
  let remaining = Math.max(0, Number(subtotal) || 0);
  const automatic = Number(subscriberAmount) > Number(firstOrderAmount)
    ? { source: "subscriber", label: subscriberLabel, amount: subscriberAmount }
    : { source: "first_order", label: "خصم الطلب الأول", amount: firstOrderAmount };
  const base = Number(promoAmount) >= Number(offerAmount)
    ? { source: "promo", label: promoLabel, amount: promoAmount }
    : { source: "offer", label: offerLabel, amount: offerAmount };
  const lines = [base, automatic].flatMap(line => {
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
