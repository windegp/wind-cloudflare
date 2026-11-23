import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/apiGuards", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/durableCheckout", () => ({ persistVerifiedCheckout: vi.fn(), CheckoutPersistenceError: class extends Error {} }));
vi.mock("@/lib/serverOrderStore", () => ({ assertOrderStoreConfiguration: vi.fn() }));
vi.mock("@/lib/checkoutPaymentSetup", () => ({ assertCheckoutPaymentConfiguration: vi.fn(), checkoutIframeData: vi.fn(async () => ({ hash: "hash" })) }));
import { POST } from "@/app/api/checkout-attempt/route";
import { persistVerifiedCheckout } from "@/lib/durableCheckout";
import { checkoutIframeData } from "@/lib/checkoutPaymentSetup";
const call = () => POST(new Request("https://windeg.com/api/checkout-attempt", { method: "POST", body: JSON.stringify({ orderId: "WIND-route-1234", paymentMethod: "card" }) }));
beforeEach(() => {
  vi.clearAllMocks(); delete process.env.CHECKOUT_DURABLE_ENABLED;
  process.env.FIREBASE_PROJECT_ID = "wind-reviews"; process.env.CHECKOUT_RECOVERY_ENABLED = "true";
  process.env.CHECKOUT_DURABLE_WEBHOOK_ENABLED = "true"; process.env.CHECKOUT_RECOVERY_SECRET = "x".repeat(32);
  persistVerifiedCheckout.mockResolvedValue({ orderId: "WIND-route-1234", status: "pending_payment", paymentMethod: "card", financials: { total: 100 } });
});
it("disabled by default, missing prerequisites fail closed before persistence", async () => {
  expect((await call()).status).toBe(503); process.env.CHECKOUT_DURABLE_ENABLED = "true";
  delete process.env.CHECKOUT_RECOVERY_SECRET; expect((await call()).status).toBe(503); expect(persistVerifiedCheckout).not.toHaveBeenCalled();
});
it("payment setup only returned after persistence is confirmed", async () => {
  process.env.CHECKOUT_DURABLE_ENABLED = "true";
  const response = await call(); expect(response.status).toBe(200); expect((await response.json()).iframeData).toEqual({ hash: "hash" });
  expect(persistVerifiedCheckout.mock.invocationCallOrder[0]).toBeLessThan(checkoutIframeData.mock.invocationCallOrder[0]);
});
it("already paid retry never starts another payment", async () => {
  process.env.CHECKOUT_DURABLE_ENABLED = "true"; persistVerifiedCheckout.mockResolvedValueOnce({ orderId: "WIND-route-1234", status: "paid", paymentMethod: "card", financials: { total: 100 } });
  expect((await call()).status).toBe(200); expect(checkoutIframeData).not.toHaveBeenCalled();
});
it("uncertain persistence never starts payment or reports success", async () => {
  process.env.CHECKOUT_DURABLE_ENABLED = "true"; persistVerifiedCheckout.mockRejectedValueOnce(new Error("network"));
  expect((await call()).status).toBe(503); expect(checkoutIframeData).not.toHaveBeenCalled();
});
