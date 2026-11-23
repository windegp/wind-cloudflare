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
