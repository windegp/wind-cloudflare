import { describe, expect, it } from "vitest";
import { canEditPayment, paymentPatchForFulfillment, paymentBadge, matchesStatusFilter } from "@/lib/fulfillmentStatus";

const o = (method, fin) => ({ "Payment Method": method, "Financial Status": fin });
describe("manual payment status", () => {
  it("only COD and InstaPay with pending/paid/refunded are editable", () => {
    expect(canEditPayment(o("cod", "pending"))).toBe(true);
    expect(canEditPayment(o("instapay", "paid"))).toBe(true);
    expect(canEditPayment(o("cod", "refunded"))).toBe(true);
    expect(canEditPayment(o("card", "paid"))).toBe(false);
    expect(canEditPayment(o("card", "pending_payment"))).toBe(false);
    expect(canEditPayment(o("cod", "abandoned"))).toBe(false);
    expect(canEditPayment(o("", "paid"))).toBe(false);
  });
  it("delivered turns pending COD into paid, nothing else", () => {
    expect(paymentPatchForFulfillment(o("cod", "pending"), "delivered")).toEqual({ "Financial Status": "paid" });
    expect(paymentPatchForFulfillment(o("cod", "pending"), "shipped")).toEqual({});
    expect(paymentPatchForFulfillment(o("instapay", "pending"), "delivered")).toEqual({});
    expect(paymentPatchForFulfillment(o("card", "pending_payment"), "delivered")).toEqual({});
    expect(paymentPatchForFulfillment(o("cod", "refunded"), "delivered")).toEqual({});
  });
  it("refunded has a badge and is excluded from unpaid", () => {
    expect(paymentBadge("refunded", "cod").label).toBe("تم رد المبلغ");
    expect(matchesStatusFilter({ "Financial Status": "refunded", "Fulfillment Status": "shipped" }, "unpaid")).toBe(false);
  });
});

import { paymentOptionLabel } from "@/lib/fulfillmentStatus";
describe("payment labels", () => {
  it("pending reads per method", () => {
    expect(paymentBadge("pending", "instapay").label).toBe("بانتظار تأكيد التحويل");
    expect(paymentOptionLabel("pending", "instapay")).toBe("بانتظار تأكيد التحويل");
    expect(paymentOptionLabel("pending", "cod")).toBe("الدفع عند الاستلام");
    expect(paymentOptionLabel("paid", "cod")).toBe("مدفوع");
  });
});
