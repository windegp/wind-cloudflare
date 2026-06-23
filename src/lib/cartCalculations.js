// ============================================
// 🛒 CART CALCULATIONS UTILITY
// Centralized calculations for cart operations
// Used by CartContext and API routes
// ============================================

import { SHIPPING_COST, FREE_SHIPPING_THRESHOLD, CURRENCY, VALID_PROMO_CODES } from '@/lib/constants';

/**
 * Calculate subtotal from cart items
 * @param {Array} cartItems - Array of items with price and qty
 * @returns {number} Subtotal in currency units
 */
export function calculateSubtotal(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return 0;
  }
  return cartItems.reduce((acc, item) => {
    const itemPrice = parseFloat(item.price) || 0;
    const itemQty = parseInt(item.qty) || 0;
    return acc + (itemPrice * itemQty);
  }, 0);
}

/**
 * Calculate shipping cost based on promo code, subtotal, and cart items
 * @param {string} promoCode - Applied promo code (optional)
 * @param {number} subtotal - Cart subtotal to check free shipping threshold
 * @param {Array} cartItems - Cart items to check for bundleFreeShipping flag
 * @returns {number} Shipping cost in currency units
 */
export function calculateShipping(promoCode, subtotal = 0, cartItems = []) {
  // Free shipping promo code overrides everything
  if (promoCode && promoCode.toLowerCase() === VALID_PROMO_CODES.FREE.toLowerCase()) {
    return 0;
  }
  // Free shipping threshold: if > 0 and subtotal reaches it → free
  if (FREE_SHIPPING_THRESHOLD > 0 && subtotal >= FREE_SHIPPING_THRESHOLD) {
    return 0;
  }
  // Bundle free shipping: if any item in the cart has bundleFreeShipping flag → free
  if (Array.isArray(cartItems) && cartItems.some(item => item.bundleFreeShipping === true)) {
    return 0;
  }
  return SHIPPING_COST;
}

/**
 * Calculate total amount including shipping
 * @param {number} subtotal - Subtotal amount
 * @param {number} shipping - Shipping cost
 * @returns {number} Total amount
 */
export function calculateTotal(subtotal, shipping) {
  return subtotal + shipping;
}

/**
 * Calculate all totals at once (optimized)
 * Useful when you need all calculations and want to avoid multiple calculations
 * @param {Array} cartItems - Array of items with price and qty
 * @param {string} promoCode - Applied promo code (optional)
 * @returns {object} Object with subtotal, shipping, and total
 */
export function calculateAllTotals(cartItems, promoCode = "") {
  const subtotal = calculateSubtotal(cartItems);
  const shipping = calculateShipping(promoCode, subtotal, cartItems);
  const total = calculateTotal(subtotal, shipping);
  
  return {
    subtotal,
    shipping,
    total,
  };
}

/**
 * Validate promo code and return applicable discount
 * @param {string} code - Promo code to validate
 * @returns {object} { isValid: boolean, discount: number, message: string }
 */
export function validatePromoCode(code) {
  if (!code) {
    return {
      isValid: false,
      discount: 0,
      message: "Please enter a promo code",
    };
  }

  const normalizedCode = code.toLowerCase().trim();

  // Check if code is valid
  if (normalizedCode === VALID_PROMO_CODES.FREE.toLowerCase()) {
    return {
      isValid: true,
      discount: SHIPPING_COST,
      message: "تم تفعيل الشحن المجاني بنجاح! 🎉",
      code: normalizedCode,
    };
  }

  return {
    isValid: false,
    discount: 0,
    message: "عذراً، هذا الكود غير صالح",
  };
}

/**
 * Format currency for display
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: EGP)
 * @returns {string} Formatted currency string (e.g., "100 EGP")
 */
export function formatCurrency(amount, currency = CURRENCY) {
  const formatted = parseFloat(amount).toFixed(2);
  return `${formatted} ${currency}`;
}

/**
 * Get shipping text for display (used in emails and UI)
 * @param {string} promoCode - Applied promo code
 * @param {boolean} includeEmoji - Whether to include emoji (default: true)
 * @returns {string} Formatted shipping text
 */
export function getShippingDisplayText(promoCode, includeEmoji = true) {
  const shipping = calculateShipping(promoCode);
  
  if (shipping === 0) {
    return includeEmoji ? `0 ${CURRENCY} (شحن مجاني 🎉)` : `0 ${CURRENCY}`;
  }
  
  return `${shipping} ${CURRENCY}`;
}