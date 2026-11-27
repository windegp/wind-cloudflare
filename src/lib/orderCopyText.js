// نص الطلب للنسخ إلى واتساب (لوحة الأدمن، قراءة فقط).
// دالة نقية: تاخد بيانات الطلب اللي الصفحة محمّلاها وترجع نص عادي.
// قواعد: أي سطر قيمته فاضية بيتشال، والأرقام والإنجليزي كل واحد في سطر لوحده
// عشان اتجاه RTL في واتساب ما يقلبش الترتيب. من غير إيموجي.

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
  // سطر عنوان + قيمة في سطر لوحده (للأرقام والإنجليزي).
  const field = (label, value) => {
    const v = clean(value);
    if (v) out.push(`${label}:`, v);
  };
  const inline = (label, value) => {
    const v = clean(value);
    if (v) out.push(`${label}: ${v}`);
  };
  const gap = () => {
    if (out.length && out[out.length - 1] !== "") out.push("");
  };

  out.push("*طلب WIND*");
  field("رقم الطلب", orderLabel);
  field("التاريخ", createdAtText);

  gap();
  out.push("*العميل*");
  inline("الاسم", order["Billing Name"]);
  field("الهاتف", order.Phone || order["Shipping Phone"]);
  field("هاتف بديل", order["Alternate Phone"]);
  const address = [order["Shipping Address1"], order["Shipping City"]]
    .map(clean).filter(Boolean).join("، ");
  inline("العنوان", address);
  inline("المحافظة", order["Shipping Province"]);

  gap();
  out.push("*المنتجات*");
  if (!items.length) {
    out.push("لا توجد تفاصيل منتجات محفوظة");
  }
  items.forEach((item, idx) => {
    const qty = Number(item?.quantity ?? item?.qty) || 1;
    const price = num(item?.price);
    const name = clean(item?.productTitle || item?.title || item?.name) || "منتج";
    out.push(`${idx + 1}) ${name}${item?.isFree === true ? " (هدية)" : ""}`);
    inline("اللون", item?.selectedColor);
    inline("المقاس", item?.selectedSize);
    out.push(`الكمية: ${qty}`);
    field("السعر", money(price));
    if (qty > 1 && item?.isFree !== true) field("الإجمالي", money(price * qty));
  });

  gap();
  out.push("*الحساب*");
  field("المنتجات", money(totals.itemsSubtotal));
  if (num(totals.productDiscount) > 0) field("خصم المنتجات", `-${money(totals.productDiscount)}`);
  if (num(totals.discountAmount) > 0) field(clean(totals.discountLabel) || "الخصم", `-${money(totals.discountAmount)}`);
  field("الشحن", num(totals.shippingAmount) === 0 ? "مجاني" : money(totals.shippingAmount));
  out.push("*الإجمالي:*", money(totals.totalAmount));

  gap();
  out.push("*الدفع*");
  inline("الطريقة", paymentMethodText);
  inline("الحالة", paymentStatusText(order["Financial Status"], order["Payment Method"]));
  field("مرجع الدفع", order["Payment Reference"]);

  if (clean(notes)) {
    gap();
    out.push("*ملاحظات*", clean(notes));
  }

  return out.join("\n");
}
