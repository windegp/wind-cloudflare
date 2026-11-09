import { beforeEach, describe, expect, it, vi } from "vitest";

const pricingMocks = vi.hoisted(() => {
  class CheckoutQuoteError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.name = "CheckoutQuoteError";
      this.status = status;
    }
  }

  return {
    CheckoutQuoteError,
    createServerCheckoutQuote: vi.fn(),
  };
});

vi.mock("@/lib/serverCheckoutPricing", () => ({
  CheckoutQuoteError: pricingMocks.CheckoutQuoteError,
  createServerCheckoutQuote: pricingMocks.createServerCheckoutQuote,
}));

import { POST } from "@/app/api/validate-promo/route";

function makeRequest(body, url = "https://windeg.com/api/validate-promo") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/validate-promo", () => {
  beforeEach(() => {
    pricingMocks.createServerCheckoutQuote.mockReset();
  });

  it("rejects a missing coupon code without creating a checkout quote", async () => {
    const response = await POST(makeRequest({ code: "  ", cartItems: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ valid: false });
    expect(pricingMocks.createServerCheckoutQuote).not.toHaveBeenCalled();
  });

  it("delegates validation to trusted pricing and forwards gifts, customer, cart and shipping data", async () => {
    const appliedPromo = {
      valid: true,
      code: "SAVE50",
      type: "coupon_fixed",
      value: 50,
      discountAmount: 50,
      scope: ["A"],
      excludedProductIds: ["B"],
      excludeDiscounted: true,
      minCart: 100,
      maxDiscount: 50,
      freeShipping: false,
      message: "Coupon accepted",
    };
    pricingMocks.createServerCheckoutQuote.mockResolvedValue({ appliedPromo });

    const body = {
      code: " save50 ",
      customerEmail: "buyer@example.com",
      customerPhone: "201234567890",
      cartItems: [{ id: "A", qty: 1 }],
      customerChoiceGiftSelections: [{ selectionId: "gift-1", id: "G" }],
      offerGiftSelections: { "offer-gift:offer-A": { selectedSize: "M" } },
      governorate: "Cairo",
      subtotal: 999999,
    };

    const response = await POST(makeRequest(body));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(result).toMatchObject({ ...appliedPromo, valid: true });
    expect(result).not.toHaveProperty("lineItems");
    expect(pricingMocks.createServerCheckoutQuote).toHaveBeenCalledWith({
      cartItems: body.cartItems,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      promoCode: "save50",
      customerChoiceGiftSelections: body.customerChoiceGiftSelections,
      offerGiftSelections: body.offerGiftSelections,
      governorate: body.governorate,
      offersEnvironment: "production",
    });
  });

  it("uses the preview offer environment for non-production hosts", async () => {
    pricingMocks.createServerCheckoutQuote.mockResolvedValue({
      appliedPromo: { code: "SAVE50", type: "coupon_fixed", discountAmount: 50 },
    });

    await POST(makeRequest({ code: "SAVE50", cartItems: [{ id: "A", qty: 1 }] }, "http://localhost:3000/api/validate-promo"));

    expect(pricingMocks.createServerCheckoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ offersEnvironment: "preview" })
    );
  });

  it("returns an invalid result if trusted pricing does not apply a promo", async () => {
    pricingMocks.createServerCheckoutQuote.mockResolvedValue({ appliedPromo: null });

    const response = await POST(makeRequest({ code: "SAVE50", cartItems: [{ id: "A", qty: 1 }] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ valid: false });
  });

  it("returns the trusted pricing conflict status and message", async () => {
    pricingMocks.createServerCheckoutQuote.mockRejectedValue(
      new pricingMocks.CheckoutQuoteError("Coupon conflicts with another discount", 409)
    );

    const response = await POST(makeRequest({ code: "SAVE50", cartItems: [{ id: "A", qty: 1 }] }));

    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({
      valid: false,
      message: "Coupon conflicts with another discount",
    });
  });

  it("returns a no-store server error for unexpected quote failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    pricingMocks.createServerCheckoutQuote.mockRejectedValue(new Error("Firestore unavailable"));

    try {
      const response = await POST(makeRequest({ code: "SAVE50", cartItems: [{ id: "A", qty: 1 }] }));
      expect(response.status).toBe(500);
      expect(response.headers.get("Cache-Control")).toBe("no-store, private");
      expect(await response.json()).toMatchObject({ valid: false });
    } finally {
      errorSpy.mockRestore();
    }
  });
});