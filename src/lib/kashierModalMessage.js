// Close-message handling for the embedded Kashier checkout modal. Layout and close handling only:
// this never reads payment results. Payment status still comes from the server webhook.
// checkout.kashier.io redirects (301) to payments.kashier.io, so the iframe document's origin is payments.kashier.io.
export const KASHIER_ORIGINS = ["https://payments.kashier.io", "https://checkout.kashier.io"];
const CLOSE_MESSAGES = new Set(["closeIframe", "iframeHide"]);

export function getKashierMessageName(event) {
  if (!event || !KASHIER_ORIGINS.includes(event.origin)) return null;
  let data = event.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return data; }
  }
  if (data && typeof data === "object" && typeof data.message === "string") return data.message;
  return null;
}

export function isKashierCloseMessage(event) {
  const name = getKashierMessageName(event);
  return name !== null && CLOSE_MESSAGES.has(name);
}
