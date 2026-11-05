// ============================================
// 🎁 OFFER ENGINE
// دالة نقية (بدون React ولا Firebase ولا أي side effects)
// بتاخد السلة + العروض النشطة وترجع أفضل عرض واحد للعميل.
//
// القواعد:
//  - عرض واحد فقط بيتطبق (الأعلى خصماً للعميل) — العروض ما بتتجمعش.
//  - الخصم دايماً على القطع الأرخص في كل مجموعة.
//  - الخصم الناتج رقم صحيح (الواجهة بتعرضه بـ ".00").
//  - عند التعادل: priority الأقل أولاً، ثم id أبجدياً (نتيجة ثابتة).
// ============================================

export const OFFER_TYPES = {
  BUY_X_GET_Y: 'buy_x_get_y',     // اشتري X وخد Y مجاناً (الأرخص في كل مجموعة)
  NTH_PERCENT: 'nth_percent',     // خصم % على القطعة رقم N (الأرخص في كل مجموعة)
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

  const keys = [item.id, item.handle]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(String);

  const excluded = toList(offer.excludedProductIds);
  if (excluded.length > 0 && keys.some((k) => excluded.includes(k))) return false;

  if (offer.productScope === 'selected') {
    const selected = toList(offer.productIds);
    if (!keys.some((k) => selected.includes(k))) return false;
  }

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

/**
 * مجموعات متتالية من الأغلى للأرخص، بحجم groupSize.
 * في كل مجموعة كاملة، آخر benefitCount قطع (الأرخص) هي اللي بتاخد الميزة.
 * بترجع مجموع الميزة: factor = 1 (مجاناً) أو percent/100.
 */
function sumTieredBenefit(units, groupSize, benefitCount, factor) {
  const groups = Math.floor(units.length / groupSize);
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
      raw = sumTieredBenefit(expandUnits(eligible), buy + get, get, 1);
      break;
    }
    case OFFER_TYPES.NTH_PERCENT: {
      const nth = toInt(cfg.nth);
      const pct = toPercent(cfg.percent);
      if (!(nth >= 2) || Number.isNaN(pct)) return 0;
      raw = sumTieredBenefit(expandUnits(eligible), nth, 1, pct / 100);
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
 * يختار أفضل مجموعة عروض: عرض أساسي + العروض التي اختار الأدمن دمجها معه.
 * كل عرض إضافي يُحسب على السعر المتبقي للوحدة بعد العروض السابقة.
 */
export function computeBestOffer(cartItems, offers, now = new Date()) {
  const none = { discount: 0, offer: null, appliedOffers: [], offerBenefits: null, candidates: [], freeShipping: false };
  if (!Array.isArray(cartItems) || cartItems.length === 0 || !Array.isArray(offers) || offers.length === 0) return none;
  const liveOffers = offers.filter((offer) => offer && offer.type !== OFFER_TYPES.FREE_SHIPPING && isOfferLive(offer, now));
  const candidates = [];
  for (const primary of liveOffers) {
    if (computeOfferBenefits(cartItems, primary, now).discount <= 0) continue;
    const allowedIds = new Set(Array.isArray(primary.stackWithOfferIds) ? primary.stackWithOfferIds.map(String) : []);
    const additionalOffers = liveOffers
      .filter((offer) => String(offer.id) !== String(primary.id) && allowedIds.has(String(offer.id)))
      .sort((a, b) =>
        (Number.isFinite(Number(a.priority)) ? Number(a.priority) : DEFAULT_PRIORITY) - (Number.isFinite(Number(b.priority)) ? Number(b.priority) : DEFAULT_PRIORITY) ||
        String(a.id).localeCompare(String(b.id))
      );
    const benefits = computeStackedOfferBenefits(cartItems, [primary, ...additionalOffers], now);
    if (benefits.discount <= 0 || !benefits.offers.some((offer) => String(offer.id) === String(primary.id))) continue;
    candidates.push({
      id: String(primary.id ?? ''), name: primary.name || '', type: primary.type,
      discount: benefits.discount,
      priority: Number.isFinite(Number(primary.priority)) ? Number(primary.priority) : DEFAULT_PRIORITY,
      appliedOffers: benefits.offers, offerBenefits: benefits,
    });
  }
  candidates.sort((a, b) =>
    b.discount - a.discount || a.priority - b.priority ||
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
 * This is presentation data only; computeOfferDiscount remains the source
 * for the authoritative total discount.
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
  const ordered = [...eligibleUnits].sort(
    (a, b) => b.price - a.price || a.cartIndex - b.cartIndex || a.unitIndex - b.unitIndex
  );

  switch (offer.type) {
    case OFFER_TYPES.BUY_X_GET_Y: {
      const buy = toInt(cfg.buyQty);
      const get = toInt(cfg.getQty);
      if (!(buy >= 1) || !(get >= 1)) break;
      const groupSize = buy + get;
      const groups = Math.floor(ordered.length / groupSize);
      for (let group = 0; group < groups; group += 1) {
        const start = group * groupSize;
        for (let offset = groupSize - get; offset < groupSize; offset += 1) {
          const unit = ordered[start + offset];
          unit.rawDiscount = unit.price;
        }
      }
      break;
    }
    case OFFER_TYPES.NTH_PERCENT: {
      const nth = toInt(cfg.nth);
      const percent = toPercent(cfg.percent);
      if (!(nth >= 2) || Number.isNaN(percent)) break;
      const groups = Math.floor(ordered.length / nth);
      for (let group = 0; group < groups; group += 1) {
        const unit = ordered[(group * nth) + nth - 1];
        unit.rawDiscount = unit.price * percent / 100;
      }
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
  const targetDiscount = Math.max(0, Math.min(
    eligibleSubtotal,
    Math.round(Math.min(cappedTotal, eligibleSubtotal))
  ));
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
    byCartLine.get(unit.cartIndex).push({
      unitIndex: unit.unitIndex,
      originalPrice: unit.price,
      discount: cents / 100,
      finalPrice: Math.max(0, Math.round((unit.price * 100 - cents)) / 100),
      free: cents >= Math.round(unit.price * 100),
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
  if (!rule || rule.enabled !== true || !Array.isArray(cartItems) || cartItems.length === 0) return false;
  if (rule.scope === "store") return true;
  if (rule.scope !== "selected") return false;
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

/** يحسب العروض المسموح بدمجها بالتتابع على السعر المتبقي لكل وحدة. */
export function computeStackedOfferBenefits(cartItems, offers, now = new Date()) {
  const selectedOffers = Array.isArray(offers)
    ? offers.filter((offer) => offer && offer.type !== OFFER_TYPES.FREE_SHIPPING && isOfferLive(offer, now))
    : [];
  const units = [];
  (Array.isArray(cartItems) ? cartItems : []).forEach((item, cartIndex) => {
    const quantity = Math.min(Math.max(0, parseInt(item.qty) || 0), MAX_UNITS_PER_ITEM);
    const originalPrice = Math.max(0, parseFloat(item.price) || 0);
    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      units.push({ item, cartIndex, unitIndex, originalPrice, currentPrice: originalPrice, totalDiscount: 0, benefits: [] });
    }
  });
  const appliedOffers = [];
  for (const offer of selectedOffers) {
    if (!units.length) break;
    const workingCart = units.map((unit) => ({ ...unit.item, price: unit.currentPrice, qty: 1 }));
    const step = computeOfferBenefits(workingCart, offer, now);
    if (step.discount <= 0) continue;
    let appliedThisOffer = 0;
    for (const line of step.lines) {
      for (const benefit of line.discountedUnits) {
        const unit = units[line.cartIndex];
        if (!unit) continue;
        const beforeCents = Math.max(0, Math.round(unit.currentPrice * 100));
        const discountCents = Math.min(beforeCents, Math.max(0, Math.round(benefit.discount * 100)));
        if (discountCents <= 0) continue;
        const discount = discountCents / 100;
        const finalPrice = Math.max(0, (beforeCents - discountCents) / 100);
        unit.currentPrice = finalPrice;
        unit.totalDiscount = Math.round((unit.totalDiscount + discount) * 100) / 100;
        unit.benefits.push({
          offerId: String(offer.id ?? ''), offerName: offer.name || '', offerType: offer.type,
          config: offer.config || {}, originalPrice: beforeCents / 100, discount, finalPrice, free: finalPrice <= 0,
        });
        appliedThisOffer += discount;
      }
    }
    if (appliedThisOffer > 0) {
      appliedOffers.push({
        id: String(offer.id ?? ''), name: offer.name || '', type: offer.type,
        config: offer.config || {}, discount: Math.round(appliedThisOffer * 100) / 100,
      });
    }
  }
  const grouped = new Map();
  units.forEach((unit) => {
    if (unit.totalDiscount <= 0) return;
    if (!grouped.has(unit.cartIndex)) grouped.set(unit.cartIndex, []);
    grouped.get(unit.cartIndex).push({
      unitIndex: unit.unitIndex, originalPrice: unit.originalPrice, discount: unit.totalDiscount,
      finalPrice: unit.currentPrice, free: unit.currentPrice <= 0, benefits: unit.benefits,
    });
  });
  const lines = [];
  for (const [cartIndex, discountedUnits] of grouped.entries()) {
    const item = cartItems[cartIndex];
    lines.push({
      cartIndex, itemId: String(item.id ?? item.productId ?? item.handle ?? ''),
      regularQty: Math.max(0, (parseInt(item.qty) || 0) - discountedUnits.length), discountedUnits,
    });
  }
  const discount = Math.round(units.reduce((sum, unit) => sum + unit.totalDiscount, 0) * 100) / 100;
  return {
    offerId: appliedOffers[0]?.id || null, offerIds: appliedOffers.map((offer) => offer.id),
    name: appliedOffers.map((offer) => offer.name).filter(Boolean).join(" + "),
    type: appliedOffers[0]?.type || null, config: appliedOffers[0]?.config || {},
    offers: appliedOffers, discount, lines,
  };
}
