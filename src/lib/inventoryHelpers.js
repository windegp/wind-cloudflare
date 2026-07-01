/**
 * WIND Shopping — Inventory Helpers
 * Phase 6 · Central inventory logic
 *
 * Single Source of Truth لكل قرارات الـ inventory في المشروع.
 * كل الـ Storefront، Admin، وMeta Catalog يستخدمون هذا الملف فقط.
 *
 * Golden Rule (مُطبَّقة هنا):
 *   inventoryStatus → قرار تجاري (Business Decision)
 *   quantity        → واقع مادي (Physical Fact)
 *   لا يُشتق inventoryStatus من quantity أبداً.
 */

// ─── Inventory Status Enum ────────────────────────────────────────────────────
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  MIGRATION MARKER — ليست جزءاً من الـ Final Business Enum              │
// │  ─────────────────────────────────────────────────────────────────────  │
// │  NEEDS_REVIEW                                                           │
// │                                                                         │
// │  • تُكتَب فقط بواسطة Migration Script (مرة واحدة)                     │
// │  • لا تظهر في Admin Dropdown — الأدمن لا يستطيع اختيارها              │
// │  • لا تُرسَل لـ Meta Catalog كـ available (تُعامَل كـ out of stock)    │
// │  • لا تُعرَض للعميل بأي شكل                                           │
// │  • بعد اكتمال المراجعة البشرية تختفي من البيانات نهائياً               │
// │  • وجودها على variant = "هذا الـ variant لم يُراجَع بعد"               │
// ├─────────────────────────────────────────────────────────────────────────┤
// │  FINAL BUSINESS ENUM — الحالات التسع المعتمدة نهائياً                  │
// │  ─────────────────────────────────────────────────────────────────────  │
// │  IN_STOCK | LOW_STOCK | OUT_OF_STOCK | PRE_ORDER | BACKORDER           │
// │  COMING_SOON | TEMP_DISABLED | DISCONTINUED | ARCHIVED                 │
// │                                                                         │
// │  • هذه فقط تظهر في Admin Dropdown                                      │
// │  • هذه فقط تُخزَّن كقرار تجاري نهائي                                   │
// │  • هذه فقط يُبنى عليها سلوك الموقع وMeta Catalog                      │
// └─────────────────────────────────────────────────────────────────────────┘

export const INVENTORY_STATUS = {
  // ── Migration Marker (مؤقت — ليس جزءاً من الـ Business Enum) ────────────
  NEEDS_REVIEW:  "NEEDS_REVIEW",

  // ── Final Business Enum (9 حالات نهائية معتمدة) ─────────────────────────
  IN_STOCK:      "IN_STOCK",
  LOW_STOCK:     "LOW_STOCK",
  OUT_OF_STOCK:  "OUT_OF_STOCK",
  PRE_ORDER:     "PRE_ORDER",
  BACKORDER:     "BACKORDER",
  COMING_SOON:   "COMING_SOON",
  TEMP_DISABLED: "TEMP_DISABLED",
  DISCONTINUED:  "DISCONTINUED",
  ARCHIVED:      "ARCHIVED",
};

// Set للتحقق السريع
const VALID_STATUSES = new Set(Object.values(INVENTORY_STATUS));

// ─── Purchasable Statuses ─────────────────────────────────────────────────────

const PURCHASABLE = new Set([
  INVENTORY_STATUS.IN_STOCK,
  INVENTORY_STATUS.LOW_STOCK,
  INVENTORY_STATUS.PRE_ORDER,
  INVENTORY_STATUS.BACKORDER,
]);

// ─── Core Helper: getVariantBehavior ─────────────────────────────────────────
/**
 * المصدر الوحيد لقرار "هل يمكن شراء هذا الـ variant؟"
 *
 * يتعامل بأمان مع:
 *   - NEEDS_REVIEW (حالة migration مؤقتة) → OUT_OF_STOCK
 *   - أي قيمة غير معروفة / undefined / null   → OUT_OF_STOCK
 *   - DISCONTINUED                            → مخفي من الواجهة
 *   - ARCHIVED                               → مخفي من الواجهة
 *
 * @param {string|undefined} inventoryStatus - قيمة inventoryStatus من Firestore
 * @returns {{ canPurchase: boolean, hideFromUI: boolean, status: string }}
 */
