// Display-only helpers for the thank-you page. Nothing here talks to an API.
export const DISPLAY_RECORD_KEY = "wind_order_display_v1";

const KNOWN_METHODS = ["card", "card_success", "cod", "instapay"];

/** Returns a known payment method key, or null when the method is not known. */
export function knownPaymentMethod(method) {
  return KNOWN_METHODS.includes(method) ? method : null;
}

/** Parses the display-only record saved at checkout; it must match the order in the URL. */
export function parseDisplayRecord(raw, orderId) {
  if (!raw || !orderId) return null;
  try {
    const item = JSON.parse(raw);
    return item && typeof item === "object" && item.orderId === orderId ? item : null;
  } catch (_) {
    return null;
  }
}

/** Order shown on the page: the verified receipt wins, the display record fills the gaps. */
export function mergeDisplayOrder(orderData, displayRecord) {
  if (!orderData) return displayRecord || null;
  if (!displayRecord) return orderData;
  const merged = { ...displayRecord, ...orderData };
  for (const key of Object.keys(displayRecord)) {
    if (orderData[key] === undefined || orderData[key] === null || orderData[key] === "") merged[key] = displayRecord[key];
  }
  return merged;
}

export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.م`;
}
