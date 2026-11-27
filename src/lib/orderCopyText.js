// نص الطلب للنسخ إلى واتساب (لوحة الأدمن، قراءة فقط).
// دالة نقية: تاخد بيانات الطلب اللي الصفحة محمّلاها وترجع نص عادي.
// صيغة مختصرة: سطر واحد لكل عميل ولكل منتج. أي حقل فاضي بيتشال. من غير إيموجي ومن غير إيميل.

export const COPY_ORDER_LABEL = "نسخ الطلب للواتساب";

const num = (value) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => `${num(value).toLocaleString("en-US")} EGP`;
const clean = (value) => String(value ?? "").trim();

export function paymentStatusText(financialStatus, method) {
  const status = clean(financialStatus).toLowerCase();
  if (status === "paid") return "تم الدفع";
  if (status === "pending_payment") return "بانتظار الدفع";
  if (status === "abandoned") return "سلة متروكة";
  if (status === "pending") return "لم يُدفع بعد";
  if (status) return clean(financialStatus);
  return clean(method).toLowerCase() === "card" ? "بانتظار الدفع" : "غير مسجل";
}

export function buildOrderCopyText({
  order = {},
  items = [],
  orderLabel = "",
  createdAtText = "",
  paymentMethodText = "",
  totals = {},
  notes = "",
}) {
  const out = [];
  const gap = () => {
    if (out.length && out[out.length - 1] !== "") out.push("");
  };

  out.push(`*${["طلب WIND", clean(orderLabel)].filter(Boolean).join(" ")}*`);
  if (clean(createdAtText)) out.push(clean(createdAtText));

  gap();
  out.push("*العميل*");
  const phone = clean(order.Phone || order["Shipping Phone"]);
  const alt = clean(order["Alternate Phone"]);
  const who = [clean(order["Billing Name"]), [phone, alt].filter(Boolean).join(" - ")]
    .filter(Boolean).join(" - ");
  if (who) out.push(who);
  const address = [order["Shipping Address1"], order["Shipping City"], order["Shipping Province"]]
    .map(clean).filter(Boolean).join("، ");
  if (address) out.push(address);

  gap();
  out.push("*المنتجات*");
  if (!items.length) out.push("لا توجد تفاصيل منتجات محفوظة");
  items.forEach((item, idx) => {
    const qty = Number(item?.quantity ?? item?.qty) || 1;
    const name = clean(item?.productTitle || item?.title || item?.name) || "منتج";
    const free = item?.isFree === true;
    const parts = [
      `${name}${free ? " (هدية)" : ""}`,
      clean(item?.selectedColor),
      clean(item?.selectedSize),
      `x${qty}`,
      free ? "" : money(item?.price),
    ].filter(Boolean);
    out.push(`${idx + 1}) ${parts.join(" | ")}`);
  });

  gap();
  out.push("*الحساب*");
  const productDiscount = num(totals.productDiscount);
  const discountAmount = num(totals.discountAmount);
  const shipping = num(totals.shippingAmount);
  if (productDiscount > 0 || discountAmount > 0 || shipping > 0) {
    out.push(`المنتجات: ${money(totals.itemsSubtotal)}`);
  }
  if (productDiscount > 0) out.push(`خصم المنتجات: -${money(productDiscount)}`);
  if (discountAmount > 0) out.push(`${clean(totals.discountLabel) || "الخصم"}: -${money(discountAmount)}`);
  out.push(`الشحن: ${shipping === 0 ? "مجاني" : money(shipping)}`);
  out.push(`*الإجمالي: ${money(totals.totalAmount)}*`);

  gap();
  out.push("*الدفع*");
  const payLine = [clean(paymentMethodText), paymentStatusText(order["Financial Status"], order["Payment Method"])]
    .filter(Boolean).join(" - ");
  if (payLine) out.push(payLine);
  if (clean(order["Payment Reference"])) out.push(`مرجع: ${clean(order["Payment Reference"])}`);

  if (clean(notes)) {
    gap();
    out.push("*ملاحظات*", clean(notes));
  }

  return out.join("\n");
}