export function getVariantBehavior(inventoryStatus) {
  // Fail Closed: any unknown value → OUT_OF_STOCK, never purchasable
  // NEEDS_REVIEW: expected migration marker, no warning
  // Unknown string: real error → console.warn for admin visibility
  const isNeedsReview = inventoryStatus === INVENTORY_STATUS.NEEDS_REVIEW;
  const isUnknown = (
    !isNeedsReview &&
    inventoryStatus !== undefined &&
    inventoryStatus !== null &&
    !VALID_STATUSES.has(inventoryStatus)
  );

  if (!inventoryStatus || !VALID_STATUSES.has(inventoryStatus)) {
    if (isUnknown && typeof console !== "undefined") {
      console.warn(
        `[WIND Inventory] Unknown inventoryStatus: "${inventoryStatus}". ` +
        `Treating as OUT_OF_STOCK (Fail Closed). ` +
        `Valid values: ${[...VALID_STATUSES].join(", ")}`
      );
    }
    return {
      canPurchase:   false,
      hideFromUI:    false,
      status:        INVENTORY_STATUS.OUT_OF_STOCK,
      isNeedsReview,
      isUnknown,
    };
  }

  return {
    canPurchase:   PURCHASABLE.has(inventoryStatus),
    hideFromUI:    inventoryStatus === INVENTORY_STATUS.DISCONTINUED ||
                   inventoryStatus === INVENTORY_STATUS.ARCHIVED,
    status:        inventoryStatus,
    isNeedsReview: false,
    isUnknown:     false,
  };
}

// ─── Meta Catalog: getMetaAvailability ───────────────────────────────────────
/**
 * يحوّل inventoryStatus إلى قيمة g:availability لـ Meta Catalog.
 * DISCONTINUED و ARCHIVED يُحذفان من الفيد (ترجع null = exclude item).
 *
 * @param {string|undefined} inventoryStatus
 * @returns {"in stock" | "out of stock" | "preorder" | null}
 *          null = احذف هذا الـ item من الفيد كلياً
 */
export function getMetaAvailability(inventoryStatus) {
  switch (inventoryStatus) {
    case INVENTORY_STATUS.IN_STOCK:
    case INVENTORY_STATUS.LOW_STOCK:
      return "in stock";

    case INVENTORY_STATUS.PRE_ORDER:
    case INVENTORY_STATUS.BACKORDER:
      return "preorder";

    case INVENTORY_STATUS.OUT_OF_STOCK:
    case INVENTORY_STATUS.COMING_SOON:
    case INVENTORY_STATUS.TEMP_DISABLED:
      return "out of stock";

    case INVENTORY_STATUS.DISCONTINUED:
    case INVENTORY_STATUS.ARCHIVED:
      return null; // يُحذَف من الفيد كلياً

    // NEEDS_REVIEW + أي قيمة غير معروفة → out of stock (لا تُرسَل لـ Meta كـ available)
    case INVENTORY_STATUS.NEEDS_REVIEW:
    default:
      return "out of stock";
  }
}

// ─── Storefront Display: getVariantDisplayInfo ────────────────────────────────
/**
 * معلومات العرض للـ Storefront لكل variant.
 * يُستخدَم لعرض النصوص المناسبة (زر السلة، badge، تاريخ التوفر).
 *
 * @param {string|undefined} inventoryStatus
 * @param {number} quantity
 * @param {string|null} expectedAvailabilityDate
 * @param {boolean} inventoryManaged
 * @param {number} lowStockThreshold
 * @returns {{ buttonLabel: string, badge: string|null, statusDot: string }}
 */
