// ============================================
// 🎁 OFFER ENGINE
// دالة نقية (بدون React ولا Firebase ولا أي side effects)
// بتاخد السلة + العروض النشطة وترجع أفضل عرض واحد للعميل.
//
// القواعد:
//  - عرض واحد فقط بيتطبق (الأعلى خصماً للعميل) — العروض ما بتتجمعش.
//  - الهدية المجانية: مرة واحدة لكل منتج مؤهل، ولا تُجمع كميات منتجات مختلفة.
//  - خصم النسبة: عند بلوغ N قطع مؤهلة، على أرخص وحدة مؤهلة مرة واحدة لكل طلب.
//  - الخصم الناتج رقم صحيح (الواجهة بتعرضه بـ ".00").
//  - عند التعادل: priority الأقل أولاً، ثم id أبجدياً (نتيجة ثابتة).
// ============================================

export const OFFER_TYPES = {
  BUY_X_GET_Y: 'buy_x_get_y',     // اشتري X وخد Y مجاناً (الأرخص في كل مجموعة)
  NTH_PERCENT: 'nth_percent',     // خصم % مرة واحدة على أرخص وحدة عند بلوغ N قطع مؤهلة
  CART_PERCENT: 'cart_percent',   // خصم % على إجمالي المنتجات المؤهلة
  CART_FIXED: 'cart_fixed',       // خصم مبلغ ثابت على إجمالي المنتجات المؤهلة
  FREE_SHIPPING: 'free_shipping', // شحن مجاني فقط (منفعة مستقلة عن الخصم النقدي)
};

const DEFAULT_PRIORITY = 100;
const MAX_UNITS_PER_ITEM = 1000; // حماية من سلة معدّلة يدوياً

/** تاريخ اليوم بتوقيت القاهرة بصيغة YYYY-MM-DD */
export function cairoDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** YYYY-MM-DD من نص التاريخ، أو null لو مفيش حد، أو undefined لو القيمة غير صالحة */
function dayOf(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return undefined;
}

/** هل العرض نشط الآن؟ (active=true + داخل فترته بتوقيت القاهرة، شامل أول وآخر يوم) */
export function isOfferLive(offer, now = new Date()) {
  if (!offer || offer.active !== true) return false;
  const start = dayOf(offer.startsAt);
  const end = dayOf(offer.endsAt);
  if (start === undefined || end === undefined) return false; // تاريخ غير مفهوم → العرض متوقف للأمان
  const today = cairoDateString(now);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function toList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function isDiscountedItem(item) {
  const price = parseFloat(item.price) || 0;
  const compareAt = parseFloat(item.compareAtPrice);
  return Number.isFinite(compareAt) && compareAt > price;
}

/** هل القطعة مؤهلة للعرض؟ */
function isItemEligible(item, offer) {
  const price = parseFloat(item.price) || 0;
  const qty = parseInt(item.qty) || 0;
  if (price <= 0 || qty <= 0) return false;

  const keys = [item.productId, item.id, item.productHandle, item.handle]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(String);

  const excluded = toList(offer.excludedProductIds);
  if (excluded.length > 0 && keys.some((k) => excluded.includes(k))) return false;

  if (offer.productScope === 'selected') {
    const selected = toList(offer.productIds);
    if (!keys.some((k) => selected.includes(k))) return false;
  }

  // Discounted products remain eligible by default; only an explicit true excludes them.
  if (offer.excludeDiscounted === true && isDiscountedItem(item)) return false;

  return true;
}

/** هل يوجد منتج مؤهل، وهل مجموع المنتجات المؤهلة يحقق الحد الأدنى؟ */
function isOfferApplicable(cartItems, offer) {
  const eligible = cartItems.filter((item) => isItemEligible(item, offer));
  if (eligible.length === 0) return false;

  const eligibleSubtotal = eligible.reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0),
    0
  );
  const minCart = Number(offer.minCart) || 0;
  return minCart <= 0 || eligibleSubtotal >= minCart;
}

