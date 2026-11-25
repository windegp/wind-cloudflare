// Fulfillment statuses an admin can set on an order. Stored in Orders/<id>["Fulfillment Status"].
// "fulfilled", "partial" and "partially_fulfilled" are legacy (Shopify import) values.
export const FULFILLMENT_OPTIONS = [
  { value: "unfulfilled", label: "لم يتم التجهيز" },
  { value: "prepared", label: "جاهز للشحن" },
  { value: "shipped", label: "تم الشحن" },
  { value: "delivered", label: "تم التسليم" },
  { value: "returned", label: "مرتجع" },
  { value: "cancelled", label: "ملغي" },
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
