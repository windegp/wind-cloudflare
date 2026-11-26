import { describe, it, expect } from 'vitest';
import { countCheckoutDisplayPieces } from '@/lib/cartCalculations';

// عداد القطع في ملخص الشيك آوت المقفول لازم يطابق القايمة المفتوحة:
// عرض ٣+١ بيضيف قطعة مجانية إضافية كسطر عرض مستقل، وكمية السلة وحدها
// كانت بتعرض ٣ بدل ٤ (شكوى المستخدم).
describe('countCheckoutDisplayPieces', () => {
  it('equals cart quantity when there are no offer benefit rows', () => {
    const rows = [
      { qty: 2, displayKey: '0-regular' },
      { qty: 1, displayKey: '1-regular' },
    ];
    expect(countCheckoutDisplayPieces(rows)).toBe(3);
  });

  it('counts extra free gift units from a buy-3-get-1 offer', () => {
    // سطر سلة واحد بكمية ٣ + وحدة مجانية إضافية من العرض = ٤ قطع.
    const rows = [
      { qty: 2, displayKey: '0-regular' },
      { qty: 1, isOfferBenefit: true, displayKey: '0-benefit-0' },
      { qty: 1, isOfferBenefit: true, isFreeOfferBenefit: true, isAutoAddedOfferGift: true, displayKey: '0-benefit-1' },
    ];
    expect(countCheckoutDisplayPieces(rows)).toBe(4);
  });

  it('counts customer-choice gift rows', () => {
    const rows = [
      { qty: 3, displayKey: '0-regular' },
      { qty: 1, isCustomerChoiceGiftSelection: true, displayKey: 'customer-choice-gift-s1' },
    ];
    expect(countCheckoutDisplayPieces(rows)).toBe(4);
  });

  it('returns 0 for empty or invalid input', () => {
    expect(countCheckoutDisplayPieces([])).toBe(0);
    expect(countCheckoutDisplayPieces(null)).toBe(0);
    expect(countCheckoutDisplayPieces(undefined)).toBe(0);
    expect(countCheckoutDisplayPieces([{ qty: 'x' }, {}])).toBe(0);
  });
});
