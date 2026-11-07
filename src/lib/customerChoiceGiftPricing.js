const MAX_SELECTION_ID_LENGTH = 128;
const MAX_VARIANT_VALUE_LENGTH = 120;

import { isOfferLive } from "@/lib/offerDates";

function stringValue(value, maxLength = MAX_VARIANT_VALUE_LENGTH) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function getCustomerChoiceGiftIdentityKeys(...items) {
  return [...new Set(items.flatMap((item) => [
    item?.id,
    item?.handle,
    ...(Array.isArray(item?._resolvedIdentifiers) ? item._resolvedIdentifiers : []),
  ])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map((value) => String(value).trim()))];
}


/**
 * Avoid Firestore reads for manual gifts unless their count could complete
 * at least one active customer-choice offer. All purchase quantities here
 * are already resolved and validated by the checkout server.
 */
export function hasPotentiallyCompleteCustomerChoiceGiftOffer(purchaseItems, giftSelections, offers, now = new Date()) {
  if (!Array.isArray(purchaseItems) || !Array.isArray(giftSelections) || giftSelections.length === 0) {
    return false;
  }

  return (Array.isArray(offers) ? offers : []).some((offer) => {
    if (offer?.type !== "buy_x_get_y_select_gift" || !isOfferLive(offer, now)) return false;
    const buyQty = Number(offer.config?.buyQty);
    const getQty = Number(offer.config?.getQty);
    if (!Number.isInteger(buyQty) || buyQty < 1 || !Number.isInteger(getQty) || getQty < 1) return false;
    const purchaseIds = new Set(Array.isArray(offer.purchaseProductIds) ? offer.purchaseProductIds.map(String) : []);
    if (!purchaseIds.size) return false;

    const eligiblePurchaseQty = purchaseItems.reduce((sum, item) => {
      const identities = getCustomerChoiceGiftIdentityKeys(item);
      if (!identities.some((identity) => purchaseIds.has(identity))) return sum;
      const qty = Number(item?.qty);
      return sum + (Number.isInteger(qty) && qty > 0 ? qty : 0);
    }, 0);
    const requiredGiftQty = Math.floor(eligiblePurchaseQty / buyQty) * getQty;
    return requiredGiftQty > 0 && requiredGiftQty === giftSelections.length;
  });
}

/** Check only identifiers proven by the Firestore lookup, not client-supplied aliases. */
export function isCustomerChoiceGiftAllowed(product, offers) {
  // These are the canonical document ID, canonical handle, and aliases that
  // the server actually resolved. Ignore stored productId/productHandle fields.
  const identities = new Set(
    [product?.id, product?.handle, ...(Array.isArray(product?._resolvedIdentifiers) ? product._resolvedIdentifiers : [])]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
      .map((value) => String(value).trim())
  );
  if (!identities.size || !Array.isArray(offers)) return false;

  return offers.some((offer) => {
    if (offer?.type !== "buy_x_get_y_select_gift") return false;
    const giftIds = Array.isArray(offer.giftProductIds) ? offer.giftProductIds.map(String) : [];
    return giftIds.some((id) => identities.has(id));
  });
}

/** Build the evaluator input from Firestore product data, never the submitted price/title. */
export function buildTrustedCustomerChoiceGiftSelection(selection, product, trustedPrice) {
  const selectionId = stringValue(selection?.selectionId, MAX_SELECTION_ID_LENGTH);
  const price = Number(trustedPrice);
  if (!selectionId || !product?.id || !Number.isFinite(price) || price <= 0) return null;

  const requestedId = String(
    Array.isArray(product?._resolvedIdentifiers) && product._resolvedIdentifiers.length
      ? product._resolvedIdentifiers[0]
      : product.id
  );
  return {
    selectionId,
    id: String(product.id),
    productId: String(product.id),
    handle: String(product.handle || product.id),
    productHandle: String(product.handle || product.id),
    title: String(product.title || "منتج"),
    price,
    image: stringValue(selection?.image, 2048) || String(product.images?.[0] || product.mainImage || product.mainImageUrl || ""),
    selectedColor: stringValue(selection?.selectedColor),
    selectedSize: stringValue(selection?.selectedSize),
    qty: 1,
    requestedProductId: requestedId,
  };
}
