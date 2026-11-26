import { describe, it, expect } from 'vitest';
import {
  parseOrderDate,
  addDaysSkippingFridays,
  arrivalWindow,
  formatArDate,
  formatArrivalWindow,
  normalizeWhatsAppPhone,
  buildOrderConfirmationMessage,
  buildTrackOrderUrl,
  buildWhatsAppBusinessIntentUrl,
  buildWhatsAppUrl,
} from '@/lib/whatsappConfirmation';

const d = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

describe('parseOrderDate', () => {
  it('parses the Cairo timestamp format', () => {
    const date = parseOrderDate('2026-11-26 14:30:00');
    expect(d(date)).toBe('2026-11-26');
  });

  it('returns null for unreadable values', () => {
    expect(parseOrderDate('')).toBeNull();
    expect(parseOrderDate(null)).toBeNull();
    expect(parseOrderDate('not a date')).toBeNull();
  });
});

describe('addDaysSkippingFridays', () => {
  it('counts days while skipping Fridays', () => {
    // الخميس 26 نوفمبر 2026 + 3 أيام بدون الجمعة = الإثنين 30 نوفمبر
    const thursday = new Date(2026, 10, 26, 12);
    expect(d(addDaysSkippingFridays(thursday, 3))).toBe('2026-11-30');
    expect(addDaysSkippingFridays(thursday, 3).getDay()).toBe(1);
  });

  it('handles an order placed on Friday itself', () => {
    // الجمعة 27 نوفمبر + 3 = الإثنين 30 (السبت والأحد والإثنين)
    const friday = new Date(2026, 10, 27, 12);
    expect(d(addDaysSkippingFridays(friday, 3))).toBe('2026-11-30');
  });

  it('skips a Friday inside the window', () => {
    // الأربعاء 25 نوفمبر + 3: الخميس(1)، الجمعة مستثناة، السبت(2)، الأحد(3)
    const wednesday = new Date(2026, 10, 25, 12);
    expect(d(addDaysSkippingFridays(wednesday, 3))).toBe('2026-11-29');
    expect(addDaysSkippingFridays(wednesday, 3).getDay()).toBe(0);
  });

  it('crosses a month boundary', () => {
    const result = addDaysSkippingFridays(new Date(2026, 10, 26, 12), 5);
    expect(d(result)).toBe('2026-12-2');
    expect(result.getDay()).toBe(3); // الأربعاء
  });
});

describe('arrivalWindow + formatArrivalWindow', () => {
  it('matches the agreed example: Thursday order arrives Mon-Wed', () => {
    const window = arrivalWindow('2026-11-26 10:00:00');
    expect(d(window.from)).toBe('2026-11-30');
    expect(d(window.to)).toBe('2026-12-2');
    expect(formatArrivalWindow('2026-11-26 10:00:00')).toBe(
      'من الإثنين 30 نوفمبر إلى الأربعاء 2 ديسمبر'
    );
  });

  it('returns null when the order date is missing', () => {
    expect(arrivalWindow(undefined)).toBeNull();
    expect(formatArrivalWindow(undefined)).toBeNull();
  });
});

describe('formatArDate', () => {
  it('formats weekday, day and month in Arabic', () => {
    expect(formatArDate(new Date(2026, 10, 26, 12))).toBe('الخميس 26 نوفمبر');
    expect(formatArDate(new Date(2026, 10, 29, 12))).toBe('الأحد 29 نوفمبر');
  });
});

describe('normalizeWhatsAppPhone', () => {
  it('accepts common Egyptian formats', () => {
    expect(normalizeWhatsAppPhone('01012345678')).toBe('201012345678');
    expect(normalizeWhatsAppPhone('+20 101 234 5678')).toBe('201012345678');
    expect(normalizeWhatsAppPhone('00201012345678')).toBe('201012345678');
    expect(normalizeWhatsAppPhone('1012345678')).toBe('201012345678');
    expect(normalizeWhatsAppPhone('01234567890')).toBe('201234567890');
  });

  it('rejects invalid numbers', () => {
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone('12345')).toBeNull();
    expect(normalizeWhatsAppPhone('+1 555 000 1111')).toBeNull();
  });
});

