import { orderDisplayLabel } from "@/lib/orderDisplayNumber";
// Logic for the public order tracking lookup.
// A lookup only succeeds when the order number AND the phone on the order match.
// The response contains status and items only: no address, name, email or phone.

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function westernDigits(value) {
  return String(value ?? "").replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** Accept legacy IDs and the exact durable UUID namespace. Firestore IDs are case-sensitive. */
export function normalizeOrderNumber(value) {
  const cleaned = westernDigits(value).trim().toUpperCase().replace(/^#/, "").replace(/\s+/g, "");
  // Durable checkout generates lowercase UUIDs; preserve that canonical document ID.
  if (/^WIND-D-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(cleaned)) {
    return `WIND-D-${cleaned.slice(7).toLowerCase()}`;
  }
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(cleaned)) return "";
  return cleaned;
}

/** Last 10 digits of a phone number, or "" when there are fewer than 10 digits. */
export function phoneTail(value) {
  const digits = westernDigits(value).replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

export function phoneMatchesOrder(inputPhone, order) {
  const wanted = phoneTail(inputPhone);
  if (!wanted) return false;
  return [order?.Phone, order?.["Shipping Phone"], order?.["Alternate Phone"]].some(
    (p) => phoneTail(p) === wanted
  );
}

const PAYMENT_LABELS = {
  paid: "مدفوع",
  pending: "الدفع عند الاستلام",
  pending_payment: "بانتظار الدفع الإلكتروني",
  refunded: "تم رد المبلغ",
  partially_paid: "مدفوع جزئياً",
  voided: "ملغي",
  authorized: "تم اعتماد الدفع",
};

const METHOD_LABELS = { card: "بطاقة ائتمان", cod: "الدفع عند الاستلام", instapay: "إنستا باي" };

/** Drafts and abandoned carts are not real orders for the customer. */
export function isTrackableOrder(order) {
  if (!order || typeof order !== "object") return false;
  const fin = String(order["Financial Status"] || "").toLowerCase();
  return fin !== "abandoned" && fin !== "";
}

/** Customer-facing stage: 1 received, 2 preparing, 3 shipped. 0 = cancelled. */
export function orderStage(order) {
  const fin = String(order["Financial Status"] || "").toLowerCase();
  if (fin === "voided") return 0;
  const ful = String(order["Fulfillment Status"] || order.fulfillment_status || order.Fulfillment || "").toLowerCase();
  if (ful === "fulfilled") return 3;
  if (ful === "partial" || ful === "partially_fulfilled") return 2;
  return fin === "paid" || fin === "pending" ? 2 : 1;
}

export function toPublicOrder(order, orderNumber) {
  const items = (Array.isArray(order.lineItems) ? order.lineItems : []).slice(0, 50).map((i) => ({
    title: String(i.productTitle || i.title || i.name || "").slice(0, 160),
    quantity: Number(i.quantity ?? i.qty ?? 1) || 1,
    size: i.selectedSize ? String(i.selectedSize).slice(0, 40) : "",
    color: i.selectedColor ? String(i.selectedColor).slice(0, 40) : "",
  }));
  const fin = String(order["Financial Status"] || "").toLowerCase();
  const method = String(order["Payment Method"] || "").toLowerCase();
  return {
    orderNumber: orderDisplayLabel(order, orderNumber),
    createdAt: String(order["Created at"] || "").slice(0, 19),
    stage: orderStage(order),
    paymentStatus: PAYMENT_LABELS[fin] || "",
    paymentMethod: METHOD_LABELS[method] || "",
    city: String(order["Shipping City"] || "").slice(0, 60),
    total: Number(order.Total) || 0,
    currency: order.Currency || "EGP",
    items,
  };
}
