// ============================================
// 🛒 CART CALCULATIONS UTILITY
// Centralized calculations for cart operations
// Used by CartContext and API routes
// ============================================

import { SHIPPING_COST, FREE_SHIPPING_THRESHOLD, CURRENCY } from '@/lib/constants';
import { computeBestOffer } from '@/lib/offerEngine';

/**
 * Calculate subtotal from cart items
 */
export function calculateSubtotal(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return 0;
  return cartItems.reduce((acc, item) => {
    return acc + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0);
  }, 0);
}

/**
 * Calculate shipping cost.
 * promoResult: نتيجة validate-promo من الـ server { freeShipping, discountAmount, type }
 * shippingSettings: { shippingCost, freeShippingThreshold } من Firestore — يسقط على constants كـ fallback
 */
export function calculateShipping(promoResult = null, subtotal = 0, cartItems = [], shippingSettings = null) {
  const baseCost    = shippingSettings?.shippingCost         ?? SHIPPING_COST;
  const threshold   = shippingSettings?.freeShippingThreshold ?? FREE_SHIPPING_THRESHOLD;

  // 1. كود شحن مجاني
  if (promoResult?.freeShipping) return 0;

  // 2. حد الشحن المجاني العام (threshold > 0)
  if (threshold > 0 && subtotal >= threshold) return 0;

  // 3. شحن مجاني من الباقة
  if (Array.isArray(cartItems) && cartItems.some(item => item.bundleFreeShipping === true)) return 0;

  return baseCost;
}

/**
 * Calculate discount amount from promoResult OR first-order discount
 * الأولوية: كود الخصم > خصم الطلب الأول (لا يتجمعون)
 */
export function calculateDiscount(promoResult = null, subtotal = 0, isFirstOrder = false, shippingSettings = null) {
  // كود خصم نسبة أو مبلغ ثابت
  if (promoResult?.valid && promoResult.type !== 'free_shipping') {
    return promoResult.discountAmount || 0;
  }
  // خصم الطلب الأول (تلقائي — بدون كود)
  if (isFirstOrder && shippingSettings?.firstOrderEnabled && shippingSettings?.firstOrderDiscount > 0) {
    return Math.round((subtotal * shippingSettings.firstOrderDiscount) / 100);
  }
  return 0;
}

export function calculateTotal(subtotal, shipping, discount = 0) {
  return Math.max(0, subtotal - discount + shipping);
}

// مصدر الخصم الأساسي (بدون العروض) — نفس شروط calculateDiscount بالظبط
function getBaseDiscountSource(promoResult = null, isFirstOrder = false, shippingSettings = null) {
  if (promoResult?.valid && promoResult.type !== 'free_shipping') return 'promo';
  if (isFirstOrder && shippingSettings?.firstOrderEnabled && shippingSettings?.firstOrderDiscount > 0) return 'first_order';
  return 'none';
}

/**
 * offers: العروض النشطة من /api/offers (اختياري — لو مفيش، النتيجة نفس القديمة بالظبط)
 * بترجع كمان: discountSource ('promo' | 'first_order' | 'offer' | 'none') و appliedOffer
 * القاعدة: أفضل خصم واحد للعميل بين (الكود / خصم الطلب الأول) و(العروض).
 * العرض لازم يكون أعلى فعلاً عشان يكسب، وعند التعادل الخصم القديم هو اللي بيتطبق.
 */
export function calculateAllTotals(cartItems, promoResult = null, shippingSettings = null, isFirstOrder = false, offers = null) {
  const subtotal = calculateSubtotal(cartItems);
  const baseDiscount = calculateDiscount(promoResult, subtotal, isFirstOrder, shippingSettings);
  const offerResult = computeBestOffer(cartItems, offers);
  const offerWins = offerResult.discount > baseDiscount;
  const discount = offerWins ? offerResult.discount : baseDiscount;
  const discountSource = offerWins ? 'offer' : getBaseDiscountSource(promoResult, isFirstOrder, shippingSettings);
  const appliedOffer = offerWins ? offerResult.offer : null;
  // الشحن يُحسب على الـ subtotal الكامل (قبل الخصم)
  // خصم المنتجات لا يلغي شحن مجاني حققه العميل بإجمالي طلبه
  const shipping  = calculateShipping(promoResult, subtotal, cartItems, shippingSettings);
  const total     = calculateTotal(subtotal, shipping, discount);
  return { subtotal, discount, shipping, total, discountSource, appliedOffer };
}

/** Format currency for display */
export function formatCurrency(amount, currency = CURRENCY) {
  return `${parseFloat(amount).toFixed(2)} ${currency}`;
}
