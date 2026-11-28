// Keeps the color of the automatically added free gift ("buy X get Y") stable.
// Display, pricing and the server are not touched: this only fills the same
// saved-choice store the customer's own gift edit already writes to.

import { getVariantBehavior, INVENTORY_STATUS } from "@/lib/inventoryHelpers";

const FIELDS = ["selectedColor", "selectedSize", "image"];

/** Keep only non-empty string values (an empty color must not beat the default). */
export function sanitizeGiftSelection(selection) {
  const out = {};
  if (!selection || typeof selection !== "object") return out;
  for (const field of FIELDS) {
    const value = selection[field];
    if (typeof value === "string" && value.trim() !== "") out[field] = value;
  }
  // Marks a color the system saved (not one the customer chose).
  if (selection.frozen === true) out.frozen = true;
  return out;
}

/** Clean every saved gift selection (old localStorage data may hold empty values). */
export function sanitizeGiftSelections(selections) {
  const out = {};
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) return out;
  for (const [key, value] of Object.entries(selections)) {
    out[key] = sanitizeGiftSelection(value);
  }
  return out;
}

const norm = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Is this color (and size) purchasable according to the variants stored on the
 * cart line? Same rule the product page and quick view use for "can buy"
 * (real inventoryStatus first, legacy quantity otherwise). The snapshot is
 * what the customer saw when adding the line; no network call is made.
 * Unknown (no variants stored) counts as available, as it does today.
 */
export function isColorAvailableOnLine(line, color, size = "") {
  const variants = Array.isArray(line?.variants) ? line.variants : [];
  if (!variants.length) return true;
  const c = norm(color);
  const s = norm(size);
  const matches = variants.filter((variant) => {
    const first = norm(variant?.option1Value);
    const second = norm(variant?.option2Value);
    return (!c || first === c || second === c) && (!s || first === s || second === s);
  });
  if (!matches.length) return false;
  return matches.some((variant) => {
    const status = variant?.inventoryStatus;
    if (status && status !== INVENTORY_STATUS.NEEDS_REVIEW) {
      return getVariantBehavior(status).canPurchase === true;
    }
    return Number(line?.quantity) > 0 || line?.sellOutOfStock === "Yes";
  });
}

function sameProduct(a, b) {
  const keys = (item) => [item?.productId, item?.id, item?.productHandle, item?.handle]
    .filter((v) => v !== undefined && v !== null && String(v) !== "").map(String);
  const bk = keys(b);
  return keys(a).some((k) => bk.includes(k));
}

// Same normalization the quick view uses for the cart image of a chosen color.
function toImageUrl(product, img) {
  if (!img || typeof img !== "string") return "";
  if (img.startsWith("http")) return img;
  if (img.startsWith("//")) return `https:${img}`;
  if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`;
  if (product?.folderName) return `/images/products/${product.folderName}/${img}`;
  return "";
}

function imageForColor(product, color) {
  const swatch = product?.colorSwatches?.[color];
  const isColorImage = typeof swatch === "string" && (
    swatch.startsWith("http") || swatch.startsWith("//") || swatch.startsWith("/") ||
    swatch.includes("/") || /\.(avif|webp|png|jpe?g|gif)(\?.*)?$/i.test(swatch)
  );
  if (isColorImage) return toImageUrl(product, swatch);
  return toImageUrl(product, product?.mainImage || product?.mainImageUrl || product?.image || product?.images?.[0] || "");
}

/**
 * Other colors of the same product (from the variants stored on the line) that
 * are purchasable, are not one of the paid colors, and have an available size.
 * Returns [{ color, size }] in variant order.
 */
export function getAvailableUnpaidColors(source, paidColors, preferredSize = "") {
  const variants = Array.isArray(source?.variants) ? source.variants : [];
  if (!variants.length) return [];
  const sourceColor = norm(source.selectedColor);
  // Which option holds the color: the one that contains the paid color.
  const holds = (field) => variants.some((v) => norm(v?.[field]) === sourceColor);
  const colorField = holds("option1Value") || !holds("option2Value") ? "option1Value" : "option2Value";
  const sizeField = colorField === "option1Value" ? "option2Value" : "option1Value";
  const paid = new Set(paidColors.map(norm));
  const wantedSize = norm(preferredSize);
  const out = [];
  const seen = new Set();
  for (const variant of variants) {
    const color = String(variant?.[colorField] ?? "").trim();
    if (!color || seen.has(norm(color)) || paid.has(norm(color))) continue;
    const options = variants.filter((v) => norm(v?.[colorField]) === norm(color));
    const available = options.filter((v) => isColorAvailableOnLine(source, color, String(v?.[sizeField] ?? "")));
    if (!available.length) continue;
    const exact = wantedSize
      ? available.find((v) => norm(v?.[sizeField]) === wantedSize)
      : available[0];
    const chosen = exact || available[0];
    seen.add(norm(color));
    out.push({ color, size: String(chosen?.[sizeField] ?? "").trim() });
  }
  return out;
}

/**
 * For every auto-added gift unit without a saved color, save a color (and
 * size, so the pair stays a valid variant), only an available one:
 *   1. an available color of the same product that is NOT one of the paid
 *      colors (so 3 paid colors + 4-color product -> the 4th color);
 *   2. otherwise the source line's color, then another paid line's color.
 * If none is available nothing is saved (the gift behaves exactly as before). A color the customer chose is
 * never overwritten. A color the system saved earlier is replaced when it is
 * no longer available.
 * Returns the new map, or null when nothing needs saving.
 */
export function freezeGiftSelections(offerBenefits, cartItems, saved) {
  const current = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  if (!offerBenefits || !Array.isArray(offerBenefits.lines) || !Array.isArray(cartItems)) return null;

  let next = null;
  for (const line of offerBenefits.lines) {
    const source = cartItems[line?.cartIndex];
    if (!source) continue;
    for (const unit of line.discountedUnits || []) {
      if (unit?.autoAdded !== true || !unit.giftKey) continue;
      const key = String(unit.giftKey);
      const existing = sanitizeGiftSelection((next || current)[key]);
      if (existing.selectedColor) {
        // Customer's own choice: never touched. System-saved: keep while available.
        if (existing.frozen !== true) continue;
        if (isColorAvailableOnLine(source, existing.selectedColor, existing.selectedSize)) continue;
      }
      const sameLines = cartItems.filter((item) => item === source || sameProduct(item, source));
      const paidColors = sameLines.map((item) => item?.selectedColor).filter((c) => typeof c === "string" && c.trim());
      const unpaid = getAvailableUnpaidColors(source, paidColors, source.selectedSize)[0];
      if (unpaid) {
        if (!next) next = { ...current };
        next[key] = sanitizeGiftSelection({
          selectedColor: unpaid.color,
          selectedSize: unpaid.size,
          image: imageForColor(source, unpaid.color),
          frozen: true,
        });
        continue;
      }
      const candidates = [source, ...sameLines.filter((item) => item !== source)];
      const pick = candidates.find((item) => {
        const color = typeof item?.selectedColor === "string" ? item.selectedColor.trim() : "";
        return color && isColorAvailableOnLine(source, color, item.selectedSize);
      });
      if (!pick) {
        if (existing.selectedColor && existing.frozen === true) {
          if (!next) next = { ...current };
          delete next[key];
        }
        continue;
      }
      if (!next) next = { ...current };
      next[key] = sanitizeGiftSelection({
        selectedColor: pick.selectedColor,
        selectedSize: typeof pick.selectedSize === "string" ? pick.selectedSize : "",
        frozen: true,
      });
    }
  }
  return next;
}
