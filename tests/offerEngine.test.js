import { describe, it, expect } from 'vitest';
import {
  computeBestOffer,
  computeOfferDiscount,
  computeOfferBenefits,
  computeStackedOfferBenefits,
  isFreeShippingRuleEligible,
  isOfferLive,
  cairoDateString,
} from '@/lib/offerEngine';

const item = (price, qty = 1, extra = {}) => ({ id: `p${price}`, price, qty, ...extra });

const BXGY = {
  id: 'bxgy', name: 'اشتري ٣ وخد ١ مجاناً', active: true, type: 'buy_x_get_y',
  config: { buyQty: 3, getQty: 1 }, productScope: 'all', priority: 1,
};
const NTH = {
  id: 'nth', name: '٤٠٪ على القطعة التانية', active: true, type: 'nth_percent',
  config: { nth: 2, percent: 40 }, productScope: 'all', priority: 2,
};
const OFFERS = [BXGY, NTH];

describe('سيناريوهات "أفضل عرض يكسب"', () => {
  it('٦٤٥ + ٣٢٠ → ٤٠٪ على التانية = ١٢٨', () => {
    const r = computeBestOffer([item(645), item(320)], OFFERS);
    expect(r.discount).toBe(128);
    expect(r.offer).toEqual({ id: 'nth', name: '٤٠٪ على القطعة التانية', type: 'nth_percent' });
  });
  it('٦٤٥ + ٥٩٠ + ٣٢٠ → ٢٣٦ (الخصم على الأرخص في الزوج الأول)', () => {
    expect(computeBestOffer([item(645), item(590), item(320)], OFFERS).discount).toBe(236);
  });
  it('٦٤٥ + ٥٩٠ + ٣٢٠ + ٢٧٠ → ٢٣٦ (خصم واحد على القطعة الثانية)', () => {
    const r = computeBestOffer([item(645), item(590), item(320), item(270)], OFFERS);
    expect(r.discount).toBe(236);
    expect(r.offer.id).toBe('nth');
    // Each priced line represents a different product, so 3+1 cannot combine them.
    expect(r.candidates.map((c) => [c.id, c.discount])).toEqual([['nth', 236]]);
  });
  it('لا يجمع عرض القطعة المجانية كميات منتجات مختلفة', () => {
    const cart = [item(645, 3, { id: 'A' }), item(590, 1, { id: 'B' })];
    expect(computeOfferDiscount(cart, BXGY)).toBe(0);
    expect(computeBestOffer(cart, [BXGY]).offer).toBeNull();
  });
  it('يمنح هدية مستقلة لكل منتج يحقق الشرط، مرة واحدة فقط لكل منتج', () => {
    const cart = [
      item(645, 6, { id: 'A' }),
      item(320, 4, { id: 'B' }),
      item(270, 3, { id: 'C' }),
    ];
    const result = computeBestOffer(cart, [BXGY]);
    expect(result.discount).toBe(965); // هدية واحدة من A وهدية واحدة من B فقط
    const gifts = result.offerBenefits.lines.flatMap((line) => line.discountedUnits);
    expect(gifts).toHaveLength(2);
    expect(gifts.every((unit) => unit.free)).toBe(true);
    expect(result.offerBenefits.lines.map((line) => line.cartIndex)).toEqual([0, 1]);
  });
  it('يجمع نفس المنتج عبر أسطر ألوان أو مقاسات مختلفة', () => {
    const cart = [
      item(645, 2, { id: 'A-black', handle: 'product-a', selectedColor: 'أسود' }),
      item(645, 2, { id: 'A-white', handle: 'product-a', selectedColor: 'أبيض' }),
    ];
    const result = computeBestOffer(cart, [BXGY]);
    expect(result.discount).toBe(645);
    expect(result.offerBenefits.lines.flatMap((line) => line.discountedUnits)).toHaveLength(1);
  });
  it('٤ × ٦٤٥ → اشتري ٣ وخد ١ (٦٤٥ أحسن من ٥١٦)', () => {
    const r = computeBestOffer([item(645, 4)], OFFERS);
    expect(r.discount).toBe(645);
    expect(r.offer.id).toBe('bxgy');
  });
  it('٦ × ٦٤٥ → يظل عرض ٣+١ هو الفائز ويمنح قطعة مجانية واحدة فقط', () => {
    const r = computeBestOffer([item(645, 6)], OFFERS);
    expect(r.discount).toBe(645);
    expect(r.offer.id).toBe('bxgy');
    expect(r.appliedOffers).toHaveLength(1);
    expect(r.offerBenefits.lines[0].regularQty).toBe(5);
    expect(r.offerBenefits.lines[0].discountedUnits).toHaveLength(1);
    expect(r.offerBenefits.lines[0].discountedUnits[0].free).toBe(true);
  });
  it('٨ × ٦٤٥ → يظل عرض ٣+١ قطعة مجانية واحدة فقط مهما زادت الكمية', () => {
    const r = computeBestOffer([item(645, 8)], OFFERS);
    expect(r.discount).toBe(645);
    expect(r.offer.id).toBe('bxgy');
    expect(r.appliedOffers).toHaveLength(1);
    expect(r.offerBenefits.lines[0].regularQty).toBe(7);
    expect(r.offerBenefits.lines[0].discountedUnits).toHaveLength(1);
    expect(r.offerBenefits.lines[0].discountedUnits[0].free).toBe(true);
  });
  it('قطعة واحدة → لا عرض', () => {
    const result = computeBestOffer([item(645)], OFFERS);
    expect(result.discount).toBe(0);
    expect(result.appliedOffers).toEqual([]);
  });
  it('لا يدمج عرضين حتى لو كان في مستند العرض القديم stackWithOfferIds', () => {
    const cart = [item(645), item(590), item(320), item(270)];
    const legacyStackedOffer = { ...NTH, stackWithOfferIds: ["bxgy"] };
    const result = computeBestOffer(cart, [legacyStackedOffer, BXGY]);
    expect(result.offer.id).toBe("nth");
    expect(result.appliedOffers.map((offer) => offer.id)).toEqual(["nth"]);
    expect(result.offerBenefits.offers.map((offer) => offer.id)).toEqual(["nth"]);
    expect(result.discount).toBe(344);

    const legacyHelperResult = computeStackedOfferBenefits(cart, [legacyStackedOffer, BXGY]);
    expect(legacyHelperResult.offers.map((offer) => offer.id)).toEqual(["nth"]);
    expect(legacyHelperResult.discount).toBe(344);
  });
  it.each([4, 5, 6, 8, 12])('من ٤ إلى %i قطعة: يظل عرض ٣+١ ثابتًا بمنفعة واحدة', (quantity) => {
    const result = computeBestOffer([item(645, quantity)], OFFERS);
    expect(result.offer.id).toBe("bxgy");
    expect(result.appliedOffers).toHaveLength(1);
    expect(result.discount).toBe(645);
    expect(result.offerBenefits.lines[0].regularQty).toBe(quantity - 1);
    expect(result.offerBenefits.lines[0].discountedUnits).toHaveLength(1);
    expect(result.offerBenefits.lines[0].discountedUnits[0].free).toBe(true);
  });
  it('عرض ٤٠٪ على القطعة الثانية يمنح خصمًا على قطعة واحدة فقط عند أي كمية', () => {
    const offer = { ...NTH };
    for (const quantity of [2, 3, 4, 8]) {
      const result = computeBestOffer([item(645, quantity)], [offer]);
      expect(result.discount).toBe(258);
      expect(result.offer.id).toBe("nth");
      expect(result.offerBenefits.lines[0].regularQty).toBe(quantity - 1);
      expect(result.offerBenefits.lines[0].discountedUnits).toHaveLength(1);
      expect(result.offerBenefits.lines[0].discountedUnits[0].discount).toBe(258);
      expect(result.offerBenefits.lines[0].discountedUnits[0].free).toBe(false);
    }
  });
  it('يتجاهل أي إعداد قديم لعدد الاستخدامات ويطبّق المنفعة مرة واحدة فقط', () => {
    const legacyUnlimited = {
      ...BXGY,
      config: { ...BXGY.config, maxUsesPerOrder: 0 },
    };
    const cart = [item(645, 8)];
    expect(computeOfferDiscount(cart, legacyUnlimited)).toBe(645);
    const result = computeBestOffer(cart, [legacyUnlimited]);
    expect(result.discount).toBe(645);
    expect(result.offerBenefits.lines[0].regularQty).toBe(7);
    expect(result.offerBenefits.lines[0].discountedUnits).toHaveLength(1);
  });
  it('قاعدة المتجر القديمة لا تفعّل الشحن من قسم المنتجات المحددة', () => {
    expect(isFreeShippingRuleEligible(
      [item(645)],
      { enabled: true, scope: "store", productIds: [] }
    )).toBe(false);
  });
  it('لا يفعّل الشحن المحدد دون اختيار أي منتج', () => {
    expect(isFreeShippingRuleEligible(
      [item(645, 3)],
      { enabled: true, scope: "selected", productIds: [], condition: "quantity", minQuantity: 1 }
    )).toBe(false);
  });
  it('شحن المنتجات المحددة يُحسب بعدد القطع المستهدفة فقط', () => {
    const cart = [item(500, 2, { id: "A" }), item(900, 3, { id: "B" })];
    const rule = { enabled: true, scope: "selected", productIds: ["A"], condition: "quantity", minQuantity: 2 };
    expect(isFreeShippingRuleEligible(cart, rule)).toBe(true);
    expect(isFreeShippingRuleEligible([{ ...cart[0], qty: 1 }, cart[1]], rule)).toBe(false);
  });
  it('شحن المنتجات المحددة يُحسب بقيمة المنتجات المستهدفة فقط', () => {
    const cart = [item(300, 2, { id: "A" }), item(900, 1, { id: "B" })];
    const rule = { enabled: true, scope: "selected", productIds: ["A"], condition: "subtotal", minSubtotal: 600 };
    expect(isFreeShippingRuleEligible(cart, rule)).toBe(true);
    expect(isFreeShippingRuleEligible([{ ...cart[0], qty: 1 }, cart[1]], rule)).toBe(false);
  });
  it('ترتيب القطع في السلة لا يغيّر النتيجة', () => {
    const a = computeBestOffer([item(320), item(645), item(270), item(590)], OFFERS);
    const b = computeBestOffer([item(645), item(590), item(320), item(270)], OFFERS);
    expect(a.discount).toBe(b.discount);
  });
  it('قطعة بكمية ٢ + قطعة تانية: الزوج الأول من نفس القطعة', () => {
    // الوحدات: 645, 645, 320 → زوج (645,645) = 258
    expect(computeBestOffer([item(645, 2), item(320)], [NTH]).discount).toBe(258);
  });
});

