// src/lib/getSiteSettingsServer.js
//
// قراءة settings/siteSettings من داخل Server Components (مثل generateMetadata)
// بدون المرور عبر /api/site-settings — قراءة KV مباشرة لتفادي أي Round-trip HTTP إضافي.
//
// المسار: kvGet('site_settings_v1') [نفس المفتاح المستخدم في src/app/api/site-settings/route.js
//         وفي src/app/api/revalidate/route.js] → Firestore Lite فقط عند KV MISS الحقيقي.
//
// ملاحظة مهمة: هذه الدالة لا تُنشئ أي مصدر بيانات جديد ولا أي كاش جديد —
// هي فقط قارئ إضافي لنفس الكاش الموجود بالفعل، بنفس السياسة (content key = persistent,
// invalidation فقط عبر /api/revalidate). لا تأثير على SettingsContext أو الـ Client loading.

import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from "@/lib/kv-cache";
import { cache } from "react";

const SITE_SETTINGS_KEY = "site_settings_v1";

/**
 * ملفوفة بـ React `cache()` عشان لو اتنادت أكتر من مرة في نفس الـ request
 * (مثلاً من generateMetadata وكمان من الـ layout نفسه) متجيبش أكتر من مرة.
 * لا تأثير على أي نظام تتبع/كتالوج — قراءة فقط.
 */
export const getSiteSettingsServer = cache(async () => {
  // 1. KV أولاً — الحالة الغالبة (HIT) لا تسبب أي Firestore read
  try {
    const cached = await kvGet(SITE_SETTINGS_KEY);
    if (cached) return cached;
  } catch (err) {
    console.warn("[getSiteSettingsServer] KV read failed:", err?.message || err);
  }

  // 2. KV MISS فقط — Firestore Lite قراءة واحدة، ثم تخزينها لنفس المفتاح
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "settings", "siteSettings"));
    if (!snap.exists()) return null;

    const data = snap.data();
    // تخزين في KV بنفس السياسة الحالية (content key = persistent حتى يُحذف صراحة عبر /api/revalidate)
    await kvSet(SITE_SETTINGS_KEY, data);
    return data;
  } catch (err) {
    console.warn("[getSiteSettingsServer] Firestore fallback failed:", err?.message || err);
    return null;
  }
});
