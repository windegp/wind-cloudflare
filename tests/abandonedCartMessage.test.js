import { describe, it, expect } from 'vitest';
import {
  buildAbandonedCartMessage,
  buildCartRestoreUrl,
  parseCartRestoreParam,
} from '@/lib/abandonedCartMessage';

const ITEMS = [
  {
    id: 'cloud-oversized-pullover',
    name: 'بلوفر أوفر سايز',
    price: 525,
    image: 'https://ik.imagekit.io/wind/p1.jpg',
    selectedColor: 'beige',
    selectedSize: 'One Size - [50-90kg]',
    quantity: 2,
  },
  {
    id: 'knit-wide-pant',
    name: 'بنطلون تريكو واسع - black',
    price: 450,
    image: '',
    selectedColor: 'black',
    selectedSize: '',
    quantity: 1,
  },
];

describe('buildAbandonedCartMessage', () => {
  const message = buildAbandonedCartMessage({
    name: 'ياسمين أحمد',
    items: ITEMS,
    total: '1,500',
    cartUrl: 'https://windeg.com/?cart=xyz',
  });

  it('uses the agreed draft with the first name', () => {
    expect(message).toContain('أهلاً ياسمين 👋');
    expect(message).toContain('لاحظنا إنك سبت منتجات في سلتك على WIND ومكملتش الطلب.');
    expect(message).toContain('🛍️ المنتجات:');
    expect(message).toContain('💰 الإجمالي: 1,500 ج.م');
  });

  it('adds color and size to each line only when missing from the name', () => {
    expect(message).toContain('بلوفر أوفر سايز - beige / One Size - [50-90kg] x 2');
    // اللون موجود أصلًا في اسم المنتج الثاني فلا يتكرر
    expect(message).toContain('بنطلون تريكو واسع - black x 1');
  });

  it('includes the help line with the technical-issue addition and the cart link', () => {
    expect(message).toContain('لو احتجت أي مساعدة في المقاس أو الطلب أو واجهت أي مشكلة تقنية، رد علينا هنا ويسعدنا نساعدك.');
    expect(message).toContain('تقدر تكمل طلبك من هنا: https://windeg.com/?cart=xyz');
  });

  it('omits the cart line when there is no link', () => {
    const noLink = buildAbandonedCartMessage({ name: 'ياسمين', items: ITEMS, total: '100', cartUrl: null });
    expect(noLink).not.toContain('تقدر تكمل طلبك من هنا');
  });
});

describe('buildCartRestoreUrl + parseCartRestoreParam', () => {
  it('round-trips the items through the URL', () => {
    const url = buildCartRestoreUrl(ITEMS);
    expect(url.startsWith('https://windeg.com/?cart=')).toBe(true);

    const raw = decodeURIComponent(url.split('?cart=')[1]);
    const restored = parseCartRestoreParam(raw);
    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({
      id: 'cloud-oversized-pullover',
      name: 'بلوفر أوفر سايز',
      price: 525,
      selectedColor: 'beige',
      selectedSize: 'One Size - [50-90kg]',
      qty: 2,
    });
    expect(restored[1]).toMatchObject({ id: 'knit-wide-pant', qty: 1 });
  });

  it('returns null with no valid items and [] for garbage input', () => {
    expect(buildCartRestoreUrl([])).toBeNull();
    expect(buildCartRestoreUrl([{ price: 10 }])).toBeNull();
    expect(parseCartRestoreParam('not json')).toEqual([]);
    expect(parseCartRestoreParam('{"a":1}')).toEqual([]);
    expect(parseCartRestoreParam(null)).toEqual([]);
  });

  it('clamps quantities and item count', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `منتج ${i}`, qty: 500 }));
    const url = buildCartRestoreUrl(many);
    const restored = parseCartRestoreParam(decodeURIComponent(url.split('?cart=')[1]));
    expect(restored).toHaveLength(20);
    expect(restored[0].qty).toBe(99);
  });
});
