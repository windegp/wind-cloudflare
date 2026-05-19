// src/lib/admin-constants.js
// =========================================
// 🔥 WIND Admin — Central Constants File
// كل الـ magic numbers في مكان واحد
// =========================================

// ---- Firestore Pagination ----
export const ORDERS_PAGE_SIZE = 20;
export const CUSTOMERS_PAGE_SIZE = 20;
export const PRODUCTS_PAGE_SIZE = 50;
export const REVIEWS_PAGE_SIZE = 20;
export const PRODUCT_STATS_LIMIT = 100;
export const PICKER_PRODUCTS_LIMIT = 200;
export const EXPORT_BATCH_SIZE = 500;

// ---- SWR Cache ----
export const SWR_ADMIN_DEDUP_INTERVAL = 300000;   // 5 دقايق
export const SWR_PUBLIC_DEDUP_INTERVAL = 300000;  // 5 دقايق

// ---- RTDB Live Sessions ----
export const LIVE_SESSION_TTL_MS = 7200000;       // ساعتين
export const MAX_DISPLAYED_SESSIONS = 50;

// ---- Collections Names ----
export const COLLECTIONS = {
  ORDERS: "Orders",
  CUSTOMERS: "Customers",
  PRODUCTS: "products",
  REVIEWS: "Reviews",
  COLLECTIONS: "collections",
  SETTINGS: "settings",
  SETTINGS_DOC: "siteSettings",
  PRODUCT_STATS: "ProductStats",
  HOMEPAGE: "homepage",
};