const MAX_SELECTION_ID_LENGTH = 128;
const MAX_VARIANT_VALUE_LENGTH = 120;

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

/** Check only identifiers proven by the Firestore lookup, not client-supplied aliases. */
export function isCustomerChoiceGiftAllowed(product, offers) {
  const identities = new Set(getCustomerChoiceGiftIdentityKeys(product));
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
