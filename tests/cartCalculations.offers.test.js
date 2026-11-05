// ============================================================
// 🔗 دمج العروض مع حساب السلة (calculateAllTotals)
// ============================================================
import { describe, it, expect } from 'vitest';
import { calculateAllTotals } from '@/lib/cartCalculations';

const item = (price, qty = 1, extra = {}) => ({ id: `p${price}`, price, qty, ...extra });

const NTH = {
  id: 'nth', name: '٤٠٪ على القطعة التانية', active: true, type: 'nth_percent',
  config: { nth: 2, percent: 40 }, productScope: 'all', priority: 2,
};
const BXGY = {
  id: 'bxgy', name: 'اشتري ٣ وخد ١ مجاناً', active: true, type: 'buy_x_get_y',
  config: { buyQty: 3, getQty: 1 }, productScope: 'all', priority: 1,
};
const FIRST = { firstOrderEnabled: true, firstOrderDiscount: 10 };
const CART = [item(645), item(320)]; // 965 → عرض ٤٠٪ = ١٢٨

describe('بدون عروض = نفس السلوك القديم', () => {
  it.each([[undefined], [null], [[]]])('offers = %j', (offers) => {
    const old = calculateAllTotals(CART, null, null, false);
    const withParam = calculateAllTotals(CART, null, null, false, offers);
    expect(withParam).toEqual(old);
    expect(withParam).toMatchObject({ subtotal: 965, discount: 0, shipping: 70, total: 1035, discountSource: 'none', appliedOffer: null });
  });
  it('عروض غير نشطة أو منتهية لا تأثر', () => {
    const off = { ...NTH, active: false };
    expect(calculateAllTotals(CART, null, null, false, [off])).toMatchObject({ discount: 0, discountSource: 'none' });
  });
  it('سلة لا تؤهل لأي عرض', () => {
    expect(calculateAllTotals([item(645)], null, null, false, [NTH, BXGY]))
      .toMatchObject({ discount: 0, total: 715, discountSource: 'none' });
  });
});

describe('العرض لوحده', () => {
  it('يتطبق ويظهر في الإجمالي', () => {
    expect(calculateAllTotals(CART, null, null, false, [NTH, BXGY])).toMatchObject({
      subtotal: 965, discount: 128, shipping: 70, total: 907,
      discountSource: 'offer',
      appliedOffer: { id: 'nth', name: '٤٠٪ على القطعة التانية', type: 'nth_percent' },
    });
  });
  it('الشحن لسه بيتحسب على الـ subtotal قبل الخصم', () => {
    const settings = { shippingCost: 70, freeShippingThreshold: 900 };
    expect(calculateAllTotals(CART, null, settings, false, [NTH])).toMatchObject({ discount: 128, shipping: 0, total: 837 });
  });
});

describe('أفضل خصم واحد: العرض ضد الكود ضد خصم الطلب الأول', () => {
  it('العرض أعلى من الكود → العرض', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 100, code: 'BF100' };
    const r = calculateAllTotals(CART, promo, null, false, [NTH]);
    expect(r).toMatchObject({ discount: 128, discountSource: 'offer', total: 907 });
  });
  it('الكود أعلى من العرض → الكود', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 200, code: 'BF200' };
    const r = calculateAllTotals(CART, promo, null, false, [NTH]);
    expect(r).toMatchObject({ discount: 200, discountSource: 'promo', appliedOffer: null, total: 835 });
  });
  it('تعادل → الخصم القديم (الكود) هو اللي يتطبق', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 128, code: 'EQ' };
    expect(calculateAllTotals(CART, promo, null, false, [NTH])).toMatchObject({ discount: 128, discountSource: 'promo', appliedOffer: null });
  });
  it('العرض أعلى من خصم الطلب الأول → العرض', () => {
    // 965 × 10% = 96.5 → 97  <  128
    expect(calculateAllTotals(CART, null, FIRST, true, [NTH])).toMatchObject({ discount: 128, discountSource: 'offer' });
  });
  it('خصم الطلب الأول أعلى من العرض → خصم الطلب الأول', () => {
    const big = { ...FIRST, firstOrderDiscount: 20 }; // 193
    expect(calculateAllTotals(CART, null, big, true, [NTH])).toMatchObject({ discount: 193, discountSource: 'first_order' });
  });
  it('كود الشحن المجاني يفضل شغال مع العرض', () => {
    const promo = { valid: true, type: 'free_shipping', freeShipping: true, code: 'FS' };
    expect(calculateAllTotals(CART, promo, null, false, [NTH])).toMatchObject({ discount: 128, shipping: 0, total: 837, discountSource: 'offer' });
  });
  it('خصم الطلب الأول يقارن فعلياً مع الكود والعرض', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 50 };
    const result = calculateAllTotals(CART, promo, FIRST, true, []);
    expect(result).toMatchObject({ discount: 97, discountSource: 'first_order' });
  });
  it('الكود النقدي الأكبر يفوز على خصم الطلب الأول والعرض', () => {
    const promo = { valid: true, type: 'fixed', discountAmount: 500 };
    expect(calculateAllTotals(CART, promo, FIRST, true, [NTH, BXGY]).discountSource).toBe('promo');
  });
});

describe('سيناريوهات الجمعة البيضاء (سلة فعلية)', () => {
  const offers = [BXGY, NTH];
  it('٤ قطع بأسعار مختلفة → ٣٤٤', () => {
    const cart = [item(645), item(590), item(320), item(270)];
    expect(calculateAllTotals(cart, null, null, false, offers)).toMatchObject({ subtotal: 1825, discount: 344, total: 1551 });
  });
  it('٤ × ٦٤٥ → قطعة مجانية', () => {
    expect(calculateAllTotals([item(645, 4)], null, null, false, offers)).toMatchObject({ subtotal: 2580, discount: 645, shipping: 70, total: 2005 });
  });
});