export function getVariantDisplayInfo(
  inventoryStatus,
  quantity = 0,
  expectedAvailabilityDate = null,
  inventoryManaged = true,
  lowStockThreshold = 5
) {
  const behavior = getVariantBehavior(inventoryStatus);
  const dateStr = expectedAvailabilityDate
    ? new Date(expectedAvailabilityDate).toLocaleDateString("ar-EG", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  switch (behavior.status) {
    case INVENTORY_STATUS.IN_STOCK:
      return {
        buttonLabel: "أضف إلى السلة",
        badge: null,
        statusDot: "green",
        statusText: "متوفر في المخزون",
      };

    case INVENTORY_STATUS.LOW_STOCK:
      return {
        buttonLabel: "أضف إلى السلة",
        // لو inventoryManaged=false: لا نعرض الرقم (الكمية غير موثوقة)
        badge: inventoryManaged && quantity > 0 ? `باقي ${quantity} فقط` : "كمية محدودة",
        statusDot: "yellow",
        statusText: "كمية محدودة",
      };

    case INVENTORY_STATUS.OUT_OF_STOCK:
      return {
        buttonLabel: "غير متوفر",
        badge: null,
        statusDot: "red",
        statusText: "غير متوفر في المخزون",
      };

    case INVENTORY_STATUS.PRE_ORDER:
      return {
        buttonLabel: "طلب مسبق",
        badge: dateStr ? `يُشحن ${dateStr}` : "طلب مسبق",
        statusDot: "blue",
        statusText: dateStr ? `متاح للطلب المسبق · يُشحن ${dateStr}` : "متاح للطلب المسبق",
      };

    case INVENTORY_STATUS.BACKORDER:
      return {
        buttonLabel: "اطلب الآن",
        badge: dateStr ? `يُشحن عند توفره · ${dateStr}` : "يُشحن عند توفره",
        statusDot: "orange",
        statusText: "سيُشحن عند توفره",
      };

    case INVENTORY_STATUS.COMING_SOON:
      return {
        buttonLabel: "قريباً",
        badge: dateStr ? `متوقع ${dateStr}` : "قريباً",
        statusDot: "gray",
        statusText: dateStr ? `قريباً · ${dateStr}` : "قريباً",
      };

    case INVENTORY_STATUS.TEMP_DISABLED:
      return {
        buttonLabel: "غير متاح حالياً",
        badge: null,
        statusDot: "gray",
        statusText: "غير متاح حالياً",
      };

    // DISCONTINUED, ARCHIVED, NEEDS_REVIEW, unknown
    default:
      return {
        buttonLabel: "غير متوفر",
        badge: null,
        statusDot: "red",
        statusText: "غير متوفر",
      };
  }
}

// ─── Admin: getAdminStatusLabel ───────────────────────────────────────────────
/**
 * التسمية العربية لكل status — للعرض في لوحة الإدارة فقط.
 * Firestore يخزن القيمة الإنجليزية دائماً.
 */
// Unknown status sentinel — shown in Admin UI when Firestore has an unrecognized value
export const UNKNOWN_STATUS_LABEL = "🔴 حالة غير معروفة";
export const UNKNOWN_STATUS_COLORS = { bg: "bg-red-100", text: "text-red-800", border: "border-red-400" };

export const ADMIN_STATUS_LABELS = {
  [INVENTORY_STATUS.NEEDS_REVIEW]:  "⚠️ تحتاج مراجعة",
  [INVENTORY_STATUS.IN_STOCK]:      "✅ متوفر",
  [INVENTORY_STATUS.LOW_STOCK]:     "🟡 كمية محدودة",
  [INVENTORY_STATUS.OUT_OF_STOCK]:  "❌ غير متوفر",
  [INVENTORY_STATUS.PRE_ORDER]:     "🔵 طلب مسبق",
  [INVENTORY_STATUS.BACKORDER]:     "🟠 إعادة توفير",
  [INVENTORY_STATUS.COMING_SOON]:   "🔜 قريباً",
  [INVENTORY_STATUS.TEMP_DISABLED]: "⏸️ موقوف مؤقتاً",
  [INVENTORY_STATUS.DISCONTINUED]:  "🚫 متوقف نهائياً",
  [INVENTORY_STATUS.ARCHIVED]:      "📦 مؤرشف",
};

/** لون خلفية كل status في الـ Matrix View */
export const ADMIN_STATUS_COLORS = {
  [INVENTORY_STATUS.NEEDS_REVIEW]:  { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  [INVENTORY_STATUS.IN_STOCK]:      { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300"  },
  [INVENTORY_STATUS.LOW_STOCK]:     { bg: "bg-yellow-50",  text: "text-yellow-700", border: "border-yellow-200" },
  [INVENTORY_STATUS.OUT_OF_STOCK]:  { bg: "bg-gray-100",   text: "text-gray-600",   border: "border-gray-300"   },
  [INVENTORY_STATUS.PRE_ORDER]:     { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300"   },
  [INVENTORY_STATUS.BACKORDER]:     { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  [INVENTORY_STATUS.COMING_SOON]:   { bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-300"  },
  [INVENTORY_STATUS.TEMP_DISABLED]: { bg: "bg-gray-200",   text: "text-gray-700",   border: "border-gray-400"   },
  [INVENTORY_STATUS.DISCONTINUED]:  { bg: "bg-black/10",   text: "text-gray-500",   border: "border-gray-400"   },
  [INVENTORY_STATUS.ARCHIVED]:      { bg: "bg-stone-100",  text: "text-stone-500",  border: "border-stone-300"  },
};

/** الـ statuses التي يمكن للأدمن الاختيار منها (NEEDS_REVIEW ليس خياراً يدوياً) */
export const ADMIN_SELECTABLE_STATUSES = [
  INVENTORY_STATUS.IN_STOCK,
  INVENTORY_STATUS.LOW_STOCK,
  INVENTORY_STATUS.OUT_OF_STOCK,
  INVENTORY_STATUS.PRE_ORDER,
  INVENTORY_STATUS.BACKORDER,
  INVENTORY_STATUS.COMING_SOON,
  INVENTORY_STATUS.TEMP_DISABLED,
  INVENTORY_STATUS.DISCONTINUED,
  INVENTORY_STATUS.ARCHIVED,
];

/**
 * الـ Final Business Enum الرسمي — الحالات التسع المعتمدة نهائياً.
 *
 * هذه هي المرجع الوحيد لأي تحقق من "هل هذا status نهائي؟"
 * NEEDS_REVIEW غير موجودة هنا عمداً — هي migration marker وليست business status.
 *
 * الاستخدام:
 *   FINAL_BUSINESS_STATUSES.has(status)  // true = status نهائي معتمد
 */
export const FINAL_BUSINESS_STATUSES = new Set([
  INVENTORY_STATUS.IN_STOCK,
  INVENTORY_STATUS.LOW_STOCK,
  INVENTORY_STATUS.OUT_OF_STOCK,
  INVENTORY_STATUS.PRE_ORDER,
  INVENTORY_STATUS.BACKORDER,
  INVENTORY_STATUS.COMING_SOON,
  INVENTORY_STATUS.TEMP_DISABLED,
  INVENTORY_STATUS.DISCONTINUED,
  INVENTORY_STATUS.ARCHIVED,
]);

/** الـ statuses التي تحتاج عرض expectedAvailabilityDate */
export const STATUSES_WITH_DATE = new Set([
  INVENTORY_STATUS.PRE_ORDER,
  INVENTORY_STATUS.BACKORDER,
  INVENTORY_STATUS.COMING_SOON,
]);

// ─── Architectural Decisions & Roadmap ───────────────────────────────────────
//
// هذا القسم يوثّق القرارات المعمارية المتفق عليها ومساراتها المستقبلية.
// المرجع: مناقشة Phase 6 — يونيو 2026.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  AD-1: option1Name / option2Name — حقول مشتقة وليست مصدر حقيقة         │
// ├─────────────────────────────────────────────────────────────────────────┤
// │  الوضع الحالي:                                                          │
// │    أول variant في كل منتج يحمل option1Name="Color" option2Name="Size"  │
// │    باقي الـ variants تأتي فارغة (نمط Shopify CSV).                     │
// │    fb-catalog/route.js لديه fallback كامل على product.options           │
// │    لذلك النظام يعمل صحيحاً رغم عدم الاتساق.                            │
// │                                                                         │
// │  القرار المعماري:                                                       │
// │    option1Name / option2Name داخل variant هي بيانات مشتقة فقط.         │
// │    مصدر الحقيقة الوحيد هو product.options على مستوى المنتج.            │
// │    وجودهما داخل variant يخلق مصدرين للحقيقة وهو مرفوض معمارياً.       │
// │                                                                         │
// │  الخطة المستقبلية (cleanup script منفصل، بعد Phase 6):                 │
// │    الخيار A: إزالة option1Name/option2Name من كل variants              │
// │              والاعتماد الكامل على product.options للـ lookup.           │
// │    الخيار B: تعبئتهم بشكل متسق في كل صفوف الـ variant                 │
// │              ("Color"/"Size" في كل صف) — أبسط للقراءة لكن تكرار.      │
// │    التوصية: الخيار A — يلغي التكرار ويجعل product.options               │
// │              المصدر الوحيد الواضح.                                      │
// │    ملاحظة: لا يُدمج مع Migration المخزون — script منفصل لاحقاً.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  AD-2: product.quantity — وضع انتقالي، الهدف إزالته نهائياً            │
// ├─────────────────────────────────────────────────────────────────────────┤
// │  الوضع الحالي:                                                          │
// │    11 منتجاً بلا variants array يعتمدون على product.quantity.          │
// │    fb-catalog يقرأ p.quantity فقط في فرع (variants.length === 0).      │
// │    هذا مشروع حالياً لكنه انتقالي.                                       │
// │                                                                         │
// │  القرار المعماري:                                                       │
// │    النظام النهائي يعتمد على variant.quantity + variant.inventoryStatus  │
// │    فقط، بدون استثناء لأي منتج.                                          │
// │    product.quantity هو legacy field يجب التخلص منه.                    │
// │                                                                         │
// │  الخطة المستقبلية (بعد Phase 6):                                        │
// │    1. تحويل الـ 11 منتج بلا variants إلى variant واحد افتراضي          │
// │       (مثل Shopify "Default Title" pattern) — migration script.         │
// │    2. بعد التحويل: حذف product.quantity من كل المنتجات.                │
// │    3. حذف فرع (variants.length === 0) من fb-catalog/route.js.           │
// │    4. حذف getLegacyAvailability() من هذا الملف.                        │
// │    النتيجة: نظام موحَّد بالكامل، مصدر حقيقة واحد لكل منتج.            │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  AD-3: Phase 6 Step 3 — Storefront Audit الشامل                        │
// ├─────────────────────────────────────────────────────────────────────────┤
// │  عند تنفيذ Storefront Integration، المطلوب مراجعة شاملة لكل قراءات:   │
// │    • product.quantity     (في ProductView, page.js, Schema.org)         │
// │    • sellOutOfStock       (في ProductView, fb-catalog)                  │
// │    • inventoryTracked     (أي مكان)                                     │
// │                                                                         │
// │  الهدف: كل منطق inventory يمر عبر:                                     │
// │    getVariantBehavior(variant.inventoryStatus)   ← من هذا الملف        │
// │  بدون أي قراءة مباشرة للحقول القديمة من الـ Storefront.                │
// │                                                                         │
// │  استثناءات مؤقتة مسموح بها حتى اكتمال AD-2:                           │
// │    fb-catalog فرع (variants.length === 0) يقرأ p.quantity — مشروع     │
// │    مؤقتاً حتى تحويل الـ 11 منتج لـ variants.                           │
// └─────────────────────────────────────────────────────────────────────────┘
/**
 * للتعامل مع المنتجات التي لم تُرحَّل بعد (لا inventoryStatus عليها).
 * يُعيد availability بناءً على الحقول القديمة (quantity + sellOutOfStock).
 *
 * يُستخدَم فقط كـ fallback خلال فترة الـ migration.
 * بعد اكتمال المراجعة البشرية لكل الـ variants، هذه الدالة تصبح غير مستخدَمة.
 *
 * @param {number} quantity
 * @param {string} sellOutOfStock - "Yes" | "No"
 * @returns {boolean} canPurchase
 */
export function getLegacyAvailability(quantity, sellOutOfStock) {
  return quantity > 0 || sellOutOfStock === "Yes";
}
