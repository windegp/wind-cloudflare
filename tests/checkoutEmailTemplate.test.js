import { describe, expect, it } from "vitest";
import { writeFileSync } from "fs";
import { buildBreakdownRows, buildCheckoutEmails } from "@/lib/checkoutEmailTemplate";

const formData = { firstName: "Ali", lastName: "Hassan", phone: "01000000000", address: "12 Nasr St", city: "Cairo", governorate: "Cairo", email: "a@b.com" };
const quote = {
  subtotal: 1000, discount: 300, shipping: 0, total: 700, productDiscountTotal: 100,
  discountLines: [{ source: "offer", label: "عرض: الجمعة البيضاء", amount: 200 }, { source: "first_order", label: "خصم الطلب الأول", amount: 100 }],
  lineItems: [{ productTitle: "Shirt", price: 500, quantity: 2, selectedSize: "L" }],
  cartItems: [],
};

describe("order emails", () => {
  it("itemizes each discount so the lines add up to the total", () => {
    const rows = buildBreakdownRows(quote);
    expect(rows.discountRows.map(r => r.amount)).toEqual([200, 100]);
    expect(rows.subtotal - rows.discountRows.reduce((s, r) => s + r.amount, 0) + rows.shipping).toBe(rows.total);
    expect(rows.saved).toBe(400);
  });
  it("falls back to one discount line when lines are missing or do not add up", () => {
    expect(buildBreakdownRows({ ...quote, discountLines: [] }).discountRows).toEqual([{ label: "الخصم", amount: 300 }]);
    expect(buildBreakdownRows({ ...quote, discountLines: [{ label: "x", amount: 5 }] }).discountRows).toEqual([{ label: "الخصم", amount: 300 }]);
    expect(buildBreakdownRows({ ...quote, discount: 0, discountLines: [] }).discountRows).toEqual([]);
  });
  it("shows the discount lines in both the admin and the customer email", () => {
    const { adminHtml, customerHtml } = buildCheckoutEmails({ paymentMethod: "cod", formData, orderNumber: "1001", orderId: "WIND-D-abc", signedQuote: quote });
    for (const html of [adminHtml, customerHtml]) {
      expect(html).toContain("عرض: الجمعة البيضاء");
      expect(html).toContain("خصم الطلب الأول");
      expect(html).toContain("- 200");
      expect(html).toContain("700");
    }
    expect(adminHtml).toContain("/admin/orders/WIND-D-abc");
    expect(adminHtml).toContain("عرض الطلب");
  });
  it("escapes discount labels", () => {
    const { adminHtml } = buildCheckoutEmails({ paymentMethod: "cod", formData, orderNumber: "1", signedQuote: { ...quote, discountLines: [{ label: "<script>x</script>", amount: 300 }] } });
    expect(adminHtml).not.toContain("<script>");
  });
  it("works for a quote with no discount", () => {
    const { adminHtml, customerHtml } = buildCheckoutEmails({ paymentMethod: "cod", formData, orderNumber: "1", signedQuote: { subtotal: 500, shipping: 50, total: 550, lineItems: quote.lineItems } });
    expect(adminHtml).toContain("550");
    expect(customerHtml).toContain("550");
  });
  it("puts the logo at the bottom and links the customer button to order tracking", () => {
    const { adminHtml, customerHtml } = buildCheckoutEmails({ paymentMethod: "cod", formData, orderNumber: "1001", orderId: "WIND-D-abc", signedQuote: quote });
    for (const html of [adminHtml, customerHtml]) {
      expect(html.indexOf("/logo.png")).toBeGreaterThan(html.indexOf("عنوان الشحن"));
    }
    expect(customerHtml).toContain("/track-order?order=1001");
    expect(customerHtml).toContain("عرض طلبك");
    expect(customerHtml).toContain("أهلاً Ali");
  });
});

it.skipIf(!process.env.DUMP_EMAIL)("dump", () => {
  const q = { ...quote, lineItems: [{ productTitle: "تيشيرت قطن أسود", price: 350, quantity: 3, selectedSize: "L", selectedColor: "أسود" }, { productTitle: "كاب هدية", price: 0, quantity: 1, isOfferBenefit: true, isFree: true }] , subtotal: 1050, discount: 300, total: 750};
  const r = buildCheckoutEmails({ paymentMethod: "cod", formData, orderNumber: "1001", orderId: "x", signedQuote: q });
  writeFileSync("/tmp/ea.html", r.adminHtml); writeFileSync("/tmp/ec.html", r.customerHtml);
});
