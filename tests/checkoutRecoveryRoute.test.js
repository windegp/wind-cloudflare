import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/checkoutRecovery", () => ({ runCheckoutRecovery: vi.fn(async () => ({ errors: 0, jobs: 1 })) }));
vi.mock("@/lib/checkoutDeliveryHandlers", () => ({ checkoutDeliveryHandlers: vi.fn(() => ({})) }));
import { POST } from "@/app/api/internal/checkout-recovery/route";
import { runCheckoutRecovery } from "@/lib/checkoutRecovery";
const req = auth => new Request("https://windeg.com/api/internal/checkout-recovery", { method: "POST", headers: auth ? { authorization: auth } : {} });
beforeEach(() => { vi.clearAllMocks(); delete process.env.CHECKOUT_RECOVERY_ENABLED; process.env.CHECKOUT_RECOVERY_SECRET = "a".repeat(32); });
afterEach(() => { delete process.env.CHECKOUT_RECOVERY_ENABLED; delete process.env.CHECKOUT_RECOVERY_SECRET; });
it("disabled by default and requires valid bearer secret when enabled", async () => {
  expect((await POST(req())).status).toBe(503); process.env.CHECKOUT_RECOVERY_ENABLED = "true";
  expect((await POST(req())).status).toBe(401); expect(runCheckoutRecovery).not.toHaveBeenCalled();
  expect((await POST(req("Bearer " + "a".repeat(32)))).status).toBe(200);
});
it("partial errors produce a non-success response for external scheduler alerting", async () => {
  process.env.CHECKOUT_RECOVERY_ENABLED = "true"; runCheckoutRecovery.mockResolvedValueOnce({ errors: 1 });
  expect((await POST(req("Bearer " + "a".repeat(32)))).status).toBe(503);
});
