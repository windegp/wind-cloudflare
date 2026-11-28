// ============================================
// 📦 ADMIN ORDERS API — قائمة الطلبات للموظفين
// ============================================
//
// صفحة الطلبات كانت تقرأ Firestore مباشرة من المتصفح،
// وقواعد Firestore الحيّة تسمح بهذه القراءة للمالك فقط،
// فكان كل موظف — حتى بدور أدمن — يرى قائمة فاضية.
// القراءة هنا تتم عبر Service Account (serverOrderStore)
// فتتخطى القواعد؛ والأدوار تُفرض بـ verifyAdminPermission
// (orders.view) فقط — بلا أي تغيير في الـ Rules.
//
//   GET ?tab=wind|shopify|all|abandoned&limit&offset
//       -> طلبات مرتبة بـ "Created at" تنازليًا (نفس ترتيب الصفحة)
//   GET ?email=.. / ?phone=..
//       -> بحث عن طلبات عميل واحد (تستخدمه صفحة العملاء عند الحذف؛
//          كانت تقرأها من المتصفح أيضًا فتُرفض للموظفين)
//
// التعديلات (تغيير الحالة/الدفع/الحذف) ما زالت من المتصفح كما هي —
// كتابة الطلبات مسموحة في القواعد (create/update if true)،
// فهي تعمل للموظفين أصلًا. هذا المسار للقراءة فقط.

import { NextResponse } from "next/server";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const TABS = ["wind", "shopify", "all", "abandoned"];

function parseLimit(value, fallback, max) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function parseOffset(value) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 10000);
}

function authError(auth) {
  const status = auth.status === 403 ? 403 : 401;
  return NextResponse.json(
    { success: false, error: auth.reason || "unauthorized" },
    { status },
  );
}

export async function GET(request) {
  const auth = await verifyAdminPermission(request, "orders.view");
  if (!auth.ok) return authError(auth);

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"), 20, 500);
  const offset = parseOffset(searchParams.get("offset"));
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  const phone = (searchParams.get("phone") || "").trim();

  try {
    // وضع البحث: طلبات عميل واحد بالإيميل أو التليفون (حد أقصى طلب واحد،
    // كما كانت صفحة العملاء تفعل عند الحذف).
    if (email || phone) {
      const field = email ? "Email" : "Phone";
      const value = email || phone;
      const rows = await serverOrderStore.query("Orders", {
        filters: [{ field, op: "EQUAL", value }],
        limit: 1,
      });
      return NextResponse.json({
        success: true,
        orders: rows.map((r) => ({ id: r.id, ...r.data })),
        hasMore: false,
        nextOffset: offset,
      });
    }

    const tab = TABS.includes(searchParams.get("tab"))
      ? searchParams.get("tab")
      : "wind";
    const filters = [];
    if (tab === "wind") {
      filters.push({ field: "data_source", op: "EQUAL", value: "WIND_Web" });
    } else if (tab === "shopify") {
      filters.push({ field: "data_source", op: "EQUAL", value: "Shopify_Import" });
    }
    // "all" و "abandoned" بلا فلتر data_source؛ والصفحة تفرّق السلات
    // المتروكة محليًا كما كانت تفعل مع استعلام المتصفح.

    const rows = await serverOrderStore.query("Orders", {
      ...(filters.length ? { filters } : {}),
      orderBy: { field: "Created at", direction: "DESCENDING" },
      limit,
      offset,
    });
    return NextResponse.json({
      success: true,
      orders: rows.map((r) => ({ id: r.id, ...r.data })),
      hasMore: rows.length === limit,
      nextOffset: offset + rows.length,
    });
  } catch (error) {
    console.error("[admin/orders] list failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "orders_list_failed" },
      { status: 500 },
    );
  }
}
