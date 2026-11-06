// ============================================================
// 🔒 GOLDEN TESTS — تثبيت السلوك الحالي لحساب السلة
// الاختبارات دي بتستدعي الدوال بنفس شكل الاستدعاء القديم (من غير عروض)
// ولازم تفضل بتعدّي قبل وبعد إضافة نظام العروض.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  calculateSubtotal,
  calculateShipping,
  calculateDiscount,
  calculateTotal,
  calculateAllTotals,
} from '@/lib/cartCalculations';

const item = (price, qty = 1, extra = {}) => ({ id: `p${price}`, price, qty, ...extra });

const CART = [item(645, 1), item(320, 2)]; // 645 + 640 = 1285
const FIRST = { firstOrderEnabled: true, firstOrderDiscount: 10 };

describe('calculateSubtotal', () => {
  it('سلة فاضية أو غير مصفوفة = 0', () => {
    expect(calculateSubtotal([])).toBe(0);
    expect(calculateSubtotal(null)).toBe(0);
    expect(calculateSubtotal(undefined)).toBe(0);
  });
  it('يجمع السعر × الكمية', () => {
    expect(calculateSubtotal(CART)).toBe(1285);
  });
  it('يقبل أسعار وكميات نصية', () => {
    expect(calculateSubtotal([{ price: '100', qty: '2' }])).toBe(200);
  });
  it('يتجاهل القيم غير الرقمية', () => {
    expect(calculateSubtotal([{ price: 'abc', qty: 2 }])).toBe(0);
    expect(calculateSubtotal([{ price: 100, qty: 'x' }])).toBe(0);
  });
});

describe('calculateAllTotals — بدون خصومات', () => {
  it('سلة فاضية: الشحن الافتراضي فقط', () => {
    expect(calculateAllTotals([])).toMatchObject({ subtotal: 0, discount: 0, shipping: 70, total: 70 });
  });
  it('سلة عادية', () => {
    expect(calculateAllTotals(CART)).toMatchObject({ subtotal: 1285, discount: 0, shipping: 70, total: 1355 });
  });
});

describe('calculateAllTotals — أكواد الخصم', () => {
  it('كود نسبة', () => {
    const promo = { valid: true, type: 'percent', discountAmount: 129 };
    expect(calculateAllTotals(CART, promo)).toMatchObject({ subtotal: 1285, discount: 129, shipping: 70, total: 1226 });
  });
  it('كود مبلغ ثابت', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 200 };
    expect(calculateAllTotals(CART, promo)).toMatchObject({ discount: 200, shipping: 70, total: 1155 });
  });
  it('كود غير صالح لا يخصم', () => {
    const promo = { valid: false, type: 'fixed', discountAmount: 50 };
    expect(calculateAllTotals(CART, promo)).toMatchObject({ discount: 0, total: 1355 });
  });
  it('كود شحن مجاني: الشحن صفر والخصم صفر', () => {
    const promo = { valid: true, type: 'free_shipping', freeShipping: true, discountAmount: 70 };
    expect(calculateAllTotals(CART, promo)).toMatchObject({ discount: 0, shipping: 0, total: 1285 });
  });
  it('الإجمالي لا ينزل عن صفر', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 500 };
    expect(calculateAllTotals([item(100)], promo)).toMatchObject({ discount: 500, total: 0 });
  });
});

describe('calculateAllTotals — خصم الطلب الأول', () => {
  it('يتطبق بنسبة مقرّبة', () => {
    // 1285 × 10% = 128.5 → 129
    expect(calculateAllTotals(CART, null, FIRST, true)).toMatchObject({ discount: 129, shipping: 70, total: 1226 });
  });
  it('لا يتطبق لو غير مفعّل أو العميل مش جديد', () => {
    expect(calculateAllTotals(CART, null, { firstOrderEnabled: false, firstOrderDiscount: 10 }, true).discount).toBe(0);
    expect(calculateAllTotals(CART, null, FIRST, false).discount).toBe(0);
    expect(calculateAllTotals(CART, null, { firstOrderEnabled: true, firstOrderDiscount: 0 }, true).discount).toBe(0);
  });
  it('خصم الطلب الأول الأكبر من الكود هو الذي يفوز ولا يتجمع الخصمان', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 50 };
    expect(calculateAllTotals(CART, promo, FIRST, true)).toMatchObject({
      discount: 129,
      discountSource: 'first_order',
      total: 1226,
    });
  });
  it('الكود يفوز عندما يكون خصمه أكبر من خصم الطلب الأول', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 200 };
    expect(calculateAllTotals(CART, promo, FIRST, true)).toMatchObject({
      discount: 200,
      discountSource: 'promo',
      total: 1155,
    });
  });
  it('كود الشحن المجاني يتجمع مع خصم الطلب الأول', () => {
    const promo = { valid: true, type: 'free_shipping', freeShipping: true };
    expect(calculateAllTotals(CART, promo, FIRST, true)).toMatchObject({ discount: 129, shipping: 0, total: 1156 });
  });
});

describe('calculateShipping', () => {
  it('سعر الشحن من الإعدادات يغلب الثابت، ويقبل صفر', () => {
    expect(calculateShipping(null, 500, [], { shippingCost: 55, freeShippingThreshold: 0 })).toBe(55);
    expect(calculateShipping(null, 500, [], { shippingCost: 0, freeShippingThreshold: 0 })).toBe(0);
  });
  it('حد الشحن المجاني بيتحسب على قيمة المنتجات بعد الخصم النقدي', () => {
    const settings = { shippingCost: 70, freeShippingThreshold: 1000 };

    // 1100 - 300 = 800، فلا يتحقق الحد رغم أن subtotal الأصلي أعلى من 1000.
    expect(calculateAllTotals([item(1100)], { valid: true, type: 'fixed', discountAmount: 300 }, settings))
      .toMatchObject({ subtotal: 1100, discount: 300, shipping: 70, total: 870 });

    // 1100 - 100 = 1000، والحد يتحقق عند المساواة تمامًا.
    expect(calculateAllTotals([item(1100)], { valid: true, type: 'fixed', discountAmount: 100 }, settings))
      .toMatchObject({ subtotal: 1100, discount: 100, shipping: 0, total: 1000 });

    expect(calculateAllTotals([item(900)], null, settings)).toMatchObject({ shipping: 70, total: 970 });
  });
  it('الباقة بشحن مجاني', () => {
    expect(calculateAllTotals([item(300, 1, { bundleFreeShipping: true })])).toMatchObject({ shipping: 0, total: 300 });
  });
});

describe('calculateDiscount / calculateTotal (دوال مباشرة)', () => {
  it('calculateDiscount بنفس التوقيع القديم', () => {
    expect(calculateDiscount(null, 1000, false, null)).toBe(0);
    expect(calculateDiscount({ valid: true, type: 'percent', discountAmount: 90 }, 1000, false, null)).toBe(90);
    expect(calculateDiscount(null, 1000, true, FIRST)).toBe(100);
  });
  it('calculateTotal', () => {
    expect(calculateTotal(1000, 70, 100)).toBe(970);
    expect(calculateTotal(100, 0, 500)).toBe(0);
  });
});
