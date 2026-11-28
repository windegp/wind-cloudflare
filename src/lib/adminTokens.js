// ============================================
// 🔔 ADMIN TOKENS — مستندات توكنات FCM للإشعارات
// ============================================
//
// كل توكن FCM (ويب أو نيتيف) يتخزن في كولكشن `adminTokens` بمستند
// يحمل الـ uid والدور الحقيقيين لصاحب الجهاز — لا يُستخدم ADMIN_UID
// الثابت هنا إطلاقًا (كان يُختم على كل التوكنات، فكان الإرسال
// يصل لأجهزة المالك فقط بالصدفة، بلا أي فلترة بالأدوار).
//
// الكاتبان الوحيدان:
//   - الويب: src/components/OrderNotifications.js (Client SDK)
//   - النيتيف: src/app/api/register-admin-token/route.js (Service Account)
// والقارئ الوحيد: src/lib/fcmAdmin.js (يرسل حسب الدور الحالي).

import { PERMISSIONS, hasPermission } from "./rbac";

// من يستلم إشعار طلب جديد؟ المالك + الأدمن + موظف الطلبات فقط
// (قرار المالك 2026-11-28). المشاهدة فقط والمنتجات والمحتوى مستبعدون.
export function isNotificationRecipient(role) {
  return hasPermission(role, PERMISSIONS.NOTIFICATIONS_RECEIVE);
}

// يبني حقول مستند التوكن من ملف موظف موثّق (getAdminProfile /
// verifyAdminIdToken). `extra` لحقول خاصة بالمصدر (userAgent للويب،
// platform للنيتيف). لا تُمرَّر هنا أي قيمة من العميل غير موثّقة —
// الـ uid والدور يأتيان دائمًا من الملف الموثّق، لا من الطلب.
export function buildAdminTokenDoc(profile, token, now, extra = {}) {
  return {
    token,
    uid: profile.uid,
    role: profile.role,
    createdAt: now,
    lastSeenAt: now,
    ...extra,
  };
}
