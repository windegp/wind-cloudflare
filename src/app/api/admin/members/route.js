// ============================================
// 👥 ADMIN MEMBERS API — إدارة أعضاء لوحة التحكم
// ============================================
//
// مالك فقط (members.manage). كل النداءات تمر عبر
// verifyAdminPermission — لا يوجد أي مسار عام هنا.
//
//   GET    -> قائمة الأعضاء (بما فيها المالك كصف افتراضي)
//   POST   -> إضافة / تعديل عضو بالـ UID
//   DELETE -> إلغاء تفعيل عضو (active=false، لا حذف نهائي)
//
// ملاحظة: الـ UID يجب أن يكون لمستخدم Firebase Auth موجود.
// الطريقة الموصى بها الآن هي الدعوة بالبريد عبر
// POST /api/admin/members/invite — تجهّز الحساب قبل أول دخول،
// فلا يرى الموظف شاشة الرفض إطلاقًا. الإضافة بالـ UID هنا باقية
// للحالات التي يكون فيها للموظف حساب Firebase أصلًا.
//
// ⚠️ لا يمكن تعديل المالك أو إلغاء تفعيله أو تخفيضه من هنا،
// ولا يمكن للمالك إلغاء تفعيل نفسه.

import { NextResponse } from "next/server";
import { ADMIN_EMAIL, ADMIN_UID } from "@/lib/constants";
import {
  firestoreAdminGet,
  firestoreAdminList,
  firestoreAdminSet,
  parseFirestoreDoc,
} from "@/lib/firestoreAdmin";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";
import {
  ROLES,
  isAssignableRole,
  permissionsForRole,
} from "@/lib/rbac";

export const dynamic = "force-dynamic";

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ownerEntry() {
  return {
    uid: ADMIN_UID,
    email: ADMIN_EMAIL,
    name: "المالك",
    role: ROLES.OWNER,
    permissions: permissionsForRole(ROLES.OWNER),
    active: true,
    isOwner: true,
    createdAt: "",
    createdBy: "",
  };
}

function toMember(restDoc) {
  const data = parseFirestoreDoc(restDoc) || {};
  const uid = data._id || data.uid || "";
  return {
    uid,
    email: typeof data.email === "string" ? data.email : "",
    name: typeof data.name === "string" ? data.name : "",
    role: typeof data.role === "string" ? data.role : "",
    active: data.active !== false,
    isOwner: uid === ADMIN_UID,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
  };
}

function authError(auth) {
  const status = auth.status === 403 ? 403 : 401;
  return NextResponse.json(
    { success: false, error: auth.reason || "unauthorized" },
    { status },
  );
}

export async function GET(request) {
  const auth = await verifyAdminPermission(request, "members.manage");
  if (!auth.ok) return authError(auth);

  try {
    const docs = await firestoreAdminList("admins");
    const members = docs.map(toMember).filter((m) => m.uid && m.uid !== ADMIN_UID);
    members.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    return NextResponse.json({ success: true, members: [ownerEntry(), ...members] });
  } catch (error) {
    // كولكشن غير موجود بعد (لا يوجد أعضاء) = قائمة فارغة، وليس خطأ.
    if (String(error?.message || "").includes("(404)")) {
      return NextResponse.json({ success: true, members: [ownerEntry()] });
    }
    console.error("[members] list failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "members_list_failed" },
      { status: 500 },
    );
  }
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

  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const active = body?.active === undefined ? true : body.active === true;

  if (!UID_RE.test(uid)) {
    return NextResponse.json(
      { success: false, error: "invalid_uid" },
      { status: 400 },
    );
  }
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
  // المالك لا يُعدَّل من هنا إطلاقًا.
  if (uid === ADMIN_UID) {
    return NextResponse.json(
      { success: false, error: "cannot_modify_owner" },
      { status: 400 },
    );
  }
  // المالك لا يلغي تفعيل نفسه.
  if (uid === auth.uid && active === false) {
    return NextResponse.json(
      { success: false, error: "cannot_deactivate_self" },
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
      active,
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
    return NextResponse.json({ success: true, member: { ...data, isOwner: false } });
  } catch (error) {
    console.error("[members] save failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "members_save_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
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

  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  if (!UID_RE.test(uid)) {
    return NextResponse.json(
      { success: false, error: "invalid_uid" },
      { status: 400 },
    );
  }
  if (uid === ADMIN_UID) {
    return NextResponse.json(
      { success: false, error: "cannot_modify_owner" },
      { status: 400 },
    );
  }
  if (uid === auth.uid) {
    return NextResponse.json(
      { success: false, error: "cannot_deactivate_self" },
      { status: 400 },
    );
  }

  try {
    const existing = await firestoreAdminGet("admins", uid).catch(() => null);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "member_not_found" },
        { status: 404 },
      );
    }
    const existingData = parseFirestoreDoc(existing) || {};
    // إلغاء تفعيل فقط — لا حذف نهائي، فيبقى السجل للمراجعة
    // ويمكن إعادة التفعيل من POST بنفس الـ UID.
    await firestoreAdminSet("admins", uid, {
      uid,
      email: typeof existingData.email === "string" ? existingData.email : "",
      name: typeof existingData.name === "string" ? existingData.name : "",
      role: typeof existingData.role === "string" ? existingData.role : ROLES.VIEWER,
      active: false,
      createdAt: typeof existingData.createdAt === "string" ? existingData.createdAt : "",
      createdBy: typeof existingData.createdBy === "string" ? existingData.createdBy : "",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[members] deactivate failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "members_deactivate_failed" },
      { status: 500 },
    );
  }
}