describe('التعادل', () => {
  const fixed = (id, priority) => ({
    id, name: id, active: true, type: 'cart_fixed', config: { amount: 100 }, productScope: 'all', priority,
  });
  const cart = [item(500)];
  it('الأولوية الأقل تكسب', () => {
    expect(computeBestOffer(cart, [fixed('a', 5), fixed('b', 2)]).offer.id).toBe('b');
  });
  it('نفس الأولوية → الـ id أبجدياً (نتيجة ثابتة)', () => {
    expect(computeBestOffer(cart, [fixed('z', 1), fixed('m', 1)]).offer.id).toBe('m');
    expect(computeBestOffer(cart, [fixed('m', 1), fixed('z', 1)]).offer.id).toBe('m');
  });
});

describe('نطاق المنتجات', () => {
  const sel = (ids, extra = {}) => ({
    ...NTH, productScope: 'selected', productIds: ids, ...extra,
  });
  it('منتجات محددة فقط (بالـ id)', () => {
    const cart = [item(645, 1, { id: 'A' }), item(320, 1, { id: 'B' })];
    expect(computeOfferDiscount(cart, sel(['A', 'B']))).toBe(128);
    expect(computeOfferDiscount(cart, sel(['A']))).toBe(0); // قطعة واحدة مؤهلة
  });
  it('المطابقة بالـ handle كمان', () => {
    const cart = [item(645, 1, { id: 1, handle: 'english-pullover' }), item(320, 1, { id: 2, handle: 'x' })];
    expect(computeOfferDiscount(cart, sel(['english-pullover', 'x']))).toBe(128);
  });
  it('المنتجات المستثناة', () => {
    const cart = [item(645, 1, { id: 'A' }), item(320, 1, { id: 'B' }), item(100, 1, { id: 'C' })];
    expect(computeOfferDiscount(cart, { ...NTH, excludedProductIds: ['C'] })).toBe(128);
    expect(computeOfferDiscount(cart, { ...NTH, excludedProductIds: ['B', 'C'] })).toBe(0);
  });
  it('استبعاد المنتجات اللي عليها خصم (compareAtPrice > price)', () => {
    const cart = [item(645, 1, { id: 'A', compareAtPrice: 800 }), item(320, 1, { id: 'B' }), item(300, 1, { id: 'C' })];
    expect(computeOfferDiscount(cart, { ...NTH, excludeDiscounted: true })).toBe(120); // (320,300) → 300×0.4
    expect(computeOfferDiscount(cart, NTH)).toBe(computeOfferDiscount(cart, { ...NTH, excludeDiscounted: false }));
  });
  it('compareAtPrice مساوي أو أقل من السعر لا يُعتبر خصم', () => {
    const cart = [item(645, 1, { id: 'A', compareAtPrice: 645 }), item(320, 1, { id: 'B', compareAtPrice: 100 })];
    expect(computeOfferDiscount(cart, { ...NTH, excludeDiscounted: true })).toBe(128);
  });
});

