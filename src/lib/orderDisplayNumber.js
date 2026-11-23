// Display numbers are labels only. Internal IDs remain the payment/replay identity.
export function validDisplayNumber(value) {
  return Number.isSafeInteger(value) && value >= 1001;
}
export function orderDisplayLabel(order, fallback = "") {
  const number = order?.orderNumber ?? order?.["Order Number"];
  return validDisplayNumber(number) ? `#${number}` : String(order?.orderId || order?.Name || fallback);
}
export function parseDisplayNumber(value) {
  const text = String(value ?? "").trim().replace(/^#/, "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (!/^[1-9][0-9]{3,15}$/.test(text)) return null;
  const number = Number(text);
  return validDisplayNumber(number) ? number : null;
}
