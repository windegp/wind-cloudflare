import { isOfferLive } from "@/lib/offerDates";

const MAX_UNITS_PER_LINE = 1000;

function toIds(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function itemKeys(item) {
  return [item?.productId, item?.id, item?.productHandle, item?.handle]
    .filter((value) => value !== undefined && value !== null && String(value) !== "")
    .map(String);
}

function isInScope(item, ids) {
  const keys = itemKeys(item);
  return keys.length > 0 && keys.some((key) => ids.includes(key));
}

function expand(items, source, allowedIds) {
  const units = [];
  if (!Array.isArray(items)) return units;

  items.forEach((item, lineIndex) => {
    if (!isInScope(item, allowedIds)) return;
    const price = Number(item?.price);
    const rawQty = Number(item?.qty ?? 1);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(rawQty) || rawQty < 1) return;
    const qty = Math.min(rawQty, MAX_UNITS_PER_LINE);
    for (let unitIndex = 0; unitIndex < qty; unitIndex += 1) {
      units.push({ source, lineIndex, unitIndex, price });
    }
  });
  return units;
}

/**
 * Evaluates the separate "buy X, choose Y free" offer.
 * Gift selections are deliberately separate from paid cart lines: incomplete
 * selections never enter the payable subtotal and never receive a discount.
 */
export function computeCustomerChoiceGiftOffer(purchaseItems, giftSelections, offer) {
  const empty = {
    eligiblePurchaseQty: 0,
    requiredGiftQty: 0,
    selectedGiftQty: 0,
    complete: false,
    discount: 0,
    discountedUnits: [],
  };

  if (!offer || offer.type !== "buy_x_get_y_select_gift" || !isOfferLive(offer)) return empty;

  const config = offer.config || {};
  const buyQty = Number(config.buyQty);
  const getQty = Number(config.getQty);
  if (!Number.isInteger(buyQty) || buyQty < 1 || !Number.isInteger(getQty) || getQty < 1) return empty;

  const purchaseIds = toIds(offer.purchaseProductIds);
  const giftIds = toIds(offer.giftProductIds);
  if (!purchaseIds.length || !giftIds.length) return empty;

  const purchaseUnits = expand(purchaseItems, "purchase", purchaseIds);
  const eligiblePurchaseQty = purchaseUnits.length;
  const multiplier = Math.floor(eligiblePurchaseQty / buyQty);
  const requiredGiftQty = multiplier * getQty;
  if (requiredGiftQty < 1) {
    return { ...empty, eligiblePurchaseQty, requiredGiftQty };
  }

  const giftUnits = expand(giftSelections, "gift", giftIds);
  const selectedGiftQty = giftUnits.length;
  const complete = selectedGiftQty === requiredGiftQty;
  if (!complete) {
    return {
      eligiblePurchaseQty,
      requiredGiftQty,
      selectedGiftQty,
      complete: false,
      discount: 0,
      discountedUnits: [],
    };
  }

  const allUnits = [...purchaseUnits, ...giftUnits];
  const freeQty = Math.min(requiredGiftQty, allUnits.length);
  const cheapest = [...allUnits].sort(
    (a, b) => a.price - b.price ||
      (a.source === b.source ? 0 : a.source === "purchase" ? -1 : 1) ||
      a.lineIndex - b.lineIndex ||
      a.unitIndex - b.unitIndex
  ).slice(0, freeQty);

  const discountedUnits = cheapest
    .map((unit) => ({
      source: unit.source,
      lineIndex: unit.lineIndex,
      unitIndex: unit.unitIndex,
      originalPrice: unit.price,
      discount: unit.price,
      finalPrice: 0,
      free: true,
    }))
    .sort((a, b) =>
      (a.source === b.source ? 0 : a.source === "purchase" ? -1 : 1) ||
      a.lineIndex - b.lineIndex ||
      a.unitIndex - b.unitIndex
    );

  return {
    eligiblePurchaseQty,
    requiredGiftQty,
    selectedGiftQty,
    complete: true,
    discount: discountedUnits.reduce((sum, unit) => sum + unit.discount, 0),
    discountedUnits,
  };
}
