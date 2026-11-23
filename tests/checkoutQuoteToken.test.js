import { beforeEach, describe, expect, it } from "vitest";
import {
  signCheckoutQuote,
  verifyCheckoutQuote,
} from "@/lib/checkoutQuoteToken";

beforeEach(() => {
  process.env.CHECKOUT_QUOTE_SECRET = "test-checkout-quote-secret-0123456789abcdef";
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

describe("checkout quote secret", () => {
  it("fails closed when CHECKOUT_QUOTE_SECRET is missing, even if other secrets exist", async () => {
    const saved = { ...process.env };
    delete process.env.CHECKOUT_QUOTE_SECRET;
    process.env.FIREBASE_PRIVATE_KEY = "some-firebase-private-key-value-0123456789";
    process.env.KASHIER_API_KEY = "some-kashier-api-key-value-0123456789";
    try {
      await expect(signCheckoutQuote({ total: 1 }, "WND-TEST-001")).rejects.toThrow(/CHECKOUT_QUOTE_SECRET/);
    } finally {
      process.env = saved;
    }
  });

  it("rejects a too-short secret", async () => {
    const saved = process.env.CHECKOUT_QUOTE_SECRET;
    process.env.CHECKOUT_QUOTE_SECRET = "short";
    try {
      await expect(signCheckoutQuote({ total: 1 }, "WND-TEST-001")).rejects.toThrow(/CHECKOUT_QUOTE_SECRET/);
    } finally {
      process.env.CHECKOUT_QUOTE_SECRET = saved;
    }
  });
});
