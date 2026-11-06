import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore/lite';
import { SHIPPING_COST } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/validate-promo
 * Body: { code, customerEmail, customerPhone, cartItems, subtotal }
 * Returns: { valid, type, value, scope, message, discountAmount, freeShipping }
 */
export async function POST(req) {
  try {
    const { code, customerEmail, customerPhone, cartItems = [], subtotal = 0 } = await req.json();

    if (!code || !code.trim()) {
      return NextResponse.json({ valid: false, message: 'الرجاء إدخال كود الخصم' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const db = getDb();

    // ── 1. جلب الكود من Firestore ──────────────────────────────
    const promoSnap = await getDoc(doc(db, 'promoCodes', normalizedCode));
    const host = new URL(req.url).hostname.toLowerCase();
    const productionHosts = ['windeg.com', 'www.windeg.com', 'windeg.pages.dev'];
    const environment = productionHosts.includes(host) ? 'production' : 'preview';
    const offersSnap = promoSnap.exists()
      ? { docs: [] }
      : await getDocs(query(collection(db, 'offers'), where('couponCode', '==', normalizedCode)));
    const coupon = offersSnap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .find((offer) =>
        offer.type === 'coupon_fixed' &&
        offer.active === true &&
        String(offer.couponCode || '').trim().toUpperCase() === normalizedCode &&
        (environment === 'preview' ? offer.environment === 'preview' : offer.environment !== 'preview')
      );

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

    if (!promoSnap.exists()) {
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
      if (new Date() > expiry) {
        return NextResponse.json({ valid: false, message: 'انتهت صلاحية هذا الكود' });
      }
    }

    // ── 4. حد الاستخدام الكلي ────────────────────────────────────
    if (promo.usageType === 'single_use' || promo.usageType === 'limited') {
      const maxUses   = Number(promo.maxUses) || 1;
      const usedCount = Number(promo.usedCount) || 0;
      if (usedCount >= maxUses) {
        return NextResponse.json({ valid: false, message: 'تم استخدام هذا الكود بالفعل' });
      }
    }

    // ── 5. أول طلب فقط ──────────────────────────────────────────
    if (promo.firstOrderOnly) {
      const identifier = customerEmail?.toLowerCase().trim() || customerPhone?.replace(/\D/g, '');
      if (identifier) {
        const customerSnap = await getDoc(doc(db, 'Customers', identifier));
        if (customerSnap.exists()) {
          const totalOrders = Number(customerSnap.data()['Total Orders'] || 0);
          if (totalOrders > 0) {
            return NextResponse.json({ valid: false, message: 'هذا الكود للطلب الأول فقط' });
          }
        }
      }
    }

    // ── 6. مرة واحدة لكل عميل ────────────────────────────────────
    if (promo.usageType === 'once_per_customer') {
      const identifier = customerEmail?.toLowerCase().trim() || customerPhone?.replace(/\D/g, '');
      if (identifier) {
        const usedBy = promo.usedBy || [];
        if (usedBy.includes(identifier)) {
          return NextResponse.json({ valid: false, message: 'لقد استخدمت هذا الكود من قبل' });
        }
      }
    }

    // ── 7. نطاق المنتجات ─────────────────────────────────────────
    const scope = promo.scope || 'all';
    let applicableItems = cartItems;
    if (scope !== 'all' && Array.isArray(scope) && scope.length > 0) {
      applicableItems = cartItems.filter(item =>
        scope.includes(item.id) || scope.includes(item.handle)
      );
      if (applicableItems.length === 0) {
        return NextResponse.json({
          valid: false,
          message: 'هذا الكود لا ينطبق على المنتجات في سلتك',
        });
      }
    }

    // ── 8. حساب قيمة الخصم ───────────────────────────────────────
    let discountAmount = 0;
    let freeShipping   = false;
    const shippingCost = Number(SHIPPING_COST);

    if (promo.type === 'free_shipping') {
      freeShipping  = true;
      discountAmount = shippingCost;
    } else if (promo.type === 'percent') {
      const applicableSubtotal = applicableItems.reduce(
        (sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 1),
        0
      );
      discountAmount = Math.round((applicableSubtotal * Number(promo.value)) / 100);
    } else if (promo.type === 'fixed') {
      discountAmount = Math.min(Number(promo.value), subtotal);
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
