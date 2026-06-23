// lib/fbTrack.js
//
// دالة موحّدة لإرسال أحداث Facebook Pixel عبر /api/fb-track
// (مباشرة لـ Conversions API، بدون المرور بـ Zaraz).
//
// تُستخدم بدل window.zaraz.track() لأحداث: ViewContent, AddToCart,
// InitiateCheckout, Purchase — التي تحتاج content_ids كـ array صحيح.

export function fbTrack(eventName, data = {}) {
  if (typeof window === "undefined") return;
  try {
    fetch("/api/fb-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: eventName,
        event_source_url: window.location.href,
        ...data,
      }),
      // keepalive يضمن إتمام الطلب حتى لو المستخدم انتقل لصفحة تانية فوراً
      // (مهم بشكل خاص لـ Purchase بعد إتمام الطلب)
      keepalive: true,
    }).catch((err) => {
      console.error(`fbTrack(${eventName}) failed:`, err);
    });
  } catch (err) {
    console.error(`fbTrack(${eventName}) error:`, err);
  }
}
