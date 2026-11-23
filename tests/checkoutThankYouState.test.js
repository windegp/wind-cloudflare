import { expect, it } from "vitest";
import { resolveThankYouState } from "@/lib/checkoutThankYouState";
const legacy = "WIND-92581-R7";
const durable = "WIND-D-12345678-1234-4123-8123-123456789012";
it("legacy COD/InstaPay redirect with removed pendingOrder never enters durable warning", () => {
  expect(resolveThankYouState(legacy, [])).toEqual({ durable: false, receipt: null });
});
it("stale durable data in the same browser cannot hijack a legacy confirmation", () => {
  expect(resolveThankYouState(legacy, [JSON.stringify({ orderId: durable, durable: true })])).toEqual({ durable: false, receipt: null });
});
it("selects matching receipt rather than first stored record", () => {
  expect(resolveThankYouState(legacy, [JSON.stringify({ orderId: durable, durable: true }), JSON.stringify({ orderId: legacy })])).toEqual({ durable: false, receipt: { orderId: legacy } });
});
it("legacy malformed or missing storage does not show payment-pending page", () => {
  expect(resolveThankYouState(legacy, ["broken-json", null]).durable).toBe(false);
});
it("durable order with no receipt still requires verification even when creation gate is off", () => {
  expect(resolveThankYouState(durable, [])).toEqual({ durable: true, receipt: null });
});
it("valid durable receipt and no-url provider redirect retains verification", () => {
  expect(resolveThankYouState(null, [JSON.stringify({ orderId: durable, durable: true })]).durable).toBe(true);
});
