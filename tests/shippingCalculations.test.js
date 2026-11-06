import { describe, it, expect } from "vitest";
import { isFreeShippingThresholdMet } from "@/lib/shippingCalculations";

describe("حد الشحن المجاني بعد الخصم النقدي", () => {
  it("يحقق الحد عندما يساوي صافي المنتجات الحد تمامًا", () => {
    expect(isFreeShippingThresholdMet(1100, 100, 1000)).toBe(true);
  });

  it("لا يحقق الحد عندما ينخفض الصافي عنه بسبب الخصم", () => {
    expect(isFreeShippingThresholdMet(1100, 101, 1000)).toBe(false);
    expect(isFreeShippingThresholdMet(1100, 300, 1000)).toBe(false);
  });

  it("يحقق الحد عندما يظل صافي المنتجات أعلى منه بعد الخصم", () => {
    expect(isFreeShippingThresholdMet(1200, 100, 1000)).toBe(true);
  });

  it("الحد صفر أو السلة غير الرقمية لا يمنحان شحنًا مجانيًا بالقاعدة العامة", () => {
    expect(isFreeShippingThresholdMet(1200, 0, 0)).toBe(false);
    expect(isFreeShippingThresholdMet("invalid", 0, 1000)).toBe(false);
  });

  it("يتعامل بأمان مع خصم سلبي أو أكبر من subtotal", () => {
    expect(isFreeShippingThresholdMet(1100, -50, 1100)).toBe(true);
    expect(isFreeShippingThresholdMet(1100, 1500, 1)).toBe(false);
  });
});
