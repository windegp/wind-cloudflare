import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite';

export const dynamic = 'force-dynamic';

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

async function checkFirstOrder(db, email, phone) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedEmail || !normalizedEmail.includes('@') || normalizedPhone.length < 11) return false;
  const [emailSnap, phoneDocSnap] = await Promise.all([
    getDoc(doc(db, 'Customers', normalizedEmail)),
    getDoc(doc(db, 'Customers', normalizedPhone)),
  ]);
  if (emailSnap.exists() && Number(emailSnap.data()['Total Orders'] || 0) > 0) return false;
  if (phoneDocSnap.exists() && Number(phoneDocSnap.data()['Total Orders'] || 0) > 0) return false;
  const phoneQuery = await getDocs(query(collection(db, 'Customers'), where('Phone', '==', String(phone).trim()), limit(1)));
  if (!phoneQuery.empty && Number(phoneQuery.docs[0].data()['Total Orders'] || 0) > 0) return false;
  return true;
}

/**
 * POST /api/validate-promo
 * Body: { code, customerEmail, customerPhone, cartItems, subtotal }
 * Returns: { valid, type, value, scope, message, discountAmount, freeShipping }
 */
export async function POST(req) {
  try {
    const { code, customerEmail, customerPhone, cartItems = [] } = await req.json();

    if (!code || !code.trim()) {
      return NextResponse.json({ valid: false, message: 'الرجاء إدخال كود الخصم' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const db = getDb();

    // ── 1. جلب الكود من Firestore ──────────────────────────────
    const host = new URL(req.url).hostname.toLowerCase();
    const productionHosts = ['windeg.com', 'www.windeg.com', 'windeg.pages.dev'];
    const environment = productionHosts.includes(host) ? 'production' : 'preview';
    const offersSnap = await getDocs(query(collection(db, 'offers'), where('couponCode', '==', normalizedCode)));
    const coupon = offersSnap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .find((offer) =>
        offer.type === 'coupon_fixed' &&
        offer.active === true &&
        String(offer.couponCode || '').trim().toUpperCase() === normalizedCode &&
        (environment === 'preview' ? offer.environment === 'preview' : offer.environment !== 'preview')
      );

    const promoSnap = coupon ? null : await getDoc(doc(db, 'promoCodes', normalizedCode));

    if (coupon) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
      if ((coupon.startsAt && today < String(coupon.startsAt).slice(0, 10)) ||
          (coupon.endsAt && today > String(coupon.endsAt).slice(0, 10))) {
        return NextResponse.json({ valid: false, message: 'قسيمة الشراء غير مفعّلة أو انتهت صلاحيتها' });
      }
      const eligibleItems = cartItems.filter((item) => {
        const keys = [item.id, item.handle].map(String);
        if (coupon.productScope === 'selected' && !(coupon.productIds || []).map(String).some((key) => keys.includes(key))) return false;
        if ((coupon.excludedProductIds || []).map(String).some((key) => keys.includes(key))) return false;
        if (coupon.excludeDiscounted === true && Number(item.compareAtPrice) > Number(item.price)) return false;
        return true;
      });
      const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 1), 0);
      const amount = Number(coupon.config?.amount);
      if (!eligibleItems.length || eligibleSubtotal < (Number(coupon.minCart) || 0) || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ valid: false, message: 'القسيمة لا تنطبق على المنتجات الحالية أو لم يتحقق الحد الأدنى' });
      }
      const discountAmount = Math.min(amount, eligibleSubtotal, Number(coupon.maxDiscount) > 0 ? Number(coupon.maxDiscount) : amount);
      return NextResponse.json({
        valid: true, code: normalizedCode, type: 'coupon_fixed', value: amount,
        scope: coupon.productScope === 'selected' ? coupon.productIds || [] : 'all',
        excludedProductIds: coupon.excludedProductIds || [], excludeDiscounted: coupon.excludeDiscounted === true,
        minCart: Number(coupon.minCart) || 0,
        freeShipping: false, discountAmount, maxDiscount: Number(coupon.maxDiscount) || 0, couponOfferId: coupon.id,
        message: 'تم تفعيل قسيمة ' + normalizedCode + ' بخصم ' + discountAmount + ' ج.م 🎉',
      });
    }

    if (!promoSnap?.exists()) {
      return NextResponse.json({ valid: false, message: 'عذراً، هذا الكود غير صالح' });
    }

    const promo = promoSnap.data();

    // ── 2. هل الكود نشط؟ ────────────────────────────────────────
    if (!promo.active) {
      return NextResponse.json({ valid: false, message: 'هذا الكود غير مفعّل حالياً' });
    }

    // ── 3. هل انتهت صلاحيته؟ ────────────────────────────────────
    if (promo.expiresAt) {
      const expiry = promo.expiresAt.toDate ? promo.expiresAt.toDate() : new Date(promo.expiresAt);
      if (Number.isNaN(expiry.getTime()) || new Date() > expiry) {
        return NextResponse.json({ valid: false, message: 'انتهت صلاحية هذا الكود' });
      }
    }

    // ── 4. حد الاستخدام الكلي ────────────────────────────────────
    if (promo.usageType === 'single_use' || promo.usageType === 'limited') {
      const maxUses   = Math.max(1, Number(promo.maxUses) || 1);
      const usedCount = Number(promo.usedCount) || 0;
      if (usedCount >= maxUses) {
        return NextResponse.json({ valid: false, message: 'تم استخدام هذا الكود بالفعل' });
      }
    }

    // ── 5. أول طلب فقط ──────────────────────────────────────────
    if (promo.firstOrderOnly && !(await checkFirstOrder(db, customerEmail, customerPhone))) {
      return NextResponse.json({ valid: false, message: 'هذا الكود للطلب الأول فقط' });
    }

    // ── 6. مرة واحدة لكل عميل ────────────────────────────────────
    if (promo.usageType === 'once_per_customer') {
      const identifier = customerEmail?.toLowerCase().trim() || normalizePhone(customerPhone);
      if (identifier) {
        const usedBy = Array.isArray(promo.usedBy) ? promo.usedBy.map((value) => String(value).toLowerCase()) : [];
        if (usedBy.includes(identifier.toLowerCase())) {
          return NextResponse.json({ valid: false, message: 'لقد استخدمت هذا الكود من قبل' });
        }
      }
    }

    // ── 7. نطاق المنتجات ─────────────────────────────────────────
    const scope = promo.scope || 'all';
    let applicableItems = cartItems;
    if (Array.isArray(scope) && scope.length > 0) {
      const allowed = new Set(scope.map(String));
      applicableItems = cartItems.filter((item) =>
        [item.id, item.handle].some((key) => key !== undefined && key !== null && allowed.has(String(key)))
      );
      if (applicableItems.length === 0) return NextResponse.json({ valid: false, message: 'هذا الكود لا ينطبق على المنتجات في سلتك' });
    } else if (scope !== 'all' && !(Array.isArray(scope) && scope.length === 0)) {
      return NextResponse.json({ valid: false, message: 'إعداد نطاق كود الخصم غير صالح' });
    }

    // ── 8. حساب قيمة الخصم ───────────────────────────────────────
    let discountAmount = 0;
    let freeShipping   = false;
    const applicableSubtotal = applicableItems.reduce(
      (sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 1),
      0
    );
    if (promo.type === 'free_shipping') {
      freeShipping = true;
      discountAmount = 0;
    } else if (promo.type === 'percent') {
      const percent = Number(promo.value);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return NextResponse.json({ valid: false, message: 'إعداد نسبة كود الخصم غير صالح' });
      discountAmount = Math.round((applicableSubtotal * percent) / 100);
    } else if (promo.type === 'fixed') {
      const fixed = Number(promo.value);
      if (!Number.isFinite(fixed) || fixed <= 0) return NextResponse.json({ valid: false, message: 'إعداد مبلغ كود الخصم غير صالح' });
      discountAmount = Math.min(fixed, applicableSubtotal);
    } else {
      return NextResponse.json({ valid: false, message: 'نوع كود الخصم غير مدعوم' });
    }

    return NextResponse.json({
      valid: true,
      code: normalizedCode,
      type: promo.type,
      value: promo.value,
      scope,
      freeShipping,
      discountAmount,
      firstOrderOnly: promo.firstOrderOnly || false,
      message:
        promo.type === 'free_shipping'
          ? 'تم تفعيل الشحن المجاني! 🎉'
          : `تم تطبيق خصم ${promo.type === 'percent' ? promo.value + '%' : promo.value + ' ج.م'} 🎉`,
    });

  } catch (err) {
    console.error('validate-promo error:', err);
    return NextResponse.json({ valid: false, message: 'حدث خطأ، حاول مرة أخرى' }, { status: 500 });
  }
}
