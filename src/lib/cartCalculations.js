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

/**
 * offers: العروض النشطة من /api/offers (اختياري — لو مفيش، النتيجة نفس القديمة بالظبط)
 * بترجع كمان: discountSource ('promo' | 'first_order' | 'offer' | 'none') و appliedOffer
 * القاعدة: أفضل خصم واحد للعميل بين (الكود / خصم الطلب الأول) و(العروض).
 * العرض لازم يكون أعلى فعلاً عشان يكسب، وعند التعادل الخصم القديم هو اللي بيتطبق.
 */
export function calculateAllTotals(cartItems, promoResult = null, shippingSettings = null, isFirstOrder = false, offers = null) {
  const subtotal = calculateSubtotal(cartItems);

  // قارن كل الخصومات النقدية فعلياً؛ لا تمنح الكود أولوية على خصم أكبر.
  // عند التعادل: promo ثم first_order ثم offer (ترتيب ثابت ومتوافق مع السيرفر).
  const promoDiscount =
    promoResult?.valid && promoResult.type !== 'free_shipping'
      ? Math.max(0, Number(promoResult.discountAmount) || 0)
      : 0;

  const firstOrderPercent = Number(shippingSettings?.firstOrderDiscount);
  const firstOrderDiscount =
    isFirstOrder &&
    shippingSettings?.firstOrderEnabled &&
    Number.isFinite(firstOrderPercent) &&
    firstOrderPercent > 0 &&
    firstOrderPercent <= 100
      ? Math.round((subtotal * firstOrderPercent) / 100)
      : 0;

  const offerResult = computeBestOffer(cartItems, offers);
  const candidates = [
    { source: 'promo', discount: promoDiscount, rank: 1 },
    { source: 'first_order', discount: firstOrderDiscount, rank: 2 },
    { source: 'offer', discount: Math.max(0, Number(offerResult.discount) || 0), rank: 3 },
  ].filter((candidate) => candidate.discount > 0);

  candidates.sort((a, b) => b.discount - a.discount || a.rank - b.rank);
  const winner = candidates[0] || { source: 'none', discount: 0 };

  const discount = Math.min(subtotal, Math.max(0, Math.round(winner.discount)));
  const discountSource = winner.source;
  const appliedOffer = discountSource === 'offer' ? offerResult.offer : null;

  // الشحن المجاني المرفق بعرض لا ينتقل إلى كود أو خصم طلب أول فائز.
  // عرض الشحن المجاني المنفصل يعمل فقط عندما لا يوجد خصم آخر فائز.
  const offerFreeShippingApplies =
    offerResult.freeShipping &&
    (discountSource === 'offer' || (offerResult.offer?.type === 'free_shipping' && discountSource === 'none'));
  const shipping = offerFreeShippingApplies ? 0 : calculateShipping(promoResult, subtotal, cartItems, shippingSettings);
  const total = calculateTotal(subtotal, shipping, discount);
  return { subtotal, discount, shipping, total, discountSource, appliedOffer };
}

/** Format currency for display */
export function formatCurrency(amount, currency = CURRENCY) {
  return `${parseFloat(amount).toFixed(2)} ${currency}`;
}
