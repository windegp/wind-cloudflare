// Fulfillment statuses an admin can set on an order. Stored in Orders/<id>["Fulfillment Status"].
// "fulfilled", "partial" and "partially_fulfilled" are legacy (Shopify import) values.
export const FULFILLMENT_OPTIONS = [
  { value: "unfulfilled", label: "لم يتم التجهيز", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "prepared", label: "جاهز للشحن", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "shipped", label: "تم الشحن", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "delivered", label: "تم التسليم", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "returned", label: "مرتجع", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "cancelled", label: "ملغي", color: "bg-red-100 text-red-700 border-red-200" },
];

const ALIASES = {
  fulfilled: "shipped",
  partial: "prepared",
  partially_fulfilled: "prepared",
  canceled: "cancelled",
};

export function normalizeFulfillment(raw) {
  const v = String(raw || "").trim().toLowerCase();
  const canonical = ALIASES[v] || v;
  return FULFILLMENT_OPTIONS.some((o) => o.value === canonical) ? canonical : "";
}
