import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map();
let kvMode = "ok";
vi.mock("@/lib/kv-cache", () => ({
  getKV: vi.fn(async () => {
    if (kvMode === "none") return null;
    if (kvMode === "throw") return { get: async () => { throw new Error("kv down"); }, put: async () => {} };
    return { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
  }),
}));
vi.mock("@/lib/apiGuards", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/fcmAdmin", () => ({ sendNewOrderNotification: vi.fn(async () => {}) }));

import { POST } from "@/app/api/create-order/route";
import { claimOrderSend } from "@/lib/orderSendCap";
import { signCheckoutQuote } from "@/lib/checkoutQuoteToken";

const quote = { subtotal: 500, shipping: 50, total: 550, cartItems: [{ id: "p1", price: 500, qty: 1 }], lineItems: [{ productTitle: "P", price: 500, quantity: 1 }] };
const formData = { firstName: "Ali", lastName: "x", phone: "01000000000", address: "a", city: "Cairo", governorate: "Cairo", email: "a@b.com" };

const send = async (orderId) => {
  const quoteToken = await signCheckoutQuote(quote, orderId);
  return POST(new Request("https://windeg.com/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethod: "cod", orderId, quoteToken, subtotal: 500, shipping: 50, total: 550, formData }),
  }));
};

beforeEach(() => {
  store.clear();
  kvMode = "ok";
  process.env.CHECKOUT_QUOTE_SECRET = "test-checkout-quote-secret-0123456789abcdef";
  process.env.RESEND_API_KEY = "re_test";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })));
});

describe("per-order send cap", () => {
  it("allows two sends then returns 429 without sending anything", async () => {
    expect((await send("WND-1")).status).toBe(200);
    expect((await send("WND-1")).status).toBe(200);
    fetch.mockClear();
    const third = await send("WND-1");
    expect(third.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts each order ID separately", async () => {
    await send("WND-1"); await send("WND-1");
    expect((await send("WND-2")).status).toBe(200);
  });

  it("fails open when KV is missing or errors", async () => {
    kvMode = "none";
    expect(await claimOrderSend("WND-3")).toBe(true);
    kvMode = "throw";
    expect(await claimOrderSend("WND-3")).toBe(true);
  });
});
