// POST /api/admin/offers/shipping-rule — حفظ قاعدة الشحن المجاني
// لمنتجات محددة. كانت الصفحة تكتب settings/offerShippingRules_<env>
// مباشرة من المتصفح، وقواعد Firestore الحيّة لا تسمح بكتابة
// مستندات settings للموظفين — فكان الحفظ يفشل لغير المالك.
// الكتابة هنا عبر Service Account؛ والأدوار تُفرض بـ offers.edit.
import { NextResponse } from "next/server";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const ENVIRONMENTS = ["production", "preview"];

function authError(auth) {
  const status = auth.status === 403 ? 403 : 401;
  return NextResponse.json(
    { success: false, error: auth.reason || "unauthorized" },
    { status },
  );
}

export async function POST(request) {
  const auth = await verifyAdminPermission(request, "offers.edit");
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

  const rule = body?.rule;
  const environment = ENVIRONMENTS.includes(body?.environment)
    ? body.environment
    : "production";

  if (!rule || typeof rule !== "object") {
    return NextResponse.json(
      { success: false, error: "invalid_rule" },
      { status: 400 },
    );
  }
  const productIds = Array.isArray(rule.productIds)
    ? rule.productIds.map(String)
    : [];
  if (rule.enabled === true && productIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "invalid_rule" },
      { status: 400 },
    );
  }
  if (rule.condition !== undefined && !["quantity", "subtotal"].includes(rule.condition)) {
    return NextResponse.json(
      { success: false, error: "invalid_rule" },
      { status: 400 },
    );
  }
  if (
    rule.condition === "quantity" &&
    (!Number.isInteger(Number(rule.minQuantity)) || Number(rule.minQuantity) < 1)
  ) {
    return NextResponse.json(
      { success: false, error: "invalid_rule" },
      { status: 400 },
    );
  }
  if (
    rule.condition === "subtotal" &&
    (!(Number(rule.minSubtotal) > 0) || !Number.isFinite(Number(rule.minSubtotal)))
  ) {
    return NextResponse.json(
      { success: false, error: "invalid_rule" },
      { status: 400 },
    );
  }

  const data = {
    enabled: rule.enabled === true,
    scope: "selected",
    productIds,
    condition: rule.condition === "subtotal" ? "subtotal" : "quantity",
    minQuantity: Math.max(1, Math.floor(Number(rule.minQuantity) || 1)),
    minSubtotal: Math.max(0, Number(rule.minSubtotal) || 0),
    environment,
    updatedAt: new Date().toISOString(),
  };

  const docId = `offerShippingRules_${environment}`;
  try {
    const existing = await serverOrderStore.get("settings", docId);
    if (existing) {
      await serverOrderStore.commit([{
        collection: "settings",
        id: docId,
        data,
        version: existing.version,
        merge: true,
      }]);
    } else {
      await serverOrderStore.commit([{
        collection: "settings",
        id: docId,
        data,
        create: true,
      }]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/offers/shipping-rule] save failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "shipping_rule_save_failed" },
      { status: 500 },
    );
  }
}
