// ============================================
// 🔐 ADMIN RBAC — أدوار وصلاحيات لوحة تحكم WIND
// ============================================
//
// مصدر واحد للحقيقة (single source of truth) لصلاحيات الأدمن.
// يُستخدم من:
//   - العميل (admin/layout.js, admin/login/page.js, lib/adminAccess.js)
//     لإخفاء الأقسام وحجب الصفحات.
//   - السيرفر (lib/verifyAdminIdToken.js والـ API routes)
//     لفرض الصلاحيات فعليًا — إخفاء الواجهة وحده لا يكفي.
//
// ⚠️ حدود هذا النظام (اقرأ docs/admin-rbac.md):
//   - صفحات الأدمن تكتب في Firestore عبر الـ Client SDK مباشرة،
//     وهذه الكتابات يحكمها الـ Firestore Security Rules الحيّة
//     (وليست في هذا الريبو). صلاحيات RBAC هنا تحكم الواجهة
//     والـ API routes المحمية فقط.
//   - هذا الملف لا يصلح أي مسار كتابة عام غير موثّق وُجد في التدقيق.

import { ADMIN_UID } from "@/lib/constants";

// --------------------------------------------
// الصلاحيات (permission strings)
// --------------------------------------------
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  ORDERS_VIEW: "orders.view",
  ORDERS_EDIT: "orders.edit",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_EDIT: "products.edit",
  COLLECTIONS_EDIT: "collections.edit",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_EDIT: "inventory.edit",
  CUSTOMERS_VIEW: "customers.view",
  CONTENT_VIEW: "content.view",
  CONTENT_EDIT: "content.edit",
  REVIEWS_VIEW: "reviews.view",
  REVIEWS_EDIT: "reviews.edit",
  OFFERS_EDIT: "offers.edit",
  PROMOTIONS_EDIT: "promotions.edit",
  MEDIA_UPLOAD: "media.upload",
  MEMBERS_MANAGE: "members.manage",
  // استلام إشعار طلب جديد (push + تنبيه لحظي داخل الأدمن).
  // تُمنح للمالك والأدمن وموظف الطلبات والمشاهدة فقط (قرار المالك
  // 2026-11-28، عُدّل في نفس اليوم ليشمل المشاهدة فقط) — المنتجات
  // والمحتوى مستبعدون. انظر docs/admin-notifications-by-role.md.
  NOTIFICATIONS_RECEIVE: "notifications.receive",
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// أي صلاحية كتابة (غير قراءة). تُستخدم للمسارات التي تقبل أي كاتب،
// مثل /api/write-ops — فتُرفض أدوار القراءة فقط (viewer).
export const WRITE_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => !p.endsWith(".view"),
);

// --------------------------------------------
// الأدوار
// --------------------------------------------
export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  ORDERS: "orders",
  PRODUCTS: "products",
  CONTENT: "content",
  VIEWER: "viewer",
};

// الأدوار التي يمكن إسنادها لموظف عبر صفحة الأعضاء.
// "owner" ليس منها: المالك الوحيد هو ADMIN_UID في constants.js
// ولا يمكن إنشاء مالك آخر من الواجهة أو الـ API.
export const ASSIGNABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.ORDERS,
  ROLES.PRODUCTS,
  ROLES.CONTENT,
  ROLES.VIEWER,
];

export const ROLE_LABELS_AR = {
  [ROLES.OWNER]: "المالك",
  [ROLES.ADMIN]: "أدمن",
  [ROLES.ORDERS]: "موظف طلبات",
  [ROLES.PRODUCTS]: "موظف منتجات",
  [ROLES.CONTENT]: "موظف محتوى",
  [ROLES.VIEWER]: "مشاهدة فقط",
};

export const ROLE_DESCRIPTIONS_AR = {
  [ROLES.OWNER]: "كل الصلاحيات، بما فيها إدارة الأعضاء. لا يمكن إزالته أو تخفيضه.",
  [ROLES.ADMIN]: "كل الصلاحيات ما عدا إدارة الأعضاء.",
  [ROLES.ORDERS]: "لوحة التحكم، عرض وتعديل الطلبات، وعرض العملاء، واستلام إشعارات الطلبات الجديدة.",
  [ROLES.PRODUCTS]: "لوحة التحكم، عرض وتعديل المنتجات والأقسام والمخزون، ورفع صور المنتجات.",
  [ROLES.CONTENT]: "لوحة التحكم، إدارة الواجهة والمنيو والصفحات، والتقييمات والعروض وأكواد الخصم.",
  [ROLES.VIEWER]: "عرض فقط: لوحة التحكم والطلبات والمنتجات والعملاء والمخزون — بدون أي تعديل، مع استلام إشعارات الطلبات الجديدة.",
};

