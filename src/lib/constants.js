// ============================================
// 🛍️ WIND Shopping Constants
// Central location for all hardcoded values
// ============================================

// ============================================
// 👤 ADMIN CONFIGURATION
// ============================================
export const ADMIN_UID = "jGb9wBMHZfRIQgR9yfbb3rkvzRw2";

// ============================================
// 💳 SHIPPING CONFIGURATION
// ============================================
export const SHIPPING_COST = 70; // EGP
export const FREE_SHIPPING_THRESHOLD = Infinity; // No threshold; only "free" promo code enables free shipping

// ============================================
// 💰 CURRENCY
// ============================================
export const CURRENCY = "EGP";
export const CURRENCY_SYMBOL = "EGP";

// ============================================
// 🎟️ PROMO CODES
// ============================================
export const VALID_PROMO_CODES = {
  FREE: "free", // Enables free shipping
};

// ============================================
// 🎨 BRAND COLORS
// ============================================
export const BRAND_COLOR = "#F5C518"; // Yellow/Gold
export const BRAND_COLOR_HEX = "#F5C518";
export const DARK_BG = "#1A1A1A";
export const LIGHT_TEXT = "#ffffff";

// ============================================
// 📧 EMAIL CONFIGURATION
// ============================================
export const ADMIN_EMAIL = "info@windeg.com";
export const EMAIL_FROM = "WIND Shopping <info@windeg.com>";
export const EMAIL_DOMAIN = "windeg.com";

// ============================================
// 🌐 WEBSITE CONFIGURATION
// ============================================
export const SITE_NAME = "WIND Shopping";
export const SITE_DOMAIN = "windeg.com";

// ============================================
// 📦 KASHIER PAYMENT CONFIGURATION
// ============================================
// Note: Actual values come from environment variables
// These are just reference constants for setup
export const KASHIER_CONFIG = {
  MODE: process.env.KASHIER_MODE || "live", // or 'test'
  CURRENCY: "EGP",
  ALLOWED_METHODS: "bank_installments,card,wallet",
  DISPLAY_LANGUAGE: "ar",
};

// ============================================
// 📋 FIREBASE COLLECTIONS
// ============================================
export const FIRESTORE_COLLECTIONS = {
  PRODUCTS: "products",
  ORDERS: "Orders",
  CUSTOMERS: "Customers",
  REVIEWS: "Reviews",
  COLLECTIONS: "collections", // Note: Keep lowercase for consistency
  PAGES: "pages",
  SETTINGS: "settings",
  HERO_SLIDES: "heroSlides",
  NAVIGATION_LINKS: "navigationLinks",
  MARQUEE_PRODUCTS: "marqueeProducts",
  FEATURED_PRODUCTS: "featuredProducts",
  BEST_SELLERS: "bestSellers",
  EXCLUSIVE_OFFERS: "exclusiveOffers",
  MASTERPIECE_COLLECTIONS: "masterpieceCollections",
};

// ============================================
// 🖼️ IMAGE UPLOAD CONFIGURATION
// ============================================
// Note: ImageKit configuration comes from environment variables
export const IMAGE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FORMATS: ["image/jpeg", "image/png", "image/webp"],
  TOKEN_EXPIRY_SECONDS: 2400, // 40 minutes
};

// ============================================
// 🔐 ORDER CONFIGURATION
// ============================================
export const ORDER_NUMBER_PREFIX = "WND";
export const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

// ============================================
// 💬 PAYMENT METHOD DISPLAY NAMES
// ============================================
export const PAYMENT_METHOD_DISPLAY = {
  COD: "دفع عند الاستلام",
  INSTAPAY: "إنستا باي",
  CARD_SUCCESS: "بطاقة ائتمان (مدفوع بنجاح ✅)",
  CARD: "بطاقة ائتمان",
};

// ============================================
// 📐 RESPONSIVE BREAKPOINTS
// ============================================
export const BREAKPOINTS = {
  MOBILE: 640,
  TABLET: 768,
  DESKTOP: 1024,
  WIDE: 1280,
};

// ============================================
// ✅ VALIDATION RULES
// ============================================
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 6,
  MAX_PRODUCT_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 5000,
};