describe('الحدود والسقوف', () => {
  it('حد أدنى للسلة (على المنتجات المؤهلة)', () => {
    const cart = [item(645), item(320)]; // 965
    expect(computeOfferDiscount(cart, { ...NTH, minCart: 965 })).toBe(128);
    expect(computeOfferDiscount(cart, { ...NTH, minCart: 966 })).toBe(0);
  });
  it('أقصى خصم', () => {
    expect(computeOfferDiscount([item(645, 4)], { ...BXGY, maxDiscount: 400 })).toBe(400);
    expect(computeOfferDiscount([item(645, 4)], { ...BXGY, maxDiscount: 0 })).toBe(645); // صفر = بدون سقف
  });
  it('خصم نسبة على السلة مع تقريب', () => {
    const offer = { id: 'c', active: true, type: 'cart_percent', config: { percent: 15 }, productScope: 'all' };
    expect(computeOfferDiscount([item(645), item(320, 2)], offer)).toBe(193); // 1285×15% = 192.75
  });
  it('خصم ثابت لا يتجاوز إجمالي المنتجات المؤهلة', () => {
    const offer = { id: 'f', active: true, type: 'cart_fixed', config: { amount: 500 }, productScope: 'all' };
    expect(computeOfferDiscount([item(300)], offer)).toBe(300);
  });
  it('الخصم رقم صحيح دايماً', () => {
    const d = computeOfferDiscount([item(99), item(99)], { ...NTH });
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBe(40); // 99×0.4 = 39.6
  });
  it('خصم ١٠٠٪ على السلة لا يتجاوز إجمالي سلة بكسور', () => {
    const offer = { id: 'p', active: true, type: 'cart_percent', config: { percent: 100 }, productScope: 'all' };
    const d = computeOfferDiscount([item(99.5)], offer);
    expect(d).toBeLessThanOrEqual(99.5);
  });
});

