import { afterEach, expect, it } from "vitest";
import { authorizedCheckoutRunner } from "@/lib/checkoutRecoveryAuth";
afterEach(() => delete process.env.CHECKOUT_RECOVERY_SECRET);
const req = header => new Request("https://windeg.com/api/internal/checkout-recovery", { headers: header ? { authorization: header } : {} });
it("fails closed for missing or weak config and absent or wrong credentials", () => {
  expect(authorizedCheckoutRunner(req())).toBe(false); process.env.CHECKOUT_RECOVERY_SECRET = "short";
  expect(authorizedCheckoutRunner(req("Bearer short"))).toBe(false);
  process.env.CHECKOUT_RECOVERY_SECRET = "a".repeat(32); expect(authorizedCheckoutRunner(req("Bearer " + "b".repeat(32)))).toBe(false);
  expect(authorizedCheckoutRunner(req("Bearer " + "a".repeat(32)))).toBe(true);
});
