// TikTok Catalog / Events API ID helpers.
//
// TikTok has its own catalog identity namespace. Do NOT reuse Meta's
// getCatalogId(), because Meta's color-based IDs do not uniquely identify a
// Color × Size variant. TikTok's sku_id is the stable variantId stored in
// Firestore; item_group_id remains the product handle.

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const isColorName = (name = "") => {
  const n = String(name).trim().toLowerCase();
  return n.includes("color") || n.includes("colour") || n.includes("لون") || n.includes("الوان");
};

const isSizeName = (name = "") => {
  const n = String(name).trim().toLowerCase();
  return n.includes("size") || n.includes("مقاس") || n.includes("حجم");
};

function optionNames(product = {}, variant = {}) {
  const options = Array.isArray(product.options) ? product.options : [];
  return [
    options[0]?.name || variant.option1Name || "",
    options[1]?.name || variant.option2Name || "",
  ];
}

export function getTikTokVariantAttributes(product = {}, variant = {}) {
  const [name1, name2] = optionNames(product, variant);
  const value1 = String(variant.option1Value || "").trim();
  const value2 = String(variant.option2Value || "").trim();

  let color = "";
  let size = "";

  if (isColorName(name1)) color = value1;
  else if (isColorName(name2)) color = value2;

  if (isSizeName(name1)) size = value1;
  else if (isSizeName(name2)) size = value2;

  // Safety fallback for legacy variants whose option names are missing.
  // The current WIND schema is Color/Size, so this preserves existing data
  // without inventing a new source of truth.
  if (!color && !size) {
    color = value1;
    size = value2;
  }

  return { color, size };
}

/**
 * Canonical TikTok sku_id.
 * Prefer Firestore variantId. The fallback is deterministic for legacy data
 * that somehow contains a variant without variantId; it is never random.
 */
export function getTikTokSkuId(handle, variant = null) {
  const safeHandle = String(handle || "").trim();
  const variantId = String(variant?.variantId || "").trim();
  if (variantId) return variantId;

  if (!variant) return safeHandle;

  const color = slugify(variant.color);
  const size = slugify(variant.size);
  const suffix = [color, size].filter(Boolean).join("-");
  return suffix ? `${safeHandle}-${suffix}` : safeHandle;
}

/** Find the exact Firestore variant represented by the selected options. */
export function findTikTokVariant(product = {}, selectedColor = "", selectedSize = "") {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) return null;

  const color = String(selectedColor || "").trim().toLowerCase();
  const size = String(selectedSize || "").trim().toLowerCase();

  return variants.find((variant) => {
    const attrs = getTikTokVariantAttributes(product, variant);
    return (!color || attrs.color.toLowerCase() === color) &&
           (!size || attrs.size.toLowerCase() === size);
  }) || null;
}

/** Resolve the TikTok sku_id for a storefront/cart item. */
export function getTikTokSkuIdForItem(item = {}) {
  if (item.tiktokSkuId) return String(item.tiktokSkuId);

  const product = item.product || item;
  const variant = item.variant || findTikTokVariant(product, item.selectedColor, item.selectedSize);
  return getTikTokSkuId(item.handle || product.handle || item.id || product.id, variant);
}
