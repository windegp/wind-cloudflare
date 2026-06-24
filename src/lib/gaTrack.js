// lib/gaTrack.js
//
// دالة موحّدة لإرسال أحداث Enhanced Ecommerce لـ Google Analytics 4،
// مستقلة بالكامل عن نظام Facebook Pixel (fbTrack.js) — لا تداخل بينهما.
//
// تستخدم صيغة GA4 الرسمية لأحداث E-commerce:
// https://developers.google.com/analytics/devguides/collection/ga4/ecommerce

function toGA4Item(item) {
  return {
    item_id: String(item.id || item.handle || item.title || ""),
    item_name: item.title || item.name || "",
    price: Number(item.price) || 0,
    quantity: Number(item.qty || item.quantity || 1),
  };
}

export function gaTrack(eventName, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", eventName, params);
  } catch (err) {
    console.error(`gaTrack(${eventName}) failed:`, err);
  }
}

// === دوال مساعدة لكل حدث، بصيغة GA4 الرسمية تماماً ===

export function gaViewItem(product) {
  gaTrack("view_item", {
    currency: "EGP",
    value: Number(product.price) || 0,
    items: [toGA4Item(product)],
  });
}

export function gaAddToCart(product, qty = 1) {
  gaTrack("add_to_cart", {
    currency: "EGP",
    value: (Number(product.price) || 0) * qty,
    items: [toGA4Item({ ...product, qty })],
  });
}

export function gaBeginCheckout(cartItems, total) {
  gaTrack("begin_checkout", {
    currency: "EGP",
    value: Number(total) || 0,
    items: cartItems.map(toGA4Item),
  });
}

export function gaPurchase(orderId, cartItems, total) {
  gaTrack("purchase", {
    transaction_id: String(orderId),
    currency: "EGP",
    value: Number(total) || 0,
    items: cartItems.map(toGA4Item),
  });
}
