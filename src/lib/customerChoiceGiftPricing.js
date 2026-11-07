const MAX_SELECTION_ID_LENGTH = 128;
const MAX_VARIANT_VALUE_LENGTH = 120;

function stringValue(value, maxLength = MAX_VARIANT_VALUE_LENGTH) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function getCustomerChoiceGiftIdentityKeys(...items) {
  return [...new Set(items.flatMap((item) => [
    item?.id,
    item?.productId,
    item?.handle,
    item?.productHandle,
  ])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map((value) => String(value).trim()))];
}

/** A submitted gift must belong to at least one currently usable choice-gift offer. */
export function isCustomerChoiceGiftAllowed(selection, product, offers) {
  const identities = new Set(getCustomerChoiceGiftIdentityKeys(selection, product));
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

  const requestedId = String(selection?.id || selection?.productId || selection?.handle || product.id);
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
