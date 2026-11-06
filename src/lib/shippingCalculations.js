/**
 * Check the store-wide free-shipping threshold after monetary discounts.
 * Shipping itself is excluded from this calculation.
 */
export function isFreeShippingThresholdMet(subtotal = 0, discount = 0, threshold = 0) {
  const subtotalAmount = Number(subtotal);
  const discountAmount = Number(discount);
  const thresholdAmount = Number(threshold);

  if (
    !Number.isFinite(subtotalAmount) ||
    !Number.isFinite(thresholdAmount) ||
    thresholdAmount <= 0
  ) {
    return false;
  }

  const safeSubtotal = Math.max(0, subtotalAmount);
  const safeDiscount = Number.isFinite(discountAmount)
    ? Math.max(0, discountAmount)
    : 0;
  const amountAfterDiscount = Math.max(0, safeSubtotal - safeDiscount);

  return amountAfterDiscount >= thresholdAmount;
}
