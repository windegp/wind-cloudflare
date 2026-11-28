// ============================================
// 🏷️ ADMIN PROMOTIONS API — أكواد الخصم للموظفين
// ============================================
//
// صفحة العروض والخصومات كانت تقرأ كولكشن promoCodes مباشرة
// من المتصفح (promotions/page.js:108)، وقواعد Firestore الحيّة
// تسمح بهذه القراءة للمالك فقط — فكان أي موظف يرى رسالة الخطأ
// المُتحقَّق حيًا: "فشل تحميل البيانات: Request failed with error:
// Missing or insufficient permissions." والكتابة (إنشاء/تعديل/
// حذف كود) مرفوضة للموظفين أيضًا لعدم وجود قاعدة كتابة لها.
// القراءة والكتابة هنا تتم عبر Service Account فتتخطى القواعد؛
// والأدوار تُفرض بـ verifyAdminPermission (promotions.edit)
// فقط — بلا أي تغيير في الـ Rules.
//
//   GET    -> قائمة أكواد الخصم
//   POST   -> إنشاء كود ({ code, data, create: true })
//             أو تعديله ({ code, data, create: false })
//   DELETE -> حذف كود (?code=XXX)
//
// حفظ "إعدادات الشحن" في settings/siteSettings ما زال من المتصفح
// كما هو (خارج نطاق هذا التغيير)؛ قراءتها عامة فتعمل للموظفين.

import { NextResponse } from "next/server";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { firestoreAdminDelete } from "@/lib/firestoreAdmin";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z0-9_-]+$/i;
const CODE_TYPES = ["free_shipping", "percent", "fixed"];
const USAGE_TYPES = ["unlimited", "once_per_customer", "single_use", "limited"];

function authError(auth) {
  const status = auth.status === 403 ? 403 : 401;
  return NextResponse.json(
    { success: false, error: auth.reason || "unauthorized" },
    { status },
  );
}

function badRequest(error) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

// تحقق من حقول الكود — نفس قواعد validateForm في الصفحة،
// لكن على السيرفر حتى لا يعتمد الحفظ على تحقق المتصفح وحده.
function validateCodeData(data) {
  if (!data || typeof data !== "object") return "invalid_data";
  if (!CODE_TYPES.includes(data.type)) return "invalid_type";
  if (data.type !== "free_shipping") {
    if (!(Number(data.value) > 0)) return "invalid_value";
    if (data.type === "percent" && Number(data.value) > 100) return "invalid_value";
  }
  if (!USAGE_TYPES.includes(data.usageType)) return "invalid_usage_type";
  if (
    (data.usageType === "single_use" || data.usageType === "limited") &&
    !(Number(data.maxUses) >= 1)
  ) {
    return "invalid_max_uses";
  }
  if (data.expiresAt !== null && data.expiresAt !== undefined && data.expiresAt !== "") {
    if (typeof data.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.expiresAt)) {
      return "invalid_expires_at";
    }
  }
  if (data.scope !== "all" && !Array.isArray(data.scope)) return "invalid_scope";
  return null;
}

function normalizeCodeData(data) {
  const scope =
    data.scope === "all" || !data.scope
      ? "all"
      : (Array.isArray(data.scope) ? data.scope : [data.scope])
          .map((s) => String(s).trim())
          .filter(Boolean);
  return {
    type: data.type,
    value: Number(data.value) || 0,
    scope,
    usageType: data.usageType || "unlimited",
    maxUses: Number(data.maxUses) || 1,
    firstOrderOnly: data.firstOrderOnly === true,
    active: data.active !== false,
    expiresAt: data.expiresAt || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request) {
  const auth = await verifyAdminPermission(request, "promotions.edit");
  if (!auth.ok) return authError(auth);

  try {
    const rows = await serverOrderStore.query("promoCodes", { limit: 1000 });
    return NextResponse.json({
      success: true,
      codes: rows.map((r) => ({ id: r.id, ...r.data })),
    });
  } catch (error) {
    console.error("[admin/promotions] list failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "promotions_list_failed" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await verifyAdminPermission(request, "promotions.edit");
  if (!auth.ok) return authError(auth);

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!CODE_RE.test(code) || code.length > 40) return badRequest("invalid_code");
  const validationError = validateCodeData(body?.data);
  if (validationError) return badRequest(validationError);
  const isCreate = body?.create === true;
  const promoData = normalizeCodeData(body.data);

  try {
    const existing = await serverOrderStore.getData("promoCodes", code);
    if (isCreate) {
      if (existing) return badRequest("code_exists");
      await serverOrderStore.commit([{
        collection: "promoCodes",
        id: code,
        data: {
          ...promoData,
          usedCount: 0,
          usedBy: [],
          createdAt: new Date().toISOString(),
        },
        create: true,
      }]);
    } else {
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "code_not_found" },
          { status: 404 },
        );
      }
      const record = await serverOrderStore.get("promoCodes", code);
      await serverOrderStore.commit([{
        collection: "promoCodes",
        id: code,
        data: promoData,
        version: record.version,
        merge: true,
      }]);
    }
    return NextResponse.json({ success: true, code });
  } catch (error) {
    console.error("[admin/promotions] save failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "promotions_save_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminPermission(request, "promotions.edit");
  if (!auth.ok) return authError(auth);

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") || "").trim().toUpperCase();
  if (!CODE_RE.test(code)) return badRequest("invalid_code");

  try {
    // حذف مستند غير موجود ينجح بصمت — نفس سلوك deleteDoc في الصفحة.
    await firestoreAdminDelete("promoCodes", code);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/promotions] delete failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "promotions_delete_failed" },
      { status: 500 },
    );
  }
}
