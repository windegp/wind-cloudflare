// lib/fbTrack.js
//
// دالة موحّدة لإرسال أحداث Facebook Pixel عبر /api/fb-track
// (مباشرة لـ Conversions API، بدون المرور بـ Zaraz).
//
// تُستخدم بدل window.zaraz.track() لأحداث: ViewContent, AddToCart,
// InitiateCheckout, Purchase — التي تحتاج content_ids كـ array صحيح.
//
// 🔥 بالتوازي مع هذا، نطلق نفس الحدث على fbq() (Facebook Pixel الأساسي
// المُحمَّل في layout.js) بنفس event_id لتفعيل Deduplication الصحيح،
// ولرفع Event Match Quality عبر إشارات المتصفح (fbp/fbc الطازجة).

function getOrCreateExternalId() {
  if (typeof window === "undefined") return undefined;
  try {
    let id = localStorage.getItem("wind_external_id");
    if (!id) {
      id =
        "wind-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem("wind_external_id", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

function readCookie(name) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function generateEventId(eventName) {
  return `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fbTrack(eventName, data = {}) {
  if (typeof window === "undefined") return;

  const eventId = generateEventId(eventName);
  const externalId = getOrCreateExternalId();
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");

  // 1) نرسل للـ Pixel الأساسي (fbq) — بدون content_ids array لتجنب أي مشكلة flattening
  //    محتمَلة من جهة fbq نفسه، فقط القيم الأساسية + نفس event_id للـ dedup
  try {
    if (typeof window.fbq === "function") {
      window.fbq(
        "trackSingle",
        "880930164288645",
        eventName,
        {
          value: data.value,
          currency: data.currency,
          content_name: data.content_name,
          content_type: data.content_type,
          num_items: data.num_items,
        },
        { eventID: eventId }
      );
    }
  } catch (err) {
    console.error(`fbq(${eventName}) failed:`, err);
  }

  // 2) نرسل نفس الحدث للسيرفر عبر /api/fb-track — هذا المصدر الموثوق لـ content_ids
  //    ولإضافة Advanced Matching الكامل (email/phone عند توفرها)
  try {
    fetch("/api/fb-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url: window.location.href,
        external_id: externalId,
        fbp,
        fbc,
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
