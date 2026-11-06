import { cairoDateString, isOfferLive } from "@/lib/offerDates";
import { computeCustomerChoiceGiftOffer } from "@/lib/customerChoiceGiftOffer";
export { cairoDateString, isOfferLive } from "@/lib/offerDates";

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
  BUY_X_GET_Y_SELECT_GIFT: 'buy_x_get_y_select_gift', // العميل يختار الهدايا بنفسه
  NTH_PERCENT: 'nth_percent',     // خصم % مرة واحدة على أرخص وحدة عند بلوغ N قطع مؤهلة
  CART_PERCENT: 'cart_percent',   // خصم % على إجمالي المنتجات المؤهلة
  CART_FIXED: 'cart_fixed',       // خصم مبلغ ثابت على إجمالي المنتجات المؤهلة
  FREE_SHIPPING: 'free_shipping', // شحن مجاني فقط (منفعة مستقلة عن الخصم النقدي)
};

const DEFAULT_PRIORITY = 100;
const MAX_UNITS_PER_ITEM = 1000; // حماية من سلة معدّلة يدوياً


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

/** Stable key for the editable color/size selection of an automatically added gift. */
export function getOfferGiftSelectionKey(offerId, item) {
  // Prefer the stable product handle so client cart lines and server-resolved
  // cart lines generate the same key even when their incoming IDs differ.
  const productKey = [
    item?.handle,
    item?.productHandle,
    item?.id,
    item?.productId,
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return `offer-gift:${String(offerId ?? "")}:${String(productKey ?? "product").trim()}`;
}

/** One automatically added free-gift award per eligible product, regardless of excess quantity. */
function sumBuyXGetYBenefit(items, buyQty, getQty) {
  let total = 0;
  for (const productItems of groupItemsByProduct(items).values()) {
    const units = expandUnits(productItems);
    if (units.length < buyQty) continue;

    // The customer only needs to buy X units. The Y gift units are additional.
    for (let index = 0; index < getQty; index += 1) {
      total += units[Math.max(0, units.length - 1 - index)];
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
export function computeOfferDiscount(cartItems, offer, giftSelections = []) {
  if (!Array.isArray(cartItems) || !offer) return 0;
  if (offer.type === OFFER_TYPES.BUY_X_GET_Y_SELECT_GIFT) {
    return computeCustomerChoiceGiftOffer(cartItems, giftSelections, offer).discount;
  }

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
export function computeBestOffer(cartItems, offers, now = new Date(), giftSelections = []) {
  const none = { discount: 0, offer: null, appliedOffers: [], offerBenefits: null, candidates: [], freeShipping: false, customerChoiceGiftStatus: null };
  if (!Array.isArray(cartItems) || cartItems.length === 0 || !Array.isArray(offers) || offers.length === 0) return none;

  const liveOffers = offers.filter((offer) =>
    offer &&
    offer.type !== OFFER_TYPES.FREE_SHIPPING &&
    offer.type !== "coupon_fixed" &&
    isOfferLive(offer, now)
  );
  const candidates = [];
  const giftStatusCandidates = [];

  for (const offer of liveOffers) {
    const benefits = computeOfferBenefits(cartItems, offer, now, giftSelections);
    if (benefits.customerChoiceGiftStatus) {
      giftStatusCandidates.push({
        status: benefits.customerChoiceGiftStatus,
        priority: Number.isFinite(Number(offer.priority)) ? Number(offer.priority) : DEFAULT_PRIORITY,
        id: String(offer.id ?? ""),
      });
    }
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
  giftStatusCandidates.sort((a, b) =>
    a.priority - b.priority ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const customerChoiceGiftStatus = giftStatusCandidates[0]?.status || null;

  const best = candidates[0];
  if (!best) return { ...none, customerChoiceGiftStatus };

  return {
    discount: best.discount,
    offer: { id: best.id, name: best.name, type: best.type },
    appliedOffers: best.appliedOffers,
    offerBenefits: best.offerBenefits,
    candidates: candidates.map(({ id, name, type, discount, priority }) => ({ id, name, type, discount, priority })),
    freeShipping: false,
    customerChoiceGiftStatus,
  };
}

function buildCustomerChoiceGiftBenefits(cartItems, giftSelections, offer, evaluation) {
  const offerId = String(offer.id ?? "");
  const config = offer.config || {};
  const status = {
    offerId,
    offerName: offer.name || "",
    eligiblePurchaseQty: evaluation.eligiblePurchaseQty,
    requiredGiftQty: evaluation.requiredGiftQty,
    selectedGiftQty: evaluation.selectedGiftQty,
    complete: evaluation.complete,
  };
  const base = {
    offerId,
    name: offer.name || "",
    type: offer.type,
    config,
    discount: 0,
    lines: [],
    giftLines: [],
    customerChoiceGiftStatus: status,
  };

  if (!evaluation.complete) return base;

  const toBenefitUnit = (unit) => {
    const item = unit.source === "gift"
      ? giftSelections[unit.lineIndex]
      : cartItems[unit.lineIndex];
    return {
      unitIndex: unit.unitIndex,
      originalPrice: unit.originalPrice,
      discount: unit.discount,
      finalPrice: unit.finalPrice,
      free: unit.free,
      autoAdded: false,
      customerChoiceGift: true,
      source: unit.source,
      selectionId: unit.source === "gift"
        ? String(item?.selectionId || "")
        : undefined,
      benefits: [{
        offerId,
        offerName: offer.name || "",
        offerType: offer.type,
        config,
        originalPrice: unit.originalPrice,
        discount: unit.discount,
        finalPrice: unit.finalPrice,
        free: unit.free,
      }],
    };
  };

  const purchaseDiscounts = new Map();
  const giftDiscounts = new Map();
  evaluation.discountedUnits.forEach((unit) => {
    const target = unit.source === "gift" ? giftDiscounts : purchaseDiscounts;
    if (!target.has(unit.lineIndex)) target.set(unit.lineIndex, []);
    target.get(unit.lineIndex).push(toBenefitUnit(unit));
  });

  const lines = [];
  for (const [cartIndex, discountedUnits] of purchaseDiscounts.entries()) {
    const item = cartItems[cartIndex];
    lines.push({
      cartIndex,
      itemId: String(item?.id ?? item?.productId ?? item?.handle ?? ""),
      regularQty: Math.max(0, (parseInt(item?.qty) || 0) - discountedUnits.length),
      discountedUnits,
    });
  }
  lines.sort((a, b) => a.cartIndex - b.cartIndex);

  const eligibleGiftLines = new Map();
  (evaluation.eligibleGiftUnits || []).forEach((unit) => {
    if (!eligibleGiftLines.has(unit.lineIndex)) eligibleGiftLines.set(unit.lineIndex, 0);
    eligibleGiftLines.set(unit.lineIndex, eligibleGiftLines.get(unit.lineIndex) + 1);
  });
  const giftLines = [];
  for (const [selectionIndex, eligibleQty] of eligibleGiftLines.entries()) {
    const item = giftSelections[selectionIndex];
    const discountedUnits = giftDiscounts.get(selectionIndex) || [];
    giftLines.push({
      selectionIndex,
      selectionId: String(item?.selectionId || ""),
      itemId: String(item?.id ?? item?.productId ?? item?.handle ?? ""),
      item,
      regularQty: Math.max(0, eligibleQty - discountedUnits.length),
      discountedUnits,
    });
  }
  giftLines.sort((a, b) => a.selectionIndex - b.selectionIndex);

  return {
    ...base,
    discount: evaluation.discount,
    lines,
    giftLines,
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
export function computeOfferBenefits(cartItems, offer, now = new Date(), giftSelections = []) {
  if (!Array.isArray(cartItems) || !offer || !isOfferLive(offer, now)) {
    return { offerId: offer?.id ? String(offer.id) : null, name: offer?.name || '', type: offer?.type || null, config: offer?.config || {}, discount: 0, lines: [] };
  }

  if (offer.type === OFFER_TYPES.BUY_X_GET_Y_SELECT_GIFT) {
    const evaluation = computeCustomerChoiceGiftOffer(cartItems, giftSelections, offer);
    return buildCustomerChoiceGiftBenefits(cartItems, giftSelections, offer, evaluation);
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
      const unitsByProduct = new Map();
      for (const unit of eligibleUnits) {
        const productKey = getProductGroupKey(cartItems[unit.cartIndex]) || `__cart_line_${unit.cartIndex}`;
        if (!unitsByProduct.has(productKey)) unitsByProduct.set(productKey, []);
        unitsByProduct.get(productKey).push(unit);
      }

      const autoGiftUnits = [];
      for (const productUnits of unitsByProduct.values()) {
        if (productUnits.length < buy) continue;

        // Choose the cheapest purchased variant as the default gift variant.
        const cheapestFirst = [...productUnits].sort(
          (a, b) => a.price - b.price || a.cartIndex - b.cartIndex || a.unitIndex - b.unitIndex
        );

        // One gift award per qualifying product. The free unit is additional;
        // all buyQty (and any excess paid units) remain in the cart at full price.
        for (let giftIndex = 0; giftIndex < get; giftIndex += 1) {
          const giftSource = cheapestFirst[Math.min(giftIndex, cheapestFirst.length - 1)];
          const giftItem = cartItems[giftSource.cartIndex];
          autoGiftUnits.push({
            ...giftSource,
            unitIndex: Math.max(0, parseInt(giftItem.qty) || 0) + giftIndex,
            rawDiscount: giftSource.price,
            autoAdded: true,
            giftKey: getOfferGiftSelectionKey(offer.id, giftItem),
          });
        }
      }
      eligibleUnits.push(...autoGiftUnits);
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
      autoAdded: unit.autoAdded === true,
      giftKey: unit.autoAdded === true ? unit.giftKey : undefined,
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
      regularQty: Math.max(
        0,
        (parseInt(item.qty) || 0) - discountedUnits.filter((unit) => unit.autoAdded !== true).length
      ),
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
