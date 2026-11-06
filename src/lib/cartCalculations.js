// ============================================
// 🛒 CART CALCULATIONS UTILITY
// Centralized calculations for cart operations
// Used by CartContext and API routes
// ============================================

import { SHIPPING_COST, FREE_SHIPPING_THRESHOLD, CURRENCY } from '@/lib/constants';
import { computeBestOffer, isFreeShippingRuleEligible } from '@/lib/offerEngine';
import { isFreeShippingThresholdMet } from '@/lib/shippingCalculations';

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
 * discount: الخصم النقدي الفائز، ويُخصم من subtotal قبل فحص حد الشحن المجاني.
 */
export function calculateShipping(promoResult = null, subtotal = 0, cartItems = [], shippingSettings = null, discount = 0) {
  const baseCost    = shippingSettings?.shippingCost         ?? SHIPPING_COST;
  const threshold   = shippingSettings?.freeShippingThreshold ?? FREE_SHIPPING_THRESHOLD;

  // 1. كود شحن مجاني
  if (promoResult?.freeShipping) return 0;

  // 2. حد الشحن المجاني العام بعد الخصم النقدي الفائز.
  if (isFreeShippingThresholdMet(subtotal, discount, threshold)) return 0;

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
 * Recalculate legacy promo codes against the current cart.
 * The initial validation response is not a permanent discount snapshot:
 * percent and fixed codes must follow cart quantity/product changes.
 *
 * Keep the same calculation semantics as /api/validate-promo and server checkout pricing.
 */
function calculateLegacyPromoDiscount(cartItems, promoResult, subtotal) {
  const storedDiscount = Math.max(0, Number(promoResult?.discountAmount) || 0);
  const value = Number(promoResult?.value);

  if (promoResult?.type === 'percent') {
    // Preserve compatibility with older promo payloads that did not include value.
    if (!Number.isFinite(value) || value <= 0) return storedDiscount;

    let applicableItems = Array.isArray(cartItems) ? cartItems : [];
    if (Array.isArray(promoResult.scope) && promoResult.scope.length > 0) {
      const scope = new Set(promoResult.scope.map(String));
      applicableItems = applicableItems.filter((item) => {
        const keys = [item?.id, item?.handle]
          .filter((key) => key !== undefined && key !== null && String(key) !== '')
          .map(String);
        return keys.some((key) => scope.has(key));
      });
    }

    const applicableSubtotal = applicableItems.reduce(
      (sum, item) => sum + (parseFloat(item?.price) || 0) * (parseInt(item?.qty) || 1),
      0
    );
    return Math.min(
      subtotal,
      Math.max(0, Math.round((applicableSubtotal * value) / 100))
    );
  }

  if (promoResult?.type === 'fixed') {
    if (!Number.isFinite(value) || value <= 0) return storedDiscount;

    let applicableItems = Array.isArray(cartItems) ? cartItems : [];
    if (Array.isArray(promoResult.scope) && promoResult.scope.length > 0) {
      const scope = new Set(promoResult.scope.map(String));
      applicableItems = applicableItems.filter((item) => {
        const keys = [item?.id, item?.handle]
          .filter((key) => key !== undefined && key !== null && String(key) !== '')
          .map(String);
        return keys.some((key) => scope.has(key));
      });
    }

    const applicableSubtotal = applicableItems.reduce(
      (sum, item) => sum + (parseFloat(item?.price) || 0) * (parseInt(item?.qty) || 1),
      0
    );
    return Math.min(applicableSubtotal, value);
  }

  return storedDiscount;
}

/**
 * offers: العروض النشطة من /api/offers (اختياري — لو مفيش، النتيجة نفس القديمة بالظبط)
 * بترجع كمان: discountSource ('promo' | 'first_order' | 'offer' | 'none') و appliedOffer
 * القاعدة: أفضل خصم واحد للعميل بين (الكود / خصم الطلب الأول) و(العروض).
 * العرض لازم يكون أعلى فعلاً عشان يكسب، وعند التعادل الخصم القديم هو اللي بيتطبق.
 */
export function calculateAllTotals(cartItems, promoResult = null, shippingSettings = null, isFirstOrder = false, offers = null, freeShippingRule = null) {
  // The purchased-items subtotal excludes any automatically added free gifts.
  const cartSubtotal = calculateSubtotal(cartItems);

  // قارن كل الخصومات النقدية فعلياً؛ لا تمنح الكود أولوية على خصم أكبر.
  // عند التعادل: promo ثم first_order ثم offer (ترتيب ثابت ومتوافق مع السيرفر).
  const promoDiscount =
    promoResult?.valid && promoResult.type !== 'free_shipping'
      ? promoResult.type === 'coupon_fixed'
        ? (() => {
            const scope = Array.isArray(promoResult.scope) ? promoResult.scope.map(String) : null;
            const excluded = Array.isArray(promoResult.excludedProductIds) ? promoResult.excludedProductIds.map(String) : [];
            const eligibleSubtotal = cartItems.reduce((sum, item) => {
              const keys = [item.id, item.handle].map(String);
              if (scope && !keys.some((key) => scope.includes(key))) return sum;
              if (keys.some((key) => excluded.includes(key))) return sum;
              if (promoResult.excludeDiscounted === true && Number(item.compareAtPrice) > Number(item.price)) return sum;
              return sum + (Number(item.price) || 0) * (Number(item.qty) || 0);
            }, 0);
            if (eligibleSubtotal < (Number(promoResult.minCart) || 0)) return 0;
            const amount = Number(promoResult.value) || 0;
            const cap = Number(promoResult.maxDiscount) > 0 ? Number(promoResult.maxDiscount) : amount;
            return Math.min(amount, cap, eligibleSubtotal);
          })()
        : calculateLegacyPromoDiscount(cartItems, promoResult, cartSubtotal)
      : 0;

  const firstOrderPercent = Number(shippingSettings?.firstOrderDiscount);
  const firstOrderDiscount =
    isFirstOrder &&
    shippingSettings?.firstOrderEnabled &&
    Number.isFinite(firstOrderPercent) &&
    firstOrderPercent > 0 &&
    firstOrderPercent <= 100
      ? Math.round((cartSubtotal * firstOrderPercent) / 100)
      : 0;

  const offerResult = computeBestOffer(cartItems, offers);
  const candidates = [
    { source: 'promo', discount: promoDiscount, rank: 1 },
    { source: 'first_order', discount: firstOrderDiscount, rank: 2 },
    { source: 'offer', discount: Math.max(0, Number(offerResult.discount) || 0), rank: 3 },
  ].filter((candidate) => candidate.discount > 0);

  candidates.sort((a, b) => b.discount - a.discount || a.rank - b.rank);
  const winner = candidates[0] || { source: 'none', discount: 0 };

  const discountSource = winner.source;
  const appliedOffer = discountSource === 'offer' ? offerResult.offer : null;

  // A buy-X-get-Y gift is an extra line, not a discounted unit from the paid cart.
  // Include its original value in the displayed subtotal, then subtract the benefit.
  const autoGiftSubtotal =
    discountSource === 'offer' && offerResult.offer?.type === 'buy_x_get_y'
      ? (offerResult.offerBenefits?.lines || []).reduce(
          (sum, line) => sum + line.discountedUnits.reduce(
            (lineSum, unit) => lineSum + (unit.autoAdded === true ? Math.max(0, Number(unit.originalPrice) || 0) : 0),
            0
          ),
          0
        )
      : 0;
  const subtotal = cartSubtotal + autoGiftSubtotal;
  const discount = Math.min(subtotal, Math.max(0, Math.round(winner.discount)));

  // شحن المنتجات المحددة مستقل عن الحد العام الذي يُحسب بعد الخصم النقدي.
  const freeShippingByRule = isFreeShippingRuleEligible(cartItems, freeShippingRule);
  const shipping = freeShippingByRule
    ? 0
    : calculateShipping(promoResult, subtotal, cartItems, shippingSettings, discount);
  const total = calculateTotal(subtotal, shipping, discount);
  return {
    subtotal,
    discount,
    shipping,
    total,
    discountSource,
    appliedOffer,
    appliedOffers: discountSource === 'offer' ? offerResult.appliedOffers : [],
    offerBenefits: discountSource === 'offer' ? offerResult.offerBenefits : null,
    freeShippingByRule,
  };
}

/** Format currency for display */
export function formatCurrency(amount, currency = CURRENCY) {
  return `${parseFloat(amount).toFixed(2)} ${currency}`;
}