describe('إعدادات غير صالحة = لا خصم (بدون أخطاء)', () => {
  const cart = [item(645, 4)];
  it.each([
    ['buyQty = 0', { ...BXGY, config: { buyQty: 0, getQty: 1 } }],
    ['getQty ناقص', { ...BXGY, config: { buyQty: 3 } }],
    ['buyQty كسر', { ...BXGY, config: { buyQty: 2.5, getQty: 1 } }],
    ['nth = 1', { ...NTH, config: { nth: 1, percent: 40 } }],
    ['نسبة ١٥٠', { ...NTH, config: { nth: 2, percent: 150 } }],
    ['نسبة صفر', { ...NTH, config: { nth: 2, percent: 0 } }],
    ['نوع غير معروف', { ...NTH, type: 'weird' }],
    ['بدون config', { ...NTH, config: undefined }],
    ['مبلغ ثابت سالب', { id: 'x', type: 'cart_fixed', config: { amount: -5 } }],
  ])('%s', (_label, offer) => {
    expect(computeOfferDiscount(cart, offer)).toBe(0);
  });
  it('مدخلات فاضية أو غير صالحة', () => {
    expect(computeBestOffer([], OFFERS).discount).toBe(0);
    expect(computeBestOffer(null, OFFERS).discount).toBe(0);
    expect(computeBestOffer(cart, null).discount).toBe(0);
    expect(computeBestOffer(cart, []).discount).toBe(0);
    expect(computeBestOffer(cart, [null, undefined, {}]).discount).toBe(0);
  });
  it('أسعار وكميات غير صالحة لا تكسر الحساب', () => {
    const bad = [{ id: 'a', price: 'abc', qty: 2 }, { id: 'b', price: 100, qty: -1 }, { id: 'c', price: 100, qty: 0 }];
    expect(computeBestOffer(bad, OFFERS).discount).toBe(0);
  });
  it('لا يعدّل المدخلات', () => {
    const cart2 = Object.freeze([Object.freeze(item(645, 4))]);
    const offers = Object.freeze([Object.freeze({ ...BXGY, config: Object.freeze({ ...BXGY.config }) })]);
    expect(() => computeBestOffer(cart2, offers)).not.toThrow();
  });
});

