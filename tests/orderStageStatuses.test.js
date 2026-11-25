import { describe, expect, it } from "vitest";
import { orderStage } from "@/lib/orderTracking";
import { normalizeFulfillment, FULFILLMENT_OPTIONS } from "@/lib/fulfillmentStatus";

const o = (fin, ful) => ({ "Financial Status": fin, "Fulfillment Status": ful });

describe("orderStage with admin-set statuses", () => {
  it("maps each status to the customer-facing stage", () => {
    expect(orderStage(o("pending", "unfulfilled"))).toBe(2);
    expect(orderStage(o("pending", "prepared"))).toBe(2);
    expect(orderStage(o("paid", "shipped"))).toBe(3);
    expect(orderStage(o("paid", "delivered"))).toBe(4);
    expect(orderStage(o("paid", "returned"))).toBe(-1);
    expect(orderStage(o("paid", "cancelled"))).toBe(0);
    expect(orderStage(o("paid", "canceled"))).toBe(0);
  });
  it("keeps legacy values and the old behaviour", () => {
    expect(orderStage(o("paid", "fulfilled"))).toBe(3);
    expect(orderStage(o("paid", "partial"))).toBe(2);
    expect(orderStage(o("voided", "unfulfilled"))).toBe(0);
    expect(orderStage(o("pending_payment", undefined))).toBe(1);
    expect(orderStage(o("pending", undefined))).toBe(2);
  });
  it("normalizes and lists the six options", () => {
    expect(normalizeFulfillment("fulfilled")).toBe("shipped");
    expect(normalizeFulfillment("nonsense")).toBe("");
    expect(FULFILLMENT_OPTIONS.map((x) => x.value)).toEqual(["unfulfilled", "prepared", "shipped", "delivered", "returned", "cancelled"]);
  });
});
