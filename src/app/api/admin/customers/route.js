// ============================================
// 👥 ADMIN CUSTOMERS API — قائمة العملاء للموظفين
// ============================================
//
// صفحة العملاء كانت تقرأ Firestore مباشرة من المتصفح،
// وقواعد Firestore الحيّة تسمح بهذه القراءة للمالك فقط،
// فكان كل موظف — حتى بدور أدمن — يرى قائمة فاضية.
// القراءة هنا تتم عبر Service Account (serverOrderStore)
// فتتخطى القواعد؛ والأدوار تُفرض بـ verifyAdminPermission
// (customers.view) فقط — بلا أي تغيير في الـ Rules.
//
//   GET ?tab=wind|shopify|all&limit&offset
//       -> عملاء مرتبين بـ last_active تنازليًا (نفس ترتيب الصفحة)
//
// الحذف وزر "تحديث الأرشيف" (fixOldData) ما زالا من المتصفح كما هما.

import { NextResponse } from "next/server";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const TABS = ["wind", "shopify", "all"];

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
  const auth = await verifyAdminPermission(request, "customers.view");
  if (!auth.ok) return authError(auth);

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"), 20, 500);
  const offset = parseOffset(searchParams.get("offset"));
  const tab = TABS.includes(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "wind";

  const filters = [];
  if (tab === "wind") {
    filters.push({ field: "data_source", op: "EQUAL", value: "WIND_Web" });
  } else if (tab === "shopify") {
    filters.push({ field: "data_source", op: "EQUAL", value: "Shopify_Import" });
  }

  try {
    const rows = await serverOrderStore.query("Customers", {
      ...(filters.length ? { filters } : {}),
      orderBy: { field: "last_active", direction: "DESCENDING" },
      limit,
      offset,
    });
    return NextResponse.json({
      success: true,
      customers: rows.map((r) => ({ id: r.id, ...r.data })),
      hasMore: rows.length === limit,
      nextOffset: offset + rows.length,
    });
  } catch (error) {
    console.error("[admin/customers] list failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "customers_list_failed" },
      { status: 500 },
    );
  }
}
