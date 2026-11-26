// رسالة استرجاع السلة المتروكة عبر واتساب (يدوي من صفحة الأدمن) + لينك يرجّع العميل لسلته.
// بدون أي أسماء كلاسات هنا: Tailwind يفحص src/app و src/components فقط.

import { SITE_DOMAIN } from "@/lib/constants";

const MAX_RESTORE_ITEMS = 20;

// نسخة مختصرة وآمنة من بيانات المنتج داخل اللينك.
function compactItem(item) {
  const compact = {
    id: String(item?.id || item?.productId || item?.handle || item?.productHandle || '').slice(0, 80),
    name: String(item?.name || item?.title || item?.productTitle || '').slice(0, 160),
    price: Number(item?.price) || 0,
    image: String(item?.image || '').slice(0, 300),
    selectedColor: String(item?.selectedColor || '').slice(0, 40),
    selectedSize: String(item?.selectedSize || '').slice(0, 40),
    qty: Math.max(1, Math.min(99, Number(item?.quantity ?? item?.qty) || 1)),
  };
  return compact.id && compact.name ? compact : null;
}

// لينك يرجّع العميل لسلته: المنتجات مشفرة في الرابط نفسه، فبيشتغل من أي جهاز
// مش لازم نفس المتصفح اللي اتعملت منه السلة. يرجع null لو مفيش منتجات صالحة.
export function buildCartRestoreUrl(items) {
  const compact = (Array.isArray(items) ? items : [])
    .slice(0, MAX_RESTORE_ITEMS)
    .map(compactItem)
    .filter(Boolean);
  if (!compact.length) return null;
  return `https://${SITE_DOMAIN}/?cart=${encodeURIComponent(JSON.stringify(compact))}`;
}

// يقرأ قيمة ?cart= ويرجع قائمة منتجات صالحة (أو []) — يستخدمها مكوّن الاسترجاع في المتجر.
export function parseCartRestoreParam(value) {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, MAX_RESTORE_ITEMS)
      .map(compactItem)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// نص رسالة السلة المتروكة (المسودة المتفق عليها مع صاحب المتجر).
export function buildAbandonedCartMessage({ name, items = [], total, cartUrl }) {
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || '';

  const lines = [
    `أهلاً ${firstName} 👋`,
    'لاحظنا إنك سبت منتجات في سلتك على WIND ومكملتش الطلب.',
    '',
    '🛍️ المنتجات:',
  ];

  for (const item of items) {
    const itemName = String(item?.name || item?.title || item?.productTitle || '').trim();
    if (!itemName) continue;
    const qty = Number(item?.quantity ?? item?.qty) || 1;
    const variant = [item?.selectedColor, item?.selectedSize]
      .map((v) => String(v || '').trim())
      .filter((v) => v && !itemName.includes(v))
      .join(' / ');
    lines.push(`${itemName}${variant ? ` - ${variant}` : ''} x ${qty}`);
  }

  lines.push('', `💰 الإجمالي: ${total} ج.م`);

  lines.push(
    '',
    'لو احتجت أي مساعدة في المقاس أو الطلب أو واجهت أي مشكلة تقنية، رد علينا هنا ويسعدنا نساعدك.'
  );

  if (cartUrl) lines.push(`تقدر تكمل طلبك من هنا: ${cartUrl}`);

  return lines.join('\n');
}
