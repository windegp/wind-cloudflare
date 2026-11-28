// ============================================
// 🎁 ADMIN OFFERS API — حفظ العروض للموظفين
// ============================================
//
// صفحة العروض كانت تحفظ العروض بقنوات setDoc/updateDoc/
// deleteDoc مباشرة من المتصفح، وقواعد Firestore الحيّة لا
// تسمح بكتابة `offers` إلا للمالك (القراءة عامة) — فكان أي
// موظف يفشل في حفظ/تفعيل/حذف عرض، وفي حفظ قاعدة الشحن المجاني.
// الكتابة هنا تتم عبر Service Account (serverOrderStore) فتتخطى
// القواعد؛ والأدوار تُفرض بـ verifyAdminPermission (offers.edit)
// فقط — بلا أي تغيير في الـ Rules.
//
//   POST   /api/admin/offers
//          -> إنشاء عرض أو تعديله ({ offer, editingId })
//   PATCH  /api/admin/offers
//          -> تفعيل/إيقاف عرض ({ id, active })
//   DELETE /api/admin/offers?id=..
//          -> حذف عرض
//   POST   /api/admin/offers/shipping-rule
//          -> حفظ قاعدة الشحن المجاني ({ rule, environment })
//
// قراءة القائمة (العروض + المنتجات + قاعدة الشحن) ما زالت من
// المتصفح كما هي — قراءتها عامة في القواعد. حالة قائمة العروض
// عند الموظفين غير مؤكدة بعد (انظر docs/admin-staff-pages-api.md)؛
// هذا المسار يصلح الكتابة المؤكدة في الكود فقط.

import { NextResponse } from "next/server";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { firestoreAdminDelete } from "@/lib/firestoreAdmin";
import { verifyAdminPermission } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const OFFER_TYPES = [
  "buy_x_get_y",
  "buy_x_get_y_select_gift",
  "nth_percent",
  "cart_percent",
  "cart_fixed",
  "coupon_fixed",
];
const ENVIRONMENTS = ["production", "preview"];
const COUPON_CODE_RE = /^[A-Z0-9_-]{3,40}$/i;

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

function isNonNegativeNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isDateOrNull(v) {
  return v === null || v === "" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

// تحقق من حمولة العرض — نفس قواعد validate() في الصفحة،
// لكن على السيرفر حتى لا يعتمد الحفظ على تحقق المتصفح وحده.
// يرجع رسالة الخطأ أو null.
function validateOffer(offer) {
  if (!offer || typeof offer !== "object") return "invalid_offer";
  if (typeof offer.name !== "string" || !offer.name.trim()) return "invalid_name";
  if (!OFFER_TYPES.includes(offer.type)) return "invalid_type";
  if (!isNonNegativeNumber(offer.minCart)) return "invalid_min_cart";
  if (!isNonNegativeNumber(offer.maxDiscount)) return "invalid_max_discount";
  if (!Number.isInteger(offer.priority) || offer.priority < 0) return "invalid_priority";
  if (!isDateOrNull(offer.startsAt) || !isDateOrNull(offer.endsAt)) return "invalid_dates";
  if (offer.startsAt && offer.endsAt && offer.startsAt > offer.endsAt) return "invalid_dates";
  if (!["all", "selected"].includes(offer.productScope)) return "invalid_scope";
  if (!isStringArray(offer.productIds)) return "invalid_product_ids";
  if (!isStringArray(offer.excludedProductIds)) return "invalid_product_ids";
  if (typeof offer.excludeDiscounted !== "boolean") return "invalid_offer";

  const cfg = offer.config || {};
  if (offer.type === "buy_x_get_y" || offer.type === "buy_x_get_y_select_gift") {
    if (!Number.isInteger(cfg.buyQty) || cfg.buyQty < 1) return "invalid_config";
    if (!Number.isInteger(cfg.getQty) || cfg.getQty < 1) return "invalid_config";
  }
  if (offer.type === "buy_x_get_y_select_gift") {
    if (!Array.isArray(offer.purchaseProductIds) || !offer.purchaseProductIds.length) {
      return "invalid_config";
    }
    if (!Array.isArray(offer.giftProductIds) || !offer.giftProductIds.length) {
      return "invalid_config";
    }
    if (!isStringArray(offer.purchaseProductIds) || !isStringArray(offer.giftProductIds)) {
      return "invalid_config";
    }
  }
  if (offer.type === "nth_percent") {
    if (!Number.isInteger(cfg.nth) || cfg.nth < 2) return "invalid_config";
    if (!(cfg.percent > 0 && cfg.percent <= 100)) return "invalid_config";
  }
  if (offer.type === "cart_percent") {
    if (!(cfg.percent > 0 && cfg.percent <= 100)) return "invalid_config";
  }
  if (offer.type === "cart_fixed" || offer.type === "coupon_fixed") {
    if (!(cfg.amount > 0)) return "invalid_config";
  }
  if (offer.type === "coupon_fixed") {
    if (typeof offer.couponCode !== "string" || !COUPON_CODE_RE.test(offer.couponCode.trim())) {
      return "invalid_coupon_code";
    }
  }
  if (offer.type !== "buy_x_get_y_select_gift" && offer.productScope === "selected" &&
      (!Array.isArray(offer.productIds) || offer.productIds.length === 0)) {
    return "invalid_config";
  }
  return null;
}

// يبني المستند المخزّن من الحقول المتحقَّق منها فقط —
// أي حقل إضافي يرسله المتصفح يُتجاهل عمدًا.
function buildOfferData(offer, environment, now) {
  const cfg = offer.config || {};
  const numericConfig = {};
  if (offer.type === "buy_x_get_y" || offer.type === "buy_x_get_y_select_gift") {
    numericConfig.buyQty = Number(cfg.buyQty);
    numericConfig.getQty = Number(cfg.getQty);
  } else if (offer.type === "nth_percent") {
    numericConfig.nth = Number(cfg.nth);
    numericConfig.percent = Number(cfg.percent);
  } else if (offer.type === "cart_percent") {
    numericConfig.percent = Number(cfg.percent);
  } else if (offer.type === "cart_fixed" || offer.type === "coupon_fixed") {
    numericConfig.amount = Number(cfg.amount);
  }

  return {
    name: offer.name.trim(),
    type: offer.type,
    displayText: String(offer.displayText || "").trim(),
    campaignLabel: String(offer.campaignLabel || "").trim(),
    description: String(offer.description || "").trim(),
    couponCode: offer.type === "coupon_fixed"
      ? String(offer.couponCode).trim().toUpperCase()
      : "",
    config: numericConfig,
    minCart: offer.type === "buy_x_get_y_select_gift" ? 0 : Number(offer.minCart) || 0,
    maxDiscount: offer.type === "buy_x_get_y_select_gift" ? 0 : Number(offer.maxDiscount) || 0,
    ...(offer.type === "buy_x_get_y_select_gift"
      ? {
          purchaseProductIds: [...new Set(offer.purchaseProductIds.map(String))],
          giftProductIds: [...new Set(offer.giftProductIds.map(String))],
        }
      : {}),
    priority: Number(offer.priority),
    startsAt: offer.startsAt || null,
    endsAt: offer.endsAt || null,
    active: offer.active === true,
    productScope: offer.productScope,
    productIds: offer.productScope === "selected"
      ? [...new Set(offer.productIds.map(String))]
      : [],
    excludedProductIds: [...new Set((offer.excludedProductIds || []).map(String))],
    excludeDiscounted: offer.excludeDiscounted === true,
    // العروض التلقائية حصرية عمدًا: لا تجميع مع عروض أخرى.
    stackWithOfferIds: [],
    freeShipping: false,
    environment,
    updatedAt: now,
  };
}

export async function POST(request) {
  const auth = await verifyAdminPermission(request, "offers.edit");
  if (!auth.ok) return authError(auth);

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const offer = body?.offer;
  const editingId = typeof body?.editingId === "string" && body.editingId
    ? body.editingId
    : null;
  const environment = ENVIRONMENTS.includes(body?.environment)
    ? body.environment
    : "production";

  const validationError = validateOffer(offer);
  if (validationError) return badRequest(validationError);

  const now = new Date().toISOString();

  try {
    // قسيمة الشراء: كودها يجب أن يكون فريدًا في بيئتها،
    // وألا يصطدم بأكواد الخصم القديمة (promoCodes).
    if (offer.type === "coupon_fixed") {
      const normalizedCode = String(offer.couponCode).trim().toUpperCase();
      const existingOffers = await serverOrderStore.query("offers", { limit: 1000 });
      const clash = existingOffers.some((row) => {
        const data = row.data || {};
        return (
          data.type === "coupon_fixed" &&
          row.id !== editingId &&
          String(data.couponCode || "").trim().toUpperCase() === normalizedCode &&
          (environment === "preview"
            ? data.environment === "preview"
            : data.environment !== "preview")
        );
      });
      if (clash) return badRequest("coupon_in_use");
      const legacyCode = await serverOrderStore.getData("promoCodes", normalizedCode);
      if (legacyCode) return badRequest("code_in_legacy_promo_codes");
    }

    const data = buildOfferData(offer, environment, now);

    if (editingId) {
      const record = await serverOrderStore.get("offers", editingId);
      if (!record) {
        return NextResponse.json(
          { success: false, error: "offer_not_found" },
          { status: 404 },
        );
      }
      await serverOrderStore.commit([{
        collection: "offers",
        id: editingId,
        data,
        version: record.version,
        merge: true,
      }]);
      return NextResponse.json({ success: true, id: editingId });
    }

    const randomId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const id = `offer_${randomId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    await serverOrderStore.commit([{
      collection: "offers",
      id,
      data: { ...data, createdAt: now },
      create: true,
    }]);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[admin/offers] save failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "offers_save_failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminPermission(request, "offers.edit");
  if (!auth.ok) return authError(auth);

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return badRequest("invalid_id");
  if (typeof body?.active !== "boolean") return badRequest("invalid_active");

  try {
    const record = await serverOrderStore.get("offers", id);
    if (!record) {
      return NextResponse.json(
        { success: false, error: "offer_not_found" },
        { status: 404 },
      );
    }
    await serverOrderStore.commit([{
      collection: "offers",
      id,
      data: { active: body.active, updatedAt: new Date().toISOString() },
      version: record.version,
      merge: true,
    }]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/offers] toggle failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "offers_toggle_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminPermission(request, "offers.edit");
  if (!auth.ok) return authError(auth);

  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") || "").trim();
  if (!id) return badRequest("invalid_id");

  try {
    // حذف مستند غير موجود ينجح بصمت — نفس سلوك deleteDoc في الصفحة.
    await firestoreAdminDelete("offers", id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/offers] delete failed:", error?.message || error);
    return NextResponse.json(
      { success: false, error: "offers_delete_failed" },
      { status: 500 },
    );
  }
}