// --------------------------------------------
// خريطة الدور -> الصلاحيات
// --------------------------------------------
export const ROLE_PERMISSIONS = {
  [ROLES.OWNER]: [...ALL_PERMISSIONS],
  [ROLES.ADMIN]: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.MEMBERS_MANAGE),
  [ROLES.ORDERS]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.NOTIFICATIONS_RECEIVE,
  ],
  [ROLES.PRODUCTS]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_EDIT,
    PERMISSIONS.COLLECTIONS_EDIT,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.MEDIA_UPLOAD,
  ],
  [ROLES.CONTENT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CONTENT_VIEW,
    PERMISSIONS.CONTENT_EDIT,
    PERMISSIONS.REVIEWS_VIEW,
    PERMISSIONS.REVIEWS_EDIT,
    PERMISSIONS.OFFERS_EDIT,
    PERMISSIONS.PROMOTIONS_EDIT,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.NOTIFICATIONS_RECEIVE,
  ],
};

export function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

export function isAssignableRole(role) {
  return ASSIGNABLE_ROLES.includes(role);
}

export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

// يقبل صلاحية واحدة أو مصفوفة (يكفي توفّر أي واحدة منها).
export function hasAnyPermission(role, permissionOrList) {
  const list = Array.isArray(permissionOrList)
    ? permissionOrList
    : [permissionOrList];
  return list.some((p) => hasPermission(role, p));
}

export function isOwnerUid(uid) {
  return !!uid && uid === ADMIN_UID;
}

// حلّ الدور من مستند موظف (أو null لو لا يوجد / غير فعّال / دور غير صالح).
// المالك يرجع "owner" دائمًا حتى لو لا يوجد له مستند في كولكشن admins.
export function resolveRole(uid, staffDoc) {
  if (isOwnerUid(uid)) return ROLES.OWNER;
  if (!staffDoc || staffDoc.active === false) return null;
  if (!isValidRole(staffDoc.role) || staffDoc.role === ROLES.OWNER) return null;
  return staffDoc.role;
}

// --------------------------------------------
// خريطة مسارات الأدمن -> الصلاحية المطلوبة لعرضها.
// تُستخدم في admin/layout.js لحجب القسم كاملًا (وليس القائمة فقط).
// أول مطابقة (الأطول أولًا) هي الفائزة.
// --------------------------------------------
export const ROUTE_PERMISSIONS = [
  ["/admin/settings/members", PERMISSIONS.MEMBERS_MANAGE],
  ["/admin/settings", PERMISSIONS.CONTENT_EDIT],
  ["/admin/products/create", PERMISSIONS.PRODUCTS_EDIT],
  ["/admin/products", PERMISSIONS.PRODUCTS_VIEW],
  ["/admin/orders", PERMISSIONS.ORDERS_VIEW],
  ["/admin/customers", PERMISSIONS.CUSTOMERS_VIEW],
  ["/admin/reviews", PERMISSIONS.REVIEWS_VIEW],
  ["/admin/collections", PERMISSIONS.COLLECTIONS_EDIT],
  ["/admin/inventory-migration", PERMISSIONS.INVENTORY_EDIT],
  ["/admin/inventory", PERMISSIONS.INVENTORY_VIEW],
  ["/admin/home-manager", PERMISSIONS.CONTENT_EDIT],
  ["/admin/menu", PERMISSIONS.CONTENT_EDIT],
  ["/admin/pages", PERMISSIONS.CONTENT_EDIT],
  ["/admin/promotions", PERMISSIONS.PROMOTIONS_EDIT],
  ["/admin/offers", PERMISSIONS.OFFERS_EDIT],
  ["/admin/live", PERMISSIONS.ORDERS_VIEW],
  ["/admin", PERMISSIONS.DASHBOARD_VIEW],
];

export function permissionForAdminPath(pathname) {
  if (!pathname || pathname === "/admin/login") return null;
  const sorted = [...ROUTE_PERMISSIONS].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [prefix, permission] of sorted) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return permission;
    }
  }
  return null;
}
