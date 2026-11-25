import { describe, expect, it } from "vitest";
import { matchesStatusFilter, paymentBadge } from "@/lib/fulfillmentStatus";

const o = (fin, ful) => ({ "Financial Status": fin, "Fulfillment Status": ful });
describe("orders list filters", () => {
  it("unfulfilled treats a missing status as unfulfilled", () => {
    expect(matchesStatusFilter(o("pending", undefined), "unfulfilled")).toBe(true);
    expect(matchesStatusFilter(o("paid", "shipped"), "unfulfilled")).toBe(false);
  });
  it("open vs archived", () => {
    expect(matchesStatusFilter(o("paid", "shipped"), "open")).toBe(true);
    for (const f of ["delivered", "returned", "cancelled"]) {
      expect(matchesStatusFilter(o("paid", f), "open")).toBe(false);
      expect(matchesStatusFilter(o("paid", f), "archived")).toBe(true);
    }
  });
  it("unpaid excludes paid and closed orders", () => {
    expect(matchesStatusFilter(o("pending", "unfulfilled"), "unpaid")).toBe(true);
    expect(matchesStatusFilter(o("paid", "unfulfilled"), "unpaid")).toBe(false);
    expect(matchesStatusFilter(o("pending", "cancelled"), "unpaid")).toBe(false);
  });
  it("payment badge labels", () => {
    expect(paymentBadge("paid", "card").label).toBe("مدفوع");
    expect(paymentBadge("pending", "cod").label).toBe("الدفع عند الاستلام");
    expect(paymentBadge("pending", "cod").tone).toBe("orange");
  });
});