describe('التواريخ (بتوقيت القاهرة)', () => {
  const live = (extra) => isOfferLive({ ...NTH, ...extra }, NOW);
  // 22:30 UTC يوم 27 = 00:30 يوم 28 بتوقيت القاهرة (UTC+2 في نوفمبر)
  const NOW = new Date('2026-11-27T22:30:00Z');

  it('تاريخ القاهرة صحيح', () => {
    expect(cairoDateString(NOW)).toBe('2026-11-28');
    expect(cairoDateString(new Date('2026-11-27T21:59:00Z'))).toBe('2026-11-27');
  });
  it('أول وآخر يوم شاملين', () => {
    expect(live({ startsAt: '2026-11-28', endsAt: '2026-11-28' })).toBe(true);
    expect(live({ endsAt: '2026-11-27' })).toBe(false);
    expect(live({ startsAt: '2026-11-29' })).toBe(false);
    expect(live({ startsAt: '2026-11-20', endsAt: '2026-11-30' })).toBe(true);
  });
  it('بدون تواريخ = مفتوح', () => {
    expect(live({ startsAt: null, endsAt: '' })).toBe(true);
    expect(live({})).toBe(true);
  });
  it('active لازم تكون true بالظبط', () => {
    expect(live({ active: false })).toBe(false);
    expect(live({ active: undefined })).toBe(false);
    expect(live({ active: 'true' })).toBe(false);
  });
  it('تاريخ غير مفهوم (مثل Timestamp object) → العرض متوقف للأمان', () => {
    expect(live({ endsAt: { seconds: 1, nanoseconds: 0 } })).toBe(false);
    expect(live({ startsAt: 'غدا' })).toBe(false);
  });
  it('computeBestOffer يتجاهل العروض المنتهية', () => {
    const expired = { ...NTH, endsAt: '2026-11-27' };
    expect(computeBestOffer([item(645), item(320)], [expired], NOW).discount).toBe(0);
    expect(computeBestOffer([item(645), item(320)], [expired, { ...BXGY }], NOW).discount).toBe(0);
  });
});

describe('قسائم الشراء لا تعمل تلقائيًا', () => {
  it('يتجاهل القسيمة في اختيار العرض التلقائي حتى يدخل العميل كودها', () => {
    const coupon = {
      id: 'coupon-200', name: 'قسيمة 200', active: true, type: 'coupon_fixed',
      couponCode: 'WIND200', config: { amount: 200 }, productScope: 'all',
    };
    const result = computeBestOffer([item(645, 2)], [coupon]);
    expect(result.discount).toBe(0);
    expect(result.offer).toBeNull();
    expect(result.appliedOffers).toEqual([]);
  });
});

