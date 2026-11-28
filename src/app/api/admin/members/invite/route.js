// ============================================
// ✉️ ADMIN MEMBERS INVITE API — تجهيز موظف بالبريد قبل أول دخول
// ============================================
//
// مالك فقط (members.manage). يجهّز موظفًا جديدًا بالبريد الإلكتروني
// بدل الـ UID، فينشأ حساب Firebase Auth الخاص به (بالبريد فقط،
// بلا باسورد) ومستند `admins/{uid}` معًا — فيدخل الموظف من أول
// مرة بحساب Google دون أن يرى شاشة "غير مصرح لك" إطلاقًا.
//
//   POST /api/admin/members/invite
//     body: { email, role, name? }
//     -> { success: true, member, authUserCreated: boolean }
//
// - الدور يجب أن يكون من ASSIGNABLE_ROLES؛ دور "owner" مرفوض هنا
//   (المالك الوحيد هو ADMIN_UID، ولا يُنشأ مالك جديد من الـ API).
// - بريد المالك نفسه مرفوض.
// - إن كان للمستخدم حساب Auth أصلًا (مثلًا موظف سبق أن رأى شاشة
//   الرفض)، يُعاد استخدامه — لا يُنشأ حساب مكرر.
// - لا يُرسل أي بريد دعوة في هذا الإصدار (تابع مستقبلي)؛ على
//   المالك إبلاغ الموظف بالدخول بحساب Google على /admin/login.
// - لا تُعرض أي بيانات اعتماد أو توكنات في الردود.

import { NextResponse } from "next/server";
import { ADMIN_EMAIL, ADMIN_UID } from "@/lib/constants";
import {
  firestoreAdminGet,
  firestoreAdminSet,
  parseFirestoreDoc,
} from "@/lib/firestoreAdmin";
import { preprovisionAuthUser } from "@/lib/identityAdmin";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";
import { ROLES, isAssignableRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authError(auth) {
  const status = auth.status === 403 ? 403 : 401;
  return NextResponse.json(
    { success: false, error: auth.reason || "unauthorized" },
    { status },
  );
}

export async function POST(request) {
  const auth = await verifyAdminPermission(request, "members.manage");
  if (!auth.ok) return authError(auth);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = typeof body?.role === "string" ? body.role.trim() : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { success: false, error: "invalid_email" },
      { status: 400 },
    );
  }
  if (!isAssignableRole(role)) {
    return NextResponse.json(
      { success: false, error: "invalid_role" },
      { status: 400 },
    );
  }
  // بريد المالك نفسه لا يُدعى — المالك موجود أصلًا ولا يُعدَّل من هنا.
  if (email === ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: "cannot_invite_owner" },
      { status: 400 },
    );
  }

  let preprovisioned;
  try {
    preprovisioned = await preprovisionAuthUser(email);
  } catch (error) {
    console.error("[members/invite] pre-provision failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "invite_failed" },
      { status: 500 },
    );
  }

  const uid = preprovisioned.uid;
  // دفاع إضافي: لا يُكتب مستند موظف على UID المالك إطلاقًا.
  if (uid === ADMIN_UID) {
    return NextResponse.json(
      { success: false, error: "cannot_modify_owner" },
      { status: 400 },
    );
  }

  try {
    const existing = await firestoreAdminGet("admins", uid).catch(() => null);
    const existingData = existing ? parseFirestoreDoc(existing) : null;

    const data = {
      uid,
      email,
      name,
      role,
      active: true,
      createdAt:
        existingData && typeof existingData.createdAt === "string" && existingData.createdAt
          ? existingData.createdAt
          : new Date().toISOString(),
      createdBy:
        existingData && typeof existingData.createdBy === "string" && existingData.createdBy
          ? existingData.createdBy
          : auth.uid,
    };

    await firestoreAdminSet("admins", uid, data);
    return NextResponse.json({
      success: true,
      member: { ...data, isOwner: false },
      authUserCreated: preprovisioned.created,
    });
  } catch (error) {
    console.error("[members/invite] save failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "members_save_failed" },
      { status: 500 },
    );
  }
}
