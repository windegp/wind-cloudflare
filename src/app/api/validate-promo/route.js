import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-checkout';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore/lite';
import { SHIPPING_COST } from '@/lib/constants';

export const runtime = 'edge';

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
    const promoRef = doc(db, 'promoCodes', normalizedCode);
    const promoSnap = await getDoc(promoRef);

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

    // ── 4. حد الاستخدام الكلي (single_use / limited) ────────────
    if (promo.usageType === 'single_use' || promo.usageType === 'limited') {
      const maxUses = Number(promo.maxUses) || 1;
      const usedCount = Number(promo.usedCount) || 0;
      if (usedCount >= maxUses) {
        return NextResponse.json({ valid: false, message: 'تم استخدام هذا الكود بالفعل' });
      }
    }

    // ── 5. أول طلب فقط ──────────────────────────────────────────
    if (promo.firstOrderOnly) {
      const identifier = customerEmail?.toLowerCase().trim() || customerPhone?.replace(/\D/g, '');
      if (identifier) {
        const customerRef = doc(db, 'Customers', identifier);
        const customerSnap = await getDoc(customerRef);
        if (customerSnap.exists()) {
          const totalOrders = Number(customerSnap.data()['Total Orders'] || 0);
          if (totalOrders > 0) {
            return NextResponse.json({ valid: false, message: 'هذا الكود للطلب الأول فقط' });
          }
        }
      }
    }

    // ── 6. للمستخدم مرة واحدة ────────────────────────────────────
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
          message: 'هذا الكود لا ينطبق على المنتجات في سلتك'
        });
      }
    }

    // ── 8. حساب قيمة الخصم ───────────────────────────────────────
    let discountAmount = 0;
    let freeShipping = false;
    const shippingCost = Number(promo.shippingCostOverride ?? SHIPPING_COST);

    if (promo.type === 'free_shipping') {
      freeShipping = true;
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
