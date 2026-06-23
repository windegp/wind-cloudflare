import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-checkout';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, writeBatch, increment
} from 'firebase/firestore/lite';

export const runtime = 'edge';

// ── GET: جلب الإعدادات + كل الأكواد ────────────────────────────
export async function GET() {
  try {
    const db = getDb();

    // إعدادات الشحن من siteSettings
    const settingsSnap = await getDoc(doc(db, 'settings', 'siteSettings'));
    const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
    const promotionSettings = settingsData.promotions || {
      shippingCost: 70,
      freeShippingThreshold: 0,
    };

    // كل الأكواد
    const codesSnap = await getDocs(collection(db, 'promoCodes'));
    const codes = codesSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      // تحويل timestamp لـ string عشان JSON
      expiresAt: d.data().expiresAt
        ? (d.data().expiresAt.toDate
            ? d.data().expiresAt.toDate().toISOString().split('T')[0]
            : d.data().expiresAt)
        : null,
    }));

    return NextResponse.json({ success: true, promotionSettings, codes });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── POST: إنشاء/تعديل كود أو حفظ إعدادات الشحن ─────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    const db = getDb();

    // حفظ إعدادات الشحن
    if (body.action === 'save_settings') {
      const { shippingCost, freeShippingThreshold } = body;
      await updateDoc(doc(db, 'settings', 'siteSettings'), {
        'promotions.shippingCost': Number(shippingCost),
        'promotions.freeShippingThreshold': Number(freeShippingThreshold),
      });
      return NextResponse.json({ success: true });
    }

    // إنشاء أو تعديل كود
    if (body.action === 'save_code') {
      const { code, type, value, scope, usageType, maxUses,
              firstOrderOnly, active, expiresAt } = body;

      if (!code || !code.trim()) {
        return NextResponse.json({ success: false, error: 'الكود مطلوب' }, { status: 400 });
      }

      const normalizedCode = code.trim().toUpperCase();

      // تحقق من الكود موجود مسبقاً (في حالة إنشاء جديد)
      if (body.isNew) {
        const existing = await getDoc(doc(db, 'promoCodes', normalizedCode));
        if (existing.exists()) {
          return NextResponse.json({ success: false, error: 'هذا الكود موجود بالفعل' }, { status: 400 });
        }
      }

      const promoData = {
        type,                                           // free_shipping | percent | fixed
        value: Number(value) || 0,
        scope: scope === 'all' ? 'all' : (Array.isArray(scope) ? scope : [scope]),
        usageType: usageType || 'unlimited',           // unlimited | once_per_customer | single_use | limited
        maxUses: Number(maxUses) || 1,
        firstOrderOnly: Boolean(firstOrderOnly),
        active: Boolean(active),
        expiresAt: expiresAt || null,
        updatedAt: new Date().toISOString(),
      };

      // حقول تُضاف عند الإنشاء فقط
      if (body.isNew) {
        promoData.usedCount = 0;
        promoData.usedBy = [];
        promoData.createdAt = new Date().toISOString();
      }

      await setDoc(doc(db, 'promoCodes', normalizedCode), promoData, { merge: !body.isNew });

      return NextResponse.json({ success: true, code: normalizedCode });
    }

    return NextResponse.json({ success: false, error: 'action غير معروف' }, { status: 400 });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── DELETE: حذف كود ─────────────────────────────────────────────
export async function DELETE(req) {
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ success: false, error: 'الكود مطلوب' }, { status: 400 });

    const db = getDb();
    await deleteDoc(doc(db, 'promoCodes', code.trim().toUpperCase()));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
