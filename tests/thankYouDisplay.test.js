import { describe, expect, it } from "vitest";
import { knownPaymentMethod, parseDisplayRecord, mergeDisplayOrder, formatMoney } from "@/lib/thankYouDisplay";

describe("thank-you display helpers", () => {
  it("only labels known payment methods (no silent card default)", () => {
    expect(knownPaymentMethod("cod")).toBe("cod");
    expect(knownPaymentMethod("instapay")).toBe("instapay");
    expect(knownPaymentMethod("card")).toBe("card");
    expect(knownPaymentMethod(undefined)).toBeNull();
    expect(knownPaymentMethod("weird")).toBeNull();
  });
  it("accepts a display record only for the same order", () => {
    const raw = JSON.stringify({ orderId: "WIND-1", paymentMethod: "cod" });
    expect(parseDisplayRecord(raw, "WIND-1").paymentMethod).toBe("cod");
    expect(parseDisplayRecord(raw, "WIND-2")).toBeNull();
    expect(parseDisplayRecord("not json", "WIND-1")).toBeNull();
    expect(parseDisplayRecord(null, "WIND-1")).toBeNull();
  });
  it("keeps the verified receipt values and fills gaps from the display record", () => {
    const merged = mergeDisplayOrder({ orderId: "A", total: 500, paymentMethod: "card" }, { orderId: "A", total: 999, paymentMethod: "cod", shipping: 50 });
    expect(merged.total).toBe(500);
    expect(merged.paymentMethod).toBe("card");
    expect(merged.shipping).toBe(50);
    expect(mergeDisplayOrder(null, { orderId: "A" })).toEqual({ orderId: "A" });
    expect(mergeDisplayOrder({ orderId: "A" }, null)).toEqual({ orderId: "A" });
  });
  it("formats money", () => {
    expect(formatMoney(1250)).toBe("1,250 ج.م");
    expect(formatMoney("x")).toBe("");
  });
});
