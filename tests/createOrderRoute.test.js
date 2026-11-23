import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiGuards", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/fcmAdmin", () => ({ sendNewOrderNotification: vi.fn(async () => {}) }));

import { POST } from "@/app/api/create-order/route";
import { signCheckoutQuote } from "@/lib/checkoutQuoteToken";

const quote = {
  subtotal: 500,
  shipping: 50,
  total: 550,
  cartItems: [{ id: "p1", price: 500, qty: 1 }],
  lineItems: [
    {
      productTitle: '<script>alert(1)</script>',
      price: 500,
      quantity: 1,
      selectedSize: '"><b>L</b>',
      selectedColor: "red",
      image: "javascript:alert(1)",
    },
  ],
};

const formData = {
  firstName: "<b>Ali</b>",
  lastName: "x",
  phone: "01000000000",
  address: "<img src=x onerror=alert(1)>",
  city: "Cairo",
  governorate: "Cairo",
  email: "a@b.com",
};

const call = (body) =>
  POST(
    new Request("https://windeg.com/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  process.env.CHECKOUT_QUOTE_SECRET = "test-checkout-quote-secret-0123456789abcdef";
  process.env.RESEND_API_KEY = "re_test";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })));
});

describe("POST /api/create-order", () => {
  it("rejects the legacy card_success call without a signed quote", async () => {
    const res = await call({ paymentMethod: "card_success", orderId: "WND-1", subtotal: 1, shipping: 0, total: 1, formData });
    expect(res.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a forged quote token", async () => {
    const res = await call({ paymentMethod: "cod", orderId: "WND-1", quoteToken: "a.b", subtotal: 500, shipping: 50, total: 550, formData });
    expect(res.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("escapes customer-controlled fields in the confirmation emails", async () => {
    const quoteToken = await signCheckoutQuote(quote, "WND-1");
    const res = await call({
      paymentMethod: "cod",
      orderId: "WND-1",
      quoteToken,
      subtotal: 500,
      shipping: 50,
      total: 550,
      formData,
    });
    expect(res.status).toBe(200);
    const htmls = fetch.mock.calls.map(([, init]) => JSON.parse(init.body).html);
    expect(htmls.length).toBe(2);
    for (const html of htmls) {
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<b>Ali</b>");
      expect(html).not.toContain("javascript:");
      expect(html).toContain("&lt;b&gt;Ali&lt;/b&gt;");
    }
  });
});