describe('buildOrderConfirmationMessage', () => {
  const message = buildOrderConfirmationMessage({
    name: 'ياسمين أحمد',
    orderLabel: '#1042',
    items: [
      { name: 'بلوفر نسائي بياقة عالية - Brown / [ 55 : 95kg ]', quantity: 1, selectedColor: 'Brown' },
      { name: 'بلوفر نسائي بياقة عالية', quantity: 1, selectedColor: 'Jeans Blue' },
      { name: 'هدية صغيرة', quantity: 1, isFree: true },
    ],
    total: '826',
    address: 'المقطم منطقة جنوب س عمارة 8592، القاهرة',
    arrivalText: 'من السبت 10 يناير إلى الإثنين 12 يناير',
    trackUrl: 'https://windeg.com/track-order?order=1042#p=01012345678',
  });

  it('greets with the first name and the chosen intro', () => {
    expect(message).toContain('أهلاً ياسمين 👋');
    expect(message).toContain('استلمنا طلبك من WIND Shopping بنجاح. يرجى التأكيد في آخر الرسالة');
    expect(message).toContain('تفاصيل الطلب 📦');
  });

  it('lists arrival, total, order number, piece count and items', () => {
    expect(message).toContain('📅 التاريخ المتوقع للوصول: من السبت 10 يناير إلى الإثنين 12 يناير');
    expect(message).toContain('💰 الإجمالي: 826 ج.م شامل الشحن');
    expect(message).toContain('💻 رقم الطلب: #1042');
    expect(message).toContain('🧮 عدد القطع: 3');
    expect(message).toContain('📄 المنتجات:');
    expect(message).toContain('بلوفر نسائي بياقة عالية - Brown / [ 55 : 95kg ] x 1');
    expect(message).toContain('بلوفر نسائي بياقة عالية - اللون: Jeans Blue x 1');
    expect(message).toContain('(هدية)');
    expect(message).toContain('🏡 العنوان: المقطم منطقة جنوب س عمارة 8592، القاهرة');
  });

  it('ends with the visit-to-track line and the numbered confirm replies', () => {
    expect(message).toContain('تقدر تزور https://windeg.com/track-order?order=1042#p=01012345678 علشان تتابع طلبك');
    expect(message).not.toContain('ادفع اونلاين');
    expect(message).toContain('رد بـ 1 للتأكيد');
    expect(message).toContain('رد بـ 2 للإلغاء');
    expect(message).toContain('رد بـ 3 لتغيير الموعد');
    // التأكيد في آخر الرسالة فعلاً
    expect(message.trimEnd().endsWith('رد بـ 3 لتغيير الموعد')).toBe(true);
  });
});

describe('buildTrackOrderUrl', () => {
  it('builds the same URL shape as the order email, phone in the fragment', () => {
    expect(buildTrackOrderUrl('#1042', '0101 234 5678')).toBe(
      'https://windeg.com/track-order?order=1042#p=01012345678'
    );
  });

  it('keeps legacy WIND ids and omits an empty phone fragment', () => {
    expect(buildTrackOrderUrl('WIND-D-123e4567-e89b-42d3-a456-426614174000', '')).toBe(
      'https://windeg.com/track-order?order=WIND-D-123e4567-e89b-42d3-a456-426614174000'
    );
  });

  it('returns null without an order number', () => {
    expect(buildTrackOrderUrl('', '01012345678')).toBeNull();
  });
});

describe('buildWhatsAppBusinessIntentUrl', () => {
  it('targets the WhatsApp Business package with a wa.me fallback', () => {
    const url = buildWhatsAppBusinessIntentUrl('01012345678', 'مرحبا');
    expect(url.startsWith('intent://send?phone=201012345678&text=')).toBe(true);
    expect(url).toContain('scheme=whatsapp');
    expect(url).toContain('package=com.whatsapp.w4b');
    expect(url).toContain('S.browser_fallback_url=');
    expect(decodeURIComponent(url)).toContain('https://wa.me/201012345678');
  });

  it('returns null for an invalid phone', () => {
    expect(buildWhatsAppBusinessIntentUrl('abc', 'hi')).toBeNull();
  });
});

describe('buildWhatsAppUrl', () => {
  it('builds a wa.me link with encoded text', () => {
    const url = buildWhatsAppUrl('01012345678', 'رقم الأوردر: #1042');
    expect(url.startsWith('https://wa.me/201012345678?text=')).toBe(true);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('رقم الأوردر: #1042');
  });

  it('returns null for an invalid phone', () => {
    expect(buildWhatsAppUrl('abc', 'hi')).toBeNull();
  });
});
