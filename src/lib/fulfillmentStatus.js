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
  if (fin === "pending") return { label: method === "instapay" ? "بانتظار تأكيد التحويل" : method === "cod" ? "الدفع عند الاستلام" : "بانتظار الدفع", tone: "orange" };
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

// Manual payment status for non-card orders (COD, InstaPay). Card orders are set by the Kashier webhook only.
export const PAYMENT_OPTIONS = [
  { value: "pending", label: "معلّق" },
  { value: "paid", label: "مدفوع" },
  { value: "refunded", label: "مسترد" },
];

export function canEditPayment(order) {
  const method = String(order?.["Payment Method"] || "").toLowerCase();
  const fin = String(order?.["Financial Status"] || "").toLowerCase();
  return (method === "cod" || method === "instapay") && PAYMENT_OPTIONS.some((o) => o.value === fin);
}

// COD shortcut: marking delivered turns a pending COD order into paid. Never reverts, never touches other states.
export function paymentPatchForFulfillment(order, value) {
  const method = String(order?.["Payment Method"] || "").toLowerCase();
  const fin = String(order?.["Financial Status"] || "").toLowerCase();
  if (value === "delivered" && method === "cod" && fin === "pending") return { "Financial Status": "paid" };
  return {};
}

// Option label for the manual payment dropdown. "pending" reads differently for COD and InstaPay.
export function paymentOptionLabel(value, paymentMethod) {
  const method = String(paymentMethod || "").toLowerCase();
  if (value === "pending") return method === "instapay" ? "بانتظار تأكيد التحويل" : method === "cod" ? "الدفع عند الاستلام" : "بانتظار الدفع";
  return PAYMENT_OPTIONS.find((o) => o.value === value)?.label || value;
}
