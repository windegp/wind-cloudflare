// منطق رسالة تأكيد الطلب عبر واتساب (يدوي من صفحة الأدمن).
// بدون أي أسماء كلاسات هنا: Tailwind يفحص src/app و src/components فقط.

import { SITE_DOMAIN } from "@/lib/constants";

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const FRIDAY = 5;

// يقرأ تاريخ الطلب من "YYYY-MM-DD HH:MM:SS" (توقيت القاهرة) أو صيغة يفهمها Date.
// يرجع Date عند الظهر بالتوقيت المحلي لتفادي مشاكل المناطق الزمنية، أو null.
export function parseOrderDate(value) {
  if (!value) return null;
  if (value?.toDate) value = value.toDate();

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0);
  }

  const match = String(value).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day, 12, 0, 0);
}

// يضيف n يوم مع تجاهل يوم الجمعة (لا يُحسب ضمن المدة).
export function addDaysSkippingFridays(date, days) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== FRIDAY) added += 1;
  }
  return result;
}

// نطاق الوصول المتوقع: من 3 إلى 5 أيام من تاريخ الطلب، بدون أيام الجمعة.
// يرجع { from, to } أو null لو التاريخ غير مقروء.
export function arrivalWindow(createdAt) {
  const date = parseOrderDate(createdAt);
  if (!date) return null;
  return {
    from: addDaysSkippingFridays(date, 3),
    to: addDaysSkippingFridays(date, 5),
  };
}

// "الإثنين 30 نوفمبر"
export function formatArDate(date) {
  return `${WEEKDAYS_AR[date.getDay()]} ${date.getDate()} ${MONTHS_AR[date.getMonth()]}`;
}

// "من الإثنين 30 نوفمبر إلى الأربعاء 2 ديسمبر" أو null
export function formatArrivalWindow(createdAt) {
  const window = arrivalWindow(createdAt);
  if (!window) return null;
  return `من ${formatArDate(window.from)} إلى ${formatArDate(window.to)}`;
}

// يحول رقم مصري لصيغة wa.me الدولية بالأرقام فقط: "2010xxxxxxxx". يرجع null لو الرقم غير صالح.
export function normalizeWhatsAppPhone(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
  if (!digits.startsWith('20') && digits.length === 10) digits = `20${digits}`;

  return /^201[0-9]{9}$/.test(digits) ? digits : null;
}

// نص رسالة التأكيد (المسودة المتفق عليها مع صاحب المتجر).
// نص رسالة التأكيد: شكل رسائل الشحن اللي صاحب المتجر اختاره (Telegram 20005710).
// مفيش عندنا رقم تتبع شركة شحن ولا خيار فتح الشحنة، فبنستخدم رقم الطلب ونستغنى عن سطر فتح الشحنة.
export function buildOrderConfirmationMessage({
  name,
  orderLabel,
  items = [],
  total,
  address,
  arrivalText,
  trackUrl,
}) {
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || '';
  const pieceCount = items.reduce(
    (sum, item) => sum + (Number(item?.quantity ?? item?.qty) || 1),
    0
  );

  const lines = [
    `أهلاً ${firstName} 👋`,
    'استلمنا طلبك من WIND Shopping بنجاح. يرجى التأكيد في آخر الرسالة',
    '',
    'تفاصيل الطلب 📦',
    '',
  ];

  if (arrivalText) lines.push(`📅 التاريخ المتوقع للوصول: ${arrivalText}`);
  lines.push(
    `💰 الإجمالي: ${total} ج.م شامل الشحن`,
    `💻 رقم الطلب: ${orderLabel}`,
    `🧮 عدد القطع: ${pieceCount}`
  );

  const itemLines = [];
  for (const item of items) {
    const itemName = String(item?.name || item?.title || '').trim();
    if (!itemName) continue;
    const qty = Number(item?.quantity ?? item?.qty) || 1;
    const gift = item?.isFree === true ? ' (هدية)' : '';
    const color = String(item?.selectedColor || item?.color || '').trim();
    const colorPart = color && !itemName.includes(color) ? ` - اللون: ${color}` : '';
    itemLines.push(`${itemName}${colorPart} x ${qty}${gift}`);
  }
  if (itemLines.length > 0) {
    lines.push('📄 المنتجات:', ...itemLines);
  }

  // سطر ثابت بطلب صاحب المتجر (Telegram 20013927).
  lines.push('🔓 إمكانية فتح الطلب: نعم');

  if (address) lines.push(`🏡 العنوان: ${address}`);

  if (trackUrl) {
    lines.push('', `تقدر تزور ${trackUrl} علشان تتابع طلبك`);
  }

  lines.push(
    '',
    'برجاء تأكيد الطلب عشان نجهزه لك.',
    'رد بـ 1 للتأكيد',
    'رد بـ 2 للإلغاء',
    'رد بـ 3 لتغيير الموعد'
  );

  return lines.join('\n');
}

// رابط تتبع الطلب: نفس صيغة رابط الإيميل، رقم الموبايل في الـ fragment فلا يصل للسيرفر.
// صفحة التتبع تقرأ الرقمين وتعرض حالة الطلب مباشرة.
export function buildTrackOrderUrl(orderLabel, phone) {
  const order = String(orderLabel ?? '').trim().replace(/^#/, '');
  if (!order) return null;
  const trackPhone = String(phone ?? '').replace(/[^0-9+]/g, '').slice(0, 20);
  const fragment = trackPhone ? `#p=${encodeURIComponent(trackPhone)}` : '';
  return `https://${SITE_DOMAIN}/track-order?order=${encodeURIComponent(order)}${fragment}`;
}

// رابط intent لأندرويد يفتح واتساب بيزنس (com.whatsapp.w4b) بالاسم، حتى لو واتساب العادي هو الافتراضي.
// لو بيزنس مش متسطب على الجهاز، المتصفح يرجع تلقائيًا للينك wa.me العادي.
// آيفون لا يدعم روابط intent: يفضل wa.me ولا يمكن إجبار التطبيق من الكود.
export function buildWhatsAppBusinessIntentUrl(phone, message) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return null;
  const fallback = buildWhatsAppUrl(phone, message);
  const text = encodeURIComponent(message);
  return `intent://send?phone=${digits}&text=${text}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

// رابط wa.me جاهز للفتح، أو null لو الرقم غير صالح.
export function buildWhatsAppUrl(phone, message) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
