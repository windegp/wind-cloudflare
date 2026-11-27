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
  it("builds the full COD text", () => {
    const t = buildOrderCopyText(cod);
    expect(t).toContain("*طلب WIND*\nرقم الطلب:\n#1001\nالتاريخ:\n27/11/2026 3:42 PM");
    expect(t).toContain("الهاتف:\n01012345678\nهاتف بديل:\n01098765432");
    expect(t).toContain("العنوان: شارع كذا، المعادي\nالمحافظة: القاهرة");
    expect(t).toContain("1) قميص كتان\nاللون: أسود\nالمقاس: L\nالكمية: 2\nالسعر:\n450 EGP\nالإجمالي:\n900 EGP");
    expect(t).toContain("2) حزام جلد (هدية)\nالكمية: 1\nالسعر:\n0 EGP");
    expect(t).toContain("خصم المنتجات:\n-100 EGP");
    expect(t).toContain("كود الخصم WELCOME10:\n-50 EGP");
    expect(t).toContain("الشحن:\n50 EGP");
    expect(t).toContain("*الإجمالي:*\n1,250 EGP");
    expect(t).toContain("الحالة: لم يُدفع بعد");
    expect(t).toContain("*ملاحظات*\nاتصل قبل الوصول");
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(t).not.toContain("@");
  });

  it("builds a paid card order with reference, free shipping, no discounts or notes", () => {
    const t = buildOrderCopyText({
      ...base,
      paymentMethodText: "بطاقة ائتمان",
      totals: { itemsSubtotal: 900, productDiscount: 0, discountAmount: 0, shippingAmount: 0, totalAmount: 900 },
      order: { "Billing Name": "منى", "Shipping Phone": "01155555555", "Financial Status": "paid", "Payment Method": "card", "Payment Reference": "ABC123" },
      items: [{ title: "فستان", quantity: 1, price: 900 }],
    });
    expect(t).toContain("الهاتف:\n01155555555");
    expect(t).not.toContain("هاتف بديل");
    expect(t).not.toContain("خصم");
    expect(t).not.toContain("ملاحظات");
    expect(t).toContain("الشحن:\nمجاني");
    expect(t).toContain("الطريقة: بطاقة ائتمان\nالحالة: تم الدفع\nمرجع الدفع:\nABC123");
    expect(t).not.toContain("الإجمالي:\n900");
  });

  it("omits empty fields and handles no items", () => {
    const t = buildOrderCopyText({ order: {}, items: [], totals: {} });
    expect(t).toContain("لا توجد تفاصيل منتجات محفوظة");
    expect(t).not.toContain("الهاتف");
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
