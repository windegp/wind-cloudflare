/** Durable status UI belongs only to durable order IDs, never to an empty legacy receipt. */
export function resolveThankYouState(orderId, records = []) {
  const durableId = typeof orderId === "string" && orderId.startsWith("WIND-D-");
  const parsed = records.flatMap(value => {
    if (!value) return [];
    try { const item = JSON.parse(value); return item && typeof item === "object" ? [item] : []; }
    catch (_) { return []; }
  });
  const receipt = orderId ? parsed.find(item => item.orderId === orderId) : parsed[0];
  const durable = durableId || (!orderId && receipt?.durable === true);
  return { durable, receipt: receipt || null };
}

/**
 * Kashier's redirect after payment (observed with wallet payments) puts Kashier's
 * own UUID in the orderId query param; our real order id arrives in merchantOrderId.
 * Pick whichever param looks like our id (WIND-...). If neither does, return null so
 * the page falls back to the locally stored receipt instead of matching nothing.
 */
export function resolveThankYouOrderId(orderIdParam, merchantOrderIdParam) {
  return [merchantOrderIdParam, orderIdParam].find(
    (value) => typeof value === "string" && value.startsWith("WIND-")
  ) ?? null;
}
