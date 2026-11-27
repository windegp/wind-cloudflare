import { describe, expect, it } from "vitest";
import { buildOrderCopyText, paymentStatusText, COPY_ORDER_LABEL } from "@/lib/orderCopyText";

const base = {
  orderLabel: "#1001",
  createdAtText: "27/11/2026 3:42 PM",
  paymentMethodText: "الدفع عند الاستلام",
  totals: { itemsSubtotal: 1350, productDiscount: 100, discountAmount: 50, discountLabel: "كود الخصم WELCOME10", shippingAmount: 50, totalAmount: 1250 },
  notes: "",
};
const cod = {
  ...base,
  order: {
    "Billing Name": "أحمد محمد", Phone: "01012345678", "Alternate Phone": "01098765432",
    "Shipping Address1": "شارع كذا", "Shipping City": "المعادي", "Shipping Province": "القاهرة",
    "Financial Status": "pending", "Payment Method": "cod",
  },
  items: [
    { name: "قميص كتان", selectedColor: "أسود", selectedSize: "L", quantity: 2, price: 450 },
    { name: "حزام جلد", quantity: 1, price: 0, isFree: true },
  ],
  notes: "اتصل قبل الوصول",
};

describe("buildOrderCopyText", () => {
  it("builds the compact COD text with discount and gift", () => {
    const t = buildOrderCopyText(cod);
    expect(t).toBe([
      "*طلب WIND #1001*",
      "27/11/2026 3:42 PM",
      "",
      "*العميل*",
      "أحمد محمد - 01012345678 - 01098765432",
      "شارع كذا، المعادي، القاهرة",
      "",
      "*المنتجات*",
      "1) قميص كتان | أسود | L | x2 | 450 EGP",
      "2) حزام جلد (هدية) | x1",
      "",
      "*الحساب*",
      "المنتجات: 1,350 EGP",
      "خصم المنتجات: -100 EGP",
      "كود الخصم WELCOME10: -50 EGP",
      "الشحن: 50 EGP",
      "*الإجمالي: 1,250 EGP*",
      "",
      "*الدفع*",
      "الدفع عند الاستلام - لم يُدفع بعد",
      "",
      "*ملاحظات*",
      "اتصل قبل الوصول",
    ].join("\n"));
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(t).not.toContain("@");
  });

  it("builds a paid card order: no subtotal line when no discount/shipping, reference shown", () => {
    const t = buildOrderCopyText({
      ...base,
      orderLabel: "#1002",
      paymentMethodText: "بطاقة ائتمان",
      totals: { itemsSubtotal: 900, productDiscount: 0, discountAmount: 0, shippingAmount: 0, totalAmount: 900 },
      order: { "Billing Name": "منى", "Shipping Phone": "01155555555", "Financial Status": "paid", "Payment Method": "card", "Payment Reference": "ABC123" },
      items: [{ title: "فستان", selectedColor: "أحمر", quantity: 1, price: 900 }],
    });
    expect(t).toContain("منى - 01155555555");
    expect(t).toContain("1) فستان | أحمر | x1 | 900 EGP");
    expect(t).not.toContain("المنتجات: ");
    expect(t).not.toContain("خصم");
    expect(t).not.toContain("ملاحظات");
    expect(t).toContain("الشحن: مجاني\n*الإجمالي: 900 EGP*");
    expect(t).toContain("بطاقة ائتمان - تم الدفع\nمرجع: ABC123");
  });

  it("omits empty fields and handles no items", () => {
    const t = buildOrderCopyText({ order: {}, items: [], totals: {} });
    expect(t.startsWith("*طلب WIND*")).toBe(true);
    expect(t).toContain("لا توجد تفاصيل منتجات محفوظة");
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("NaN");
  });

  it("maps payment status", () => {
    expect(paymentStatusText("paid", "card")).toBe("تم الدفع");
    expect(paymentStatusText("pending_payment", "card")).toBe("بانتظار الدفع");
    expect(paymentStatusText("abandoned", "")).toBe("سلة متروكة");
    expect(paymentStatusText("Refunded", "card")).toBe("Refunded");
    expect(paymentStatusText("", "card")).toBe("بانتظار الدفع");
    expect(paymentStatusText("", "cod")).toBe("غير مسجل");
  });

  it("keeps the button label in one constant", () => {
    expect(COPY_ORDER_LABEL).toBe("نسخ الطلب للواتساب");
  });
});
