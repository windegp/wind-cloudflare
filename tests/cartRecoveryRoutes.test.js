import { beforeEach, describe, expect, it, vi } from "vitest";

const guardMocks = vi.hoisted(() => ({
  isSameOrigin: vi.fn(() => true),
  enforceRateLimit: vi.fn(() => null),
}));
const tokenMocks = vi.hoisted(() => ({ verifyCheckoutQuote: vi.fn() }));
const storeMocks = vi.hoisted(() => ({
  saveCartRecovery: vi.fn(),
  getCartRecovery: vi.fn(),
}));

vi.mock("@/lib/apiGuards", () => ({
  isSameOrigin: guardMocks.isSameOrigin,
  enforceRateLimit: guardMocks.enforceRateLimit,
}));
vi.mock("@/lib/checkoutQuoteToken", () => ({
  verifyCheckoutQuote: tokenMocks.verifyCheckoutQuote,
}));
vi.mock("@/lib/cartRecoveryStore", () => ({
  saveCartRecovery: storeMocks.saveCartRecovery,
  getCartRecovery: storeMocks.getCartRecovery,
}));
vi.mock("@/lib/serverOrderStore", () => ({
  OrderStoreError: class OrderStoreError extends Error {
    constructor(code, status = 503) {
      super(code);
      this.code = code;
      this.status = status;
    }
  },
}));

import { POST as savePOST } from "@/app/api/cart-recovery-save/route";
import { POST as readPOST } from "@/app/api/cart-recovery/route";
import { RECOVERY_LINK_TTL_MS, RECOVERY_WINDOW_MS } from "@/lib/cartRecovery";

function makeRequest(body, url) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://windeg.com" },
    body: JSON.stringify(body),
  });
}

const TOKEN = "123e4567-e89b-42d3-a456-426614174000";
const QUOTE = { total: 500, cartItems: [{ id: "P1", qty: 1, price: 500 }] };

beforeEach(() => {
  guardMocks.isSameOrigin.mockClear().mockReturnValue(true);
  guardMocks.enforceRateLimit.mockClear().mockReturnValue(null);
  tokenMocks.verifyCheckoutQuote.mockReset();
  storeMocks.saveCartRecovery.mockReset();
  storeMocks.getCartRecovery.mockReset();
});

describe("POST /api/cart-recovery-save", () => {
  it("stores only a server-signed quote and returns the recovery token", async () => {
    tokenMocks.verifyCheckoutQuote.mockResolvedValue(QUOTE);
    storeMocks.saveCartRecovery.mockResolvedValue(TOKEN);

    const response = await savePOST(
      makeRequest({ orderId: "WIND-12345-AB", quoteToken: "signed" }, "https://windeg.com/api/cart-recovery-save")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, token: TOKEN });
    expect(tokenMocks.verifyCheckoutQuote).toHaveBeenCalledWith("signed", "WIND-12345-AB");
    expect(storeMocks.saveCartRecovery).toHaveBeenCalledWith({ orderId: "WIND-12345-AB", quote: QUOTE, contact: null });
  });

  it("sanitizes browser-supplied contact data and stores it for prefill only", async () => {
    tokenMocks.verifyCheckoutQuote.mockResolvedValue(QUOTE);
    storeMocks.saveCartRecovery.mockResolvedValue(TOKEN);

    const response = await savePOST(
      makeRequest(
        {
          orderId: "WIND-12345-AB",
          quoteToken: "signed",
          contact: {
            firstName: "  إسلام  ",
            phone: "01000000001",
            address: "ع".repeat(500),
            cardNumber: "4111111111111111", // حقل غير معروف يتشال
          },
        },
        "https://windeg.com/api/cart-recovery-save"
      )
    );

    expect(response.status).toBe(200);
    const saved = storeMocks.saveCartRecovery.mock.calls[0][0];
    expect(saved.contact).toEqual({
      firstName: "إسلام",
      phone: "01000000001",
      address: "ع".repeat(200),
    });
  });

  it("stores nothing when contact has no usable fields", async () => {
    tokenMocks.verifyCheckoutQuote.mockResolvedValue(QUOTE);
    storeMocks.saveCartRecovery.mockResolvedValue(TOKEN);

    await savePOST(
      makeRequest(
        { orderId: "WIND-12345-AB", quoteToken: "signed", contact: { unknown: "x", firstName: "   " } },
        "https://windeg.com/api/cart-recovery-save"
      )
    );

    expect(storeMocks.saveCartRecovery).toHaveBeenCalledWith({ orderId: "WIND-12345-AB", quote: QUOTE, contact: null });
  });

  it("rejects a quote token that does not verify", async () => {
    tokenMocks.verifyCheckoutQuote.mockResolvedValue(null);

    const response = await savePOST(
      makeRequest({ orderId: "WIND-12345-AB", quoteToken: "forged" }, "https://windeg.com/api/cart-recovery-save")
    );

    expect(response.status).toBe(400);
    expect(storeMocks.saveCartRecovery).not.toHaveBeenCalled();
  });

  it("rejects an invalid order id", async () => {
    const response = await savePOST(
      makeRequest({ orderId: "../etc", quoteToken: "x" }, "https://windeg.com/api/cart-recovery-save")
    );
    expect(response.status).toBe(400);
    expect(tokenMocks.verifyCheckoutQuote).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests", async () => {
    guardMocks.isSameOrigin.mockReturnValue(false);
    const response = await savePOST(
      makeRequest({ orderId: "WIND-12345-AB", quoteToken: "x" }, "https://windeg.com/api/cart-recovery-save")
    );
    expect(response.status).toBe(403);
  });
});

describe("POST /api/cart-recovery", () => {
  const recoveryRecord = (overrides = {}) => {
    const now = Date.now();
    return {
      orderId: "WIND-12345-AB",
      quote: QUOTE,
      anchorMs: now - 60 * 1000,
      expiresAtMs: now - 60 * 1000 + RECOVERY_WINDOW_MS,
      ...overrides,
    };
  };

  it("returns the public cart for a live link", async () => {
    storeMocks.getCartRecovery.mockResolvedValue(recoveryRecord());

    const response = await readPOST(makeRequest({ token: TOKEN }, "https://windeg.com/api/cart-recovery"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.honored).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("WIND-12345-AB");
  });

  it("returns 404 for an unknown token", async () => {
    storeMocks.getCartRecovery.mockResolvedValue(null);
    const response = await readPOST(makeRequest({ token: TOKEN }, "https://windeg.com/api/cart-recovery"));
    expect(response.status).toBe(404);
    expect((await response.json()).found).toBe(false);
  });

  it("returns 404 after the link lifetime even though the snapshot exists", async () => {
    const now = Date.now();
    storeMocks.getCartRecovery.mockResolvedValue(
      recoveryRecord({
        anchorMs: now - RECOVERY_LINK_TTL_MS - 1000,
        expiresAtMs: now - RECOVERY_LINK_TTL_MS - 1000 + RECOVERY_WINDOW_MS,
      })
    );
    const response = await readPOST(makeRequest({ token: TOKEN }, "https://windeg.com/api/cart-recovery"));
    expect(response.status).toBe(404);
  });

  it("applies the CART_RECOVERY rate limit", async () => {
    storeMocks.getCartRecovery.mockResolvedValue(recoveryRecord());
    await readPOST(makeRequest({ token: TOKEN }, "https://windeg.com/api/cart-recovery"));
    expect(guardMocks.enforceRateLimit).toHaveBeenCalledWith(expect.anything(), "CART_RECOVERY");
  });
});
