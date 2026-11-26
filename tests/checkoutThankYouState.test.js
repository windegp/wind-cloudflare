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
import { resolveThankYouOrderId } from "@/lib/checkoutThankYouState";
it("prefers merchantOrderId when Kashier's redirect orderId is Kashier's own UUID (wallet payments)", () => {
  expect(resolveThankYouOrderId("c1adc31d-6b61-4426-b56c-42e710cffd8c", "WIND-70866-7G")).toBe("WIND-70866-7G");
});
it("keeps the normal orderId param when it is already ours", () => {
  expect(resolveThankYouOrderId("WIND-92581-R7", null)).toBe("WIND-92581-R7");
});
it("keeps durable ids", () => {
  expect(resolveThankYouOrderId("WIND-D-12345678-1234-4123-8123-123456789012", null)).toBe("WIND-D-12345678-1234-4123-8123-123456789012");
});
it("returns null when no param looks like our id, so the stored receipt is used", () => {
  expect(resolveThankYouOrderId("c1adc31d-6b61-4426-b56c-42e710cffd8c", null)).toBe(null);
  expect(resolveThankYouOrderId(null, null)).toBe(null);
});
