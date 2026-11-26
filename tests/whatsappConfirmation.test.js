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
    name: 'منة',
    orderLabel: '#1042',
    items: [
      { name: 'بلوفر أوفر سايز - black / One Size', quantity: 2 },
      { name: 'هدية صغيرة', quantity: 1, isFree: true },
    ],
    total: '1,050',
    address: '15 شارع التحرير، الدقي، الجيزة',
    arrivalText: 'من الإثنين 30 نوفمبر إلى الأربعاء 2 ديسمبر',
    trackUrl: 'https://windeg.com/track-order?order=1042#p=01012345678',
  });

  it('includes name, order number, items, total, address and arrival', () => {
    expect(message).toContain('أهلًا منة');
    expect(message).toContain('رقم الأوردر: #1042');
    expect(message).toContain('- بلوفر أوفر سايز - black / One Size × 2');
    expect(message).toContain('(هدية)');
    expect(message).toContain('الإجمالي: 1,050 جنيه شامل الشحن');
    expect(message).toContain('العنوان: 15 شارع التحرير، الدقي، الجيزة');
    expect(message).toContain('الوصول المتوقع: من الإثنين 30 نوفمبر إلى الأربعاء 2 ديسمبر');
  });

  it('includes the numbered reply instructions', () => {
    expect(message).toContain('رد بـ 1 للتأكيد');
    expect(message).toContain('رد بـ 2 للإلغاء');
    expect(message).toContain('رد بـ 3 لتغيير الموعد');
  });

  it('includes the tracking link and a trailing note', () => {
    expect(message).toContain('تقدر تتابع طلبك من هنا:');
    expect(message).toContain('https://windeg.com/track-order?order=1042#p=01012345678');
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
