import { describe, it, expect } from "vitest";
import { calculateAllTotals } from "@/lib/cartCalculations";

const item = (id, price, qty = 1, extra = {}) => ({ id, price, qty, ...extra });

describe("إعادة حساب كود الخصم مع تغيّر السلة", () => {
  it("يعيد حساب كود النسبة عند زيادة أو تقليل الكمية", () => {
    const promo = {
      valid: true,
      type: "percent",
      value: 20,
      discountAmount: 120,
      scope: "all",
    };

    const threeUnits = calculateAllTotals([item("A", 200, 3)], promo);
    const oneUnit = calculateAllTotals([item("A", 200, 1)], promo);

    expect(threeUnits.discount).toBe(120);
    expect(oneUnit.discount).toBe(40);
  });

  it("يحسب كود النسبة على المنتجات الموجودة في النطاق فقط", () => {
    const promo = {
      valid: true,
      type: "percent",
      value: 10,
      discountAmount: 80,
      scope: ["A"],
    };

    const result = calculateAllTotals([
      item("A", 300, 2),
      item("B", 500, 1),
    ], promo);

    expect(result.subtotal).toBe(1100);
    expect(result.discount).toBe(60);
    expect(result.total).toBe(1110);
  });

  it("يعيد حساب المبلغ الثابت ويمنع تجاوزه لقيمة السلة الحالية", () => {
    const promo = {
      valid: true,
      type: "fixed",
      value: 250,
      discountAmount: 250,
      scope: "all",
    };

    const largeCart = calculateAllTotals([item("A", 200, 2)], promo);
    const smallCart = calculateAllTotals([item("A", 80, 1)], promo);

    expect(largeCart.discount).toBe(250);
    expect(smallCart.discount).toBe(80);
    expect(smallCart.total).toBe(70);
  });

  it("يحد كود المبلغ الثابت من قيمة المنتجات المؤهلة فقط", () => {
    const promo = {
      valid: true,
      type: "fixed",
      value: 250,
      discountAmount: 250,
      scope: ["A"],
    };

    const result = calculateAllTotals([
      item("A", 80, 1),
      item("B", 500, 1),
    ], promo);

    expect(result.subtotal).toBe(580);
    expect(result.discount).toBe(80);
    expect(result.total).toBe(570);
  });

  it("يحافظ على التوافق مع بيانات الأكواد القديمة التي لا تحتوي value", () => {
    const promo = {
      valid: true,
      type: "percent",
      discountAmount: 35,
    };

    expect(calculateAllTotals([item("A", 200, 2)], promo).discount).toBe(35);
  });

  it("يظل الكود غير الصالح بلا خصم", () => {
    const promo = {
      valid: false,
      type: "percent",
      value: 20,
      discountAmount: 80,
    };

    expect(calculateAllTotals([item("A", 200, 2)], promo).discount).toBe(0);
  });

  it("لا يغيّر إعادة الحساب الخاصة بقسائم coupon_fixed", () => {
    const coupon = {
      valid: true,
      type: "coupon_fixed",
      value: 200,
      discountAmount: 200,
      maxDiscount: 120,
      scope: ["A"],
      minCart: 300,
    };

    const eligible = calculateAllTotals([
      item("A", 200, 2),
      item("B", 500, 1),
    ], coupon);
    const belowMinimum = calculateAllTotals([item("A", 200, 1)], coupon);

    expect(eligible.discount).toBe(120);
    expect(belowMinimum.discount).toBe(0);
  });
});
