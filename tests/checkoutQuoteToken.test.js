import { beforeEach, describe, expect, it } from "vitest";
import {
  signCheckoutQuote,
  verifyCheckoutQuote,
} from "@/lib/checkoutQuoteToken";

beforeEach(() => {
  process.env.CHECKOUT_QUOTE_SECRET = "test-checkout-quote-secret";
});

describe("signed checkout quotes", () => {
  const quote = {
    subtotal: 965,
    discount: 128,
    shipping: 70,
    total: 907,
    discountSource: "offer",
    cartItems: [{ id: "product-a", price: 645, qty: 1 }],
  };

  it("verifies an unchanged quote for its exact order ID", async () => {
    const token = await signCheckoutQuote(quote, "WND-TEST-001");
    await expect(verifyCheckoutQuote(token, "WND-TEST-001")).resolves.toEqual(quote);
  });

  it("rejects use with a different order ID", async () => {
    const token = await signCheckoutQuote(quote, "WND-TEST-001");
    await expect(verifyCheckoutQuote(token, "WND-TEST-002")).resolves.toBeNull();
  });

  it("rejects tampered quote payloads", async () => {
    const token = await signCheckoutQuote(quote, "WND-TEST-001");
    const [payload, signature] = token.split(".");
    const tampered = (payload.startsWith("A") ? "B" : "A") + payload.slice(1) + "." + signature;
    await expect(verifyCheckoutQuote(tampered, "WND-TEST-001")).resolves.toBeNull();
  });

  it("rejects malformed tokens", async () => {
    await expect(verifyCheckoutQuote("not-a-token", "WND-TEST-001")).resolves.toBeNull();
  });
});
