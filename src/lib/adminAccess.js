// ============================================
// 👤 ADMIN ACCESS (عميل) — حلّ ملف موظف الأدمن
// ============================================
//
// يقرأ مستند الموظف `admins/{uid}` من Firestore عبر الـ Client SDK
// ويحوّله إلى ملف صلاحيات. لا يثق أبدًا بأي دور يأتي من العميل نفسه.
//
// قواعد مهمة:
//   - المالك (ADMIN_UID) يرجع مباشرة بدور owner دون أي قراءة من
//     Firestore — حتى لو الـ Rules لم تُطبَّق بعد، أو كان المستند
//     غير موجود، يبقى دخول المالك شغالًا.
//   - أي خطأ (مستند غير موجود، permission-denied، دور غير صالح،
//     حساب غير فعّال) يرجع null — لا يُمنح أي صلاحية عند الشك.

"use client";

import { doc, getDoc } from "firebase/firestore/lite";
import { getDb } from "@/lib/firebase";
import { ADMIN_EMAIL, ADMIN_UID } from "@/lib/constants";
import {
  ROLES,
  hasPermission,
  permissionsForRole,
  resolveRole,
} from "@/lib/rbac";

export const ADMINS_COLLECTION = "admins";

export function ownerProfile(uid) {
  return {
    uid,
    email: ADMIN_EMAIL,
    name: "المالك",
    role: ROLES.OWNER,
    permissions: permissionsForRole(ROLES.OWNER),
    active: true,
    isOwner: true,
  };
}

// يرجع ملف الموظف أو null لغير الموظفين.
// لا يرمي استثناءً أبدًا: أي فشل قراءة = لا يوجد وصول.
export async function getAdminProfile(uid) {
  if (!uid) return null;

  // المالك لا يعتمد على Firestore إطلاقًا.
  if (uid === ADMIN_UID) return ownerProfile(uid);

  try {
    const snap = await getDoc(doc(getDb(), ADMINS_COLLECTION, uid));
    if (!snap.exists()) return null;

    const data = snap.data() || {};
    const role = resolveRole(uid, data);
    if (!role) return null;

    return {
      uid,
      email: typeof data.email === "string" ? data.email : "",
      name: typeof data.name === "string" ? data.name : "",
      role,
      permissions: permissionsForRole(role),
      active: data.active !== false,
      isOwner: false,
    };
  } catch {
    // مثال: permission-denied قبل تطبيق الـ Rules — يُعامل كعدم وصول.
    return null;
  }
}

export function profileHasPermission(profile, permission) {
  if (!profile) return false;
  return hasPermission(profile.role, permission);
}
