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

// Payment badge label and tone (gray, orange, red, blue). The page maps tones to Tailwind classes.
export function paymentBadge(financialStatus, paymentMethod) {
  const fin = String(financialStatus || "").toLowerCase();
  const method = String(paymentMethod || "").toLowerCase();
  if (fin === "paid") return { label: "مدفوع", tone: "gray" };
  if (fin === "pending") return { label: method === "instapay" ? "بانتظار تأكيد إنستا باي" : "الدفع عند الاستلام", tone: "orange" };
  if (fin === "refunded") return { label: "تم رد المبلغ", tone: "red" };
  if (fin === "partially_paid") return { label: "مدفوع جزئياً", tone: "orange" };
  if (fin === "voided") return { label: "ملغي مالياً", tone: "red" };
  if (fin === "authorized") return { label: "تم اعتماد الدفع", tone: "blue" };
  return { label: financialStatus || "غير مسجل", tone: "gray" };
}

// Shopify-style filters: all / unfulfilled / unpaid / open / archived.
export function matchesStatusFilter(order, filter) {
  if (!filter || filter === "all") return true;
  const ful = normalizeFulfillment(order["Fulfillment Status"] || order.fulfillment_status || order.Fulfillment) || "unfulfilled";
  const fin = String(order["Financial Status"] || "").toLowerCase();
  const closed = ful === "delivered" || ful === "returned" || ful === "cancelled";
  if (filter === "unfulfilled") return ful === "unfulfilled";
  if (filter === "unpaid") return fin !== "paid" && fin !== "refunded" && !closed;
  if (filter === "open") return !closed;
  if (filter === "archived") return closed;
  return true;
}
