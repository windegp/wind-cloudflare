// src/lib/getProductStatsServer.js
//
// قراءة إحصائيات تقييمات منتج (ProductStats) من داخل Server Components
// (زي generateMetadata / Product JSON-LD) بدون أي Firestore read إضافي
// في الحالة الغالبة.
//
// المسار: kvGet('product_stats_${handle}') [نفس المفتاح المُستخدَم فعليًا
//         في src/app/api/product-stats/route.js وفي src/app/api/revalidate/route.js
//         عند type === 'product_stats'] → Firestore Lite فقط عند KV MISS الحقيقي.
//
// لا يُنشئ أي مصدر بيانات جديد ولا أي كاش جديد — قارئ إضافي لنفس الكاش
// الموجود بالفعل، بنفس شكل القيمة المخزّنة ({ count, rating, handle }).

import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from "@/lib/kv-cache";
import { cache } from "react";

/**
 * ملفوفة بـ React cache() عشان لو اتنادت أكتر من مرة لنفس الـ handle
 * في نفس الـ request (مثلاً من generateMetadata وكمان من الصفحة نفسها)
 * متجيبش أكتر من مرة. لا تأثير على أي نظام تتبع/كتالوج — قراءة فقط.
 */
export const getProductStatsServer = cache(async (handle) => {
  if (!handle) return null;
  const cacheKey = `product_stats_${handle}`;

  // 1. KV أولاً — الحالة الغالبة (HIT) لا تسبب أي Firestore read
  try {
    const cached = await kvGet(cacheKey);
    if (cached) return cached;
  } catch (err) {
    console.warn("[getProductStatsServer] KV read failed:", err?.message || err);
  }

  // 2. KV MISS فقط — Firestore Lite قراءة واحدة (getDoc مباشر بالـ ID)
  try {
    const db = getDb();
    const statsSnap = await getDoc(doc(db, "ProductStats", handle));
    if (!statsSnap.exists()) return { count: 0, rating: 5, handle };

    const data = statsSnap.data();
    const total = data.totalCount || 0;
    const avg = total > 0 ? parseFloat((data.totalRatingSum / total).toFixed(1)) : 5;
    const result = { count: total, rating: avg, handle };

    // نفس شكل ونفس مفتاح الكاش المستخدم في product-stats/route.js
    await kvSet(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("[getProductStatsServer] Firestore fallback failed:", err?.message || err);
    return null;
  }
});