describe('تفصيل القطع المستفيدة من العرض', () => {
  it('يفصل القطعة المجانية عن الثلاث قطع المدفوعة في نفس السطر', async () => {
    const { computeOfferBenefits } = await import('@/lib/offerEngine');
    const result = computeOfferBenefits([item(645, 4)], BXGY);
    expect(result.discount).toBe(645);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].regularQty).toBe(3);
    expect(result.lines[0].discountedUnits).toMatchObject([
      { unitIndex: 3, originalPrice: 645, discount: 645, finalPrice: 0, free: true },
    ]);
  });

  it('يحدد القطعة الثانية بخصم 40% ويترك الأولى بسعرها', async () => {
    const { computeOfferBenefits } = await import('@/lib/offerEngine');
    const result = computeOfferBenefits([item(645), item(320)], NTH);
    expect(result.discount).toBe(128);
    expect(result.lines).toMatchObject([
      { cartIndex: 1, regularQty: 0, discountedUnits: [{ originalPrice: 320, discount: 128, finalPrice: 192, free: false }] },
    ]);
  });

  it('يوزع خصم السلة النسبي على كل القطع المؤهلة', async () => {
    const { computeOfferBenefits } = await import('@/lib/offerEngine');
    const cartOffer = { id: 'cp', active: true, type: 'cart_percent', config: { percent: 10 }, productScope: 'all' };
    const result = computeOfferBenefits([item(100), item(200)], cartOffer);
    expect(result.discount).toBe(30);
    expect(result.lines.flatMap((line) => line.discountedUnits).reduce((sum, unit) => sum + unit.discount, 0)).toBe(30);
    expect(result.lines).toHaveLength(2);
  });

  it('يحافظ على حد الخصم الأقصى عند توزيع الميزة', async () => {
    const { computeOfferBenefits } = await import('@/lib/offerEngine');
    const result = computeOfferBenefits([item(645, 4)], { ...BXGY, maxDiscount: 300 });
    expect(result.discount).toBe(300);
    expect(result.lines.flatMap((line) => line.discountedUnits).reduce((sum, unit) => sum + unit.discount, 0)).toBe(300);
  });

  it('يوزع الخصم الثابت على الوحدات ويطابق إجمالي الخصم', () => {
    const offer = { id: 'fixed-split', active: true, type: 'cart_fixed', config: { amount: 100 }, productScope: 'all' };
    const cart = [item(100), item(200)];
    const result = computeOfferBenefits(cart, offer);
    expect(result.discount).toBe(computeOfferDiscount(cart, offer));
    expect(result.discount).toBe(100);
    expect(result.lines.flatMap((line) => line.discountedUnits).reduce((sum, unit) => sum + unit.discount, 0)).toBe(100);
  });

  it('يحافظ على سقف الخصم حتى لو حوّل الهدية إلى وحدة مخفّضة جزئياً', () => {
    const result = computeOfferBenefits([item(645, 4)], { ...BXGY, maxDiscount: 300 });
    const unit = result.lines[0].discountedUnits[0];
    expect(result.discount).toBe(300);
    expect(unit).toMatchObject({ originalPrice: 645, discount: 300, finalPrice: 345, free: false });
  });

  it('توزيع الخصم يطابق إجمالي العرض عند أسعار بها كسور', () => {
    const offer = { id: 'fractional', active: true, type: 'cart_percent', config: { percent: 100 }, productScope: 'all' };
    const cart = [item(99.5)];
    const result = computeOfferBenefits(cart, offer);
    expect(result.discount).toBe(computeOfferDiscount(cart, offer));
    expect(result.discount).toBe(99);
    expect(result.lines[0].discountedUnits[0].finalPrice).toBe(0.5);
  });

  it('تقريب خصم النسبة يظل مطابقاً للخصم النهائي بالجنيه', () => {
    const offer = { id: 'percent-round', active: true, type: 'cart_percent', config: { percent: 15 }, productScope: 'all' };
    const cart = [item(645), item(320, 2)];
    const result = computeOfferBenefits(cart, offer);
    const allocated = result.lines.flatMap((line) => line.discountedUnits).reduce((sum, unit) => sum + unit.discount, 0);
    expect(result.discount).toBe(computeOfferDiscount(cart, offer));
    expect(allocated).toBe(193);
    expect(allocated).toBe(result.discount);
  });

  it('لا يغيّر عناصر السلة الأصلية', () => {
    const cart = Object.freeze([Object.freeze(item(645, 4))]);
    expect(() => computeOfferBenefits(cart, BXGY)).not.toThrow();
    expect(cart[0].qty).toBe(4);
  });
});

