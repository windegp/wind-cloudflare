// TikTok Catalog / Events API ID helpers.
// TikTok uses its own catalog identity namespace. Meta's getCatalogId() is
// intentionally not reused here because it does not identify Color × Size.

const slugify = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
const isColorName = (name = "") => { const n = String(name).trim().toLowerCase(); return n.includes("color") || n.includes("colour") || n.includes("لون") || n.includes("الوان"); };
const isSizeName = (name = "") => { const n = String(name).trim().toLowerCase(); return n.includes("size") || n.includes("مقاس") || n.includes("حجم"); };

function optionNames(product = {}, variant = {}) {
  const options = Array.isArray(product.options) ? product.options : [];
  return [options[0]?.name || variant.option1Name || "", options[1]?.name || variant.option2Name || ""];
}

export function getTikTokVariantAttributes(product = {}, variant = {}) {
  const explicitColor = String(variant.color || "").trim();
  const explicitSize = String(variant.size || "").trim();
  if (explicitColor || explicitSize) return { color: explicitColor, size: explicitSize };

  const [name1, name2] = optionNames(product, variant);
  const value1 = String(variant.option1Value || "").trim();
  const value2 = String(variant.option2Value || "").trim();
  let color = "";
  let size = "";
  if (isColorName(name1)) color = value1; else if (isColorName(name2)) color = value2;
  if (isSizeName(name1)) size = value1; else if (isSizeName(name2)) size = value2;
  if (!color && !size) { color = value1; size = value2; }
  return { color, size };
}

export function getTikTokSkuId(handle, variant = null) {
  const safeHandle = String(handle || "").trim();
  const variantId = String(variant?.variantId || "").trim();
  if (variantId) return variantId;
  if (!variant) return safeHandle;
  const option1 = slugify(variant.option1Value || "");
  const option2 = slugify(variant.option2Value || "");
  const suffix = [option1, option2].filter(Boolean).join("-");
  return suffix ? `${safeHandle}-${suffix}` : safeHandle;
}

export function findTikTokVariant(product = {}, selectedColor = "", selectedSize = "") {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) return null;
  const color = String(selectedColor || "").trim().toLowerCase();
  const size = String(selectedSize || "").trim().toLowerCase();
  return variants.find((variant) => {
    const attrs = getTikTokVariantAttributes(product, variant);
    return (!color || attrs.color.toLowerCase() === color) && (!size || attrs.size.toLowerCase() === size);
  }) || null;
}

export function getTikTokSkuIdForItem(item = {}) {
  if (item.tiktokSkuId) return String(item.tiktokSkuId);
  const product = item.product || item;
  const variant = item.variant || findTikTokVariant(product, item.selectedColor, item.selectedSize);
  return getTikTokSkuId(item.handle || product.handle || item.id || product.id, variant);
}