/** وحدات القطع المؤهلة مرتبة من الأغلى للأرخص */
function expandUnits(items) {
  const units = [];
  for (const item of items) {
    const price = parseFloat(item.price) || 0;
    const qty = Math.min(parseInt(item.qty) || 0, MAX_UNITS_PER_ITEM);
    for (let i = 0; i < qty; i++) units.push(price);
  }
  return units.sort((a, b) => b - a);
}

/** Product identity shared by cart lines with different colors/sizes. */
function getProductGroupKey(item) {
  const identity = [item?.productId, item?.productHandle, item?.handle, item?.id]
    .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return identity === undefined ? null : String(identity).trim();
}

/** Keep separate unidentified cart lines from accidentally qualifying together. */
function groupItemsByProduct(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    const key = getProductGroupKey(item) || `__cart_line_${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

/** One free-gift award per eligible product, regardless of its quantity. */
function sumBuyXGetYBenefit(items, buyQty, getQty) {
  let total = 0;
  for (const productItems of groupItemsByProduct(items).values()) {
    total += sumTieredBenefit(expandUnits(productItems), buyQty + getQty, getQty, 1, 1);
  }
  return total;
}

/**
 * مجموعات متتالية من الأغلى للأرخص، بحجم groupSize.
 * في كل مجموعة كاملة، آخر benefitCount قطع (الأرخص) هي اللي بتاخد الميزة.
 * بترجع مجموع الميزة: factor = 1 (مجاناً) أو percent/100.
 */
function sumTieredBenefit(units, groupSize, benefitCount, factor, maxUsesPerOrder = 1) {
  const availableGroups = Math.floor(units.length / groupSize);
  const groups = Math.min(availableGroups, maxUsesPerOrder);
  let total = 0;
  for (let g = 0; g < groups; g++) {
    const start = g * groupSize;
    for (let k = groupSize - benefitCount; k < groupSize; k++) {
      total += units[start + k] * factor;
    }
  }
  return total;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * WIND policy: nth-percent grants its benefit once per order only.
 * Buy-X-get-Y uses a separate once-per-product rule.
 * Legacy maxUsesPerOrder values are intentionally ignored.
 */
function getMaxUsesPerOrder() {
  return 1;
}

function toPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : NaN;
}

/** خصم عرض واحد على السلة (رقم صحيح >= 0) */
export function computeOfferDiscount(cartItems, offer) {
  if (!Array.isArray(cartItems) || !offer) return 0;

  const eligible = cartItems.filter((item) => isItemEligible(item, offer));
  if (eligible.length === 0) return 0;

  const eligibleSubtotal = eligible.reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0),
    0
  );

  const minCart = Number(offer.minCart) || 0;
  if (minCart > 0 && eligibleSubtotal < minCart) return 0;

  const cfg = offer.config || {};
  let raw = 0;

  switch (offer.type) {
    case OFFER_TYPES.BUY_X_GET_Y: {
      const buy = toInt(cfg.buyQty);
      const get = toInt(cfg.getQty);
      if (!(buy >= 1) || !(get >= 1)) return 0;
      raw = sumBuyXGetYBenefit(eligible, buy, get);
      break;
    }
    case OFFER_TYPES.NTH_PERCENT: {
      const nth = toInt(cfg.nth);
      const pct = toPercent(cfg.percent);
      const maxUses = getMaxUsesPerOrder();
      if (!(nth >= 2) || Number.isNaN(pct) || maxUses === null) return 0;

      const eligibleUnitCount = eligible.reduce(
        (sum, item) => sum + Math.min(parseInt(item.qty) || 0, MAX_UNITS_PER_ITEM),
        0
      );
      if (eligibleUnitCount < nth) return 0;

      const cheapestUnitPrice = eligible.reduce(
        (cheapest, item) => Math.min(cheapest, parseFloat(item.price) || 0),
        Infinity
      );
      raw = cheapestUnitPrice * pct / 100;
      break;
    }
    case OFFER_TYPES.CART_PERCENT: {
      const pct = toPercent(cfg.percent);
      if (Number.isNaN(pct)) return 0;
      raw = (eligibleSubtotal * pct) / 100;
      break;
    }
    case OFFER_TYPES.CART_FIXED: {
      const amount = Number(cfg.amount);
      if (!Number.isFinite(amount) || amount <= 0) return 0;
      raw = amount;
      break;
    }
    case OFFER_TYPES.FREE_SHIPPING: {
      raw = 0;
      break;
    }
    default:
      return 0;
  }

  const maxDiscount = Number(offer.maxDiscount) || 0;
  if (maxDiscount > 0) raw = Math.min(raw, maxDiscount);
  raw = Math.min(raw, eligibleSubtotal);

  let rounded = Math.round(raw);
  if (rounded > eligibleSubtotal) rounded = Math.floor(eligibleSubtotal);
  return Math.max(0, rounded);
}

/**
 * يقيّم كل عرض منفردًا ثم يختار أعلى توفير للعميل.
 * لا يوجد دمج بين عرضين تلقائيين، حتى لو كانت مستندات قديمة تحتوي
 * على stackWithOfferIds. عند التعادل: الأولوية الأقل ثم id أبجديًا.
 */
export function computeBestOffer(cartItems, offers, now = new Date()) {
  const none = { discount: 0, offer: null, appliedOffers: [], offerBenefits: null, candidates: [], freeShipping: false };
  if (!Array.isArray(cartItems) || cartItems.length === 0 || !Array.isArray(offers) || offers.length === 0) return none;

  const liveOffers = offers.filter((offer) =>
    offer &&
    offer.type !== OFFER_TYPES.FREE_SHIPPING &&
    offer.type !== "coupon_fixed" &&
    isOfferLive(offer, now)
  );
  const candidates = [];

  for (const offer of liveOffers) {
    const benefits = computeOfferBenefits(cartItems, offer, now);
    if (benefits.discount <= 0) continue;

    const selectedOffer = {
      id: String(offer.id ?? ''),
      name: offer.name || '',
      type: offer.type,
      config: offer.config || {},
      discount: benefits.discount,
    };
    const offerBenefits = {
      ...benefits,
      offerIds: [selectedOffer.id],
      offers: [selectedOffer],
    };

    candidates.push({
      id: selectedOffer.id,
      name: selectedOffer.name,
      type: selectedOffer.type,
      discount: benefits.discount,
      priority: Number.isFinite(Number(offer.priority)) ? Number(offer.priority) : DEFAULT_PRIORITY,
      appliedOffers: [selectedOffer],
      offerBenefits,
    });
  }

  candidates.sort((a, b) =>
    b.discount - a.discount ||
    a.priority - b.priority ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  const best = candidates[0];
  if (!best) return none;

  return {
    discount: best.discount,
    offer: { id: best.id, name: best.name, type: best.type },
    appliedOffers: best.appliedOffers,
    offerBenefits: best.offerBenefits,
    candidates: candidates.map(({ id, name, type, discount, priority }) => ({ id, name, type, discount, priority })),
    freeShipping: false,
  };
}

/**
 * Build a deterministic, per-unit explanation of the winning offer.
 * This is the canonical per-unit allocation for the selected offer.
 * Its total is used by both the cart and the server checkout quote.
 *
 * Each returned line maps back to one original cart line. Units receiving
 * a benefit are listed separately so the cart can render gifts/discounted
 * pieces without mutating the customer's persisted cart.
 */
export function computeOfferBenefits(cartItems, offer, now = new Date()) {
  if (!Array.isArray(cartItems) || !offer || !isOfferLive(offer, now)) {
    return { offerId: offer?.id ? String(offer.id) : null, name: offer?.name || '', type: offer?.type || null, config: offer?.config || {}, discount: 0, lines: [] };
  }

  const eligibleUnits = [];
  cartItems.forEach((item, cartIndex) => {
    if (!isItemEligible(item, offer)) return;
    const qty = Math.min(parseInt(item.qty) || 0, MAX_UNITS_PER_ITEM);
    const price = parseFloat(item.price) || 0;
    for (let unitIndex = 0; unitIndex < qty; unitIndex += 1) {
      eligibleUnits.push({ cartIndex, unitIndex, price, rawDiscount: 0 });
    }
  });
  if (!eligibleUnits.length) {
    return { offerId: String(offer.id ?? ''), name: offer.name || '', type: offer.type, config: offer.config || {}, discount: 0, lines: [] };
  }

  const eligibleSubtotal = eligibleUnits.reduce((sum, unit) => sum + unit.price, 0);
  const minCart = Number(offer.minCart) || 0;
  if (minCart > 0 && eligibleSubtotal < minCart) {
    return { offerId: String(offer.id ?? ''), name: offer.name || '', type: offer.type, config: offer.config || {}, discount: 0, lines: [] };
  }

  const cfg = offer.config || {};

  switch (offer.type) {
    case OFFER_TYPES.BUY_X_GET_Y: {
      const buy = toInt(cfg.buyQty);
      const get = toInt(cfg.getQty);
      if (!(buy >= 1) || !(get >= 1)) break;
      const groupSize = buy + get;
      const unitsByProduct = new Map();
      for (const unit of eligibleUnits) {
        const productKey = getProductGroupKey(cartItems[unit.cartIndex]) || `__cart_line_${unit.cartIndex}`;
        if (!unitsByProduct.has(productKey)) unitsByProduct.set(productKey, []);
        unitsByProduct.get(productKey).push(unit);
      }
      for (const productUnits of unitsByProduct.values()) {
        const orderedProductUnits = [...productUnits].sort(
          (a, b) => b.price - a.price || a.cartIndex - b.cartIndex || a.unitIndex - b.unitIndex
        );
        if (orderedProductUnits.length < groupSize) continue;
        // One qualifying group per product. Extra quantity does not create another gift.
        for (let offset = groupSize - get; offset < groupSize; offset += 1) {
          orderedProductUnits[offset].rawDiscount = orderedProductUnits[offset].price;
        }
      }
      break;
    }
    case OFFER_TYPES.NTH_PERCENT: {
      const nth = toInt(cfg.nth);
      const percent = toPercent(cfg.percent);
      if (!(nth >= 2) || Number.isNaN(percent) || eligibleUnits.length < nth) break;

      const cheapestUnit = [...eligibleUnits].sort(
        (a, b) => a.price - b.price || a.cartIndex - b.cartIndex || a.unitIndex - b.unitIndex
      )[0];
      if (cheapestUnit) cheapestUnit.rawDiscount = cheapestUnit.price * percent / 100;
      break;
    }
    case OFFER_TYPES.CART_PERCENT: {
      const percent = toPercent(cfg.percent);
      if (Number.isNaN(percent)) break;
      eligibleUnits.forEach((unit) => { unit.rawDiscount = unit.price * percent / 100; });
      break;
    }
    case OFFER_TYPES.CART_FIXED: {
      const amount = Number(cfg.amount);
      if (!Number.isFinite(amount) || amount <= 0) break;
      eligibleUnits.forEach((unit) => { unit.rawDiscount = amount * unit.price / eligibleSubtotal; });
      break;
    }
    default:
      break;
  }

  const rawTotal = eligibleUnits.reduce((sum, unit) => sum + unit.rawDiscount, 0);
  const maxDiscount = Number(offer.maxDiscount) || 0;
  const cappedTotal = maxDiscount > 0 ? Math.min(rawTotal, maxDiscount) : rawTotal;
  let roundedTargetDiscount = Math.round(Math.min(cappedTotal, eligibleSubtotal));
  if (roundedTargetDiscount > eligibleSubtotal) roundedTargetDiscount = Math.floor(eligibleSubtotal);
  const targetDiscount = Math.max(0, roundedTargetDiscount);
  const rawSum = eligibleUnits.reduce((sum, unit) => sum + unit.rawDiscount, 0);

  // Allocate integer-piaster totals deterministically, preserving the exact
  // discount returned by computeOfferDiscount even after maxDiscount caps.
  const centsTarget = targetDiscount * 100;
  const allocations = eligibleUnits.map((unit, index) => {
    const exact = rawSum > 0 ? (unit.rawDiscount / rawSum) * centsTarget : 0;
    const floor = Math.floor(exact);
    return { index, cents: floor, remainder: exact - floor };
  });
  let remainingCents = centsTarget - allocations.reduce((sum, entry) => sum + entry.cents, 0);
  allocations.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < allocations.length && remainingCents > 0; i += 1, remainingCents -= 1) {
    allocations[i].cents += 1;
  }
  const centsByUnit = new Map(allocations.map((entry) => [entry.index, entry.cents]));

  const byCartLine = new Map();
  eligibleUnits.forEach((unit, index) => {
    const cents = centsByUnit.get(index) || 0;
    if (cents <= 0) return;
    if (!byCartLine.has(unit.cartIndex)) byCartLine.set(unit.cartIndex, []);
    const discount = cents / 100;
    const finalPrice = Math.max(0, Math.round((unit.price * 100 - cents)) / 100);
    const free = cents >= Math.round(unit.price * 100);
    byCartLine.get(unit.cartIndex).push({
      unitIndex: unit.unitIndex,
      originalPrice: unit.price,
      discount,
      finalPrice,
      free,
      benefits: [{
        offerId: String(offer.id ?? ''),
        offerName: offer.name || '',
        offerType: offer.type,
        config: offer.config || {},
        originalPrice: unit.price,
        discount,
        finalPrice,
        free,
      }],
    });
  });

  const lines = [];
  for (const [cartIndex, discountedUnits] of byCartLine.entries()) {
    const item = cartItems[cartIndex];
    lines.push({
      cartIndex,
      itemId: String(item.id ?? item.productId ?? item.handle ?? ''),
      regularQty: Math.max(0, (parseInt(item.qty) || 0) - discountedUnits.length),
      discountedUnits,
    });
  }

  const allocatedDiscount = lines.reduce(
    (sum, line) => sum + line.discountedUnits.reduce((lineSum, unit) => lineSum + unit.discount, 0),
    0
  );
  return {
    offerId: String(offer.id ?? ''),
    name: offer.name || '',
    type: offer.type,
    config: offer.config || {},
    discount: Math.round(allocatedDiscount * 100) / 100,
    lines,
  };
}



/** تحقق قاعدة الشحن المجاني المستقلة عن العروض النقدية. */
export function isFreeShippingRuleEligible(cartItems, rule) {
  if (!rule || rule.enabled !== true || rule.scope !== "selected" || !Array.isArray(cartItems) || cartItems.length === 0) return false;
  const selectedIds = new Set(Array.isArray(rule.productIds) ? rule.productIds.map(String) : []);
  if (!selectedIds.size) return false;
  const eligibleItems = cartItems.filter((item) => {
    const identifiers = [item.id, item.productId, item.handle, item.productHandle]
      .filter((value) => value !== undefined && value !== null && String(value) !== "")
      .map(String);
    return identifiers.some((identifier) => selectedIds.has(identifier));
  });
  if (!eligibleItems.length) return false;
  if (rule.condition === "quantity") {
    const quantity = eligibleItems.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
    return quantity >= Math.max(1, Math.floor(Number(rule.minQuantity) || 1));
  }
  if (rule.condition === "subtotal") {
    const subtotal = eligibleItems.reduce(
      (sum, item) => sum + Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.qty) || 0), 0
    );
    const minimum = Math.max(0, Number(rule.minSubtotal) || 0);
    return minimum > 0 && subtotal >= minimum;
  }
  return false;
}

/**
 * Wrapper للتوافق مع أي استدعاء قديم: يعيد بيانات أفضل عرض منفرد فقط.
 * الاسم تاريخي؛ الدمج بين عروض التسوق التلقائية متوقف عمدًا.
 */
export function computeStackedOfferBenefits(cartItems, offers, now = new Date()) {
  const result = computeBestOffer(cartItems, offers, now);
  return result.offerBenefits || {
    offerId: null,
    offerIds: [],
    name: "",
    type: null,
    config: {},
    offers: [],
    discount: 0,
    lines: [],
  };
}
