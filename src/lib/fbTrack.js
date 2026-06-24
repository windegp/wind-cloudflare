// lib/fbTrack.js
//
// دالة موحّدة لإرسال أحداث Facebook Pixel عبر /api/fb-track
// (مباشرة لـ Conversions API من السيرفر فقط، بدون fbq() ولا Zaraz).
//
// 🔥 لماذا لا نرسل من fbq() (Browser) لهذه الأحداث:
// كان يحدث Deduplication بين حدث Browser (فقير: بلا content_ids)
// وحدث Server (غني: يحتوي content_ids الصحيحة)، وفيسبوك كان يحتفظ
// بنسخة Browser في بعض عمليات الحساب (مثل Catalogue Match Rate)،
// فتُفقد content_ids من المعادلة فعلياً رغم وصولها للسيرفر بنجاح.
// الحل: الاعتماد على السيرفر فقط لهذه الأحداث (الأغنى والأدق بيانات).
// PageView يبقى عبر fbq() في layout.js (لا يحتوي على arrays، لا مشكلة).

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

// 🔥 حل Race Condition: fbq يحتاج وقتاً (تحميل سكريبت + تنفيذ) لتثبيت
// كوكي _fbp، وقد يُستدعى أول fbTrack() قبل اكتمال هذا التثبيت (خصوصاً
// لأول حدث في الجلسة، مثل ViewContent لصفحة منتج مفتوحة مباشرة).
// هذه الدالة تنتظر ظهور الكوكي بمحاولات سريعة، بحد أقصى MAX_WAIT_MS
// (نصف ثانية) — فترة غير ملحوظة للمستخدم، لكنها تكفي عملياً لتحميل
// fbevents.js وتثبيت الكوكي في الغالبية العظمى من الحالات.
const FBP_POLL_INTERVAL_MS = 50;
const FBP_MAX_WAIT_MS = 500;

function waitForFbp() {
  return new Promise((resolve) => {
    const existing = readCookie("_fbp");
    if (existing) {
      resolve(existing);
      return;
    }
    let elapsed = 0;
    const interval = setInterval(() => {
      const fbp = readCookie("_fbp");
      elapsed += FBP_POLL_INTERVAL_MS;
      if (fbp || elapsed >= FBP_MAX_WAIT_MS) {
        clearInterval(interval);
        resolve(fbp); // قد تكون undefined لو انتهى الوقت بدون نجاح، وهذا مقبول
      }
    }, FBP_POLL_INTERVAL_MS);
  });
}

function generateEventId(eventName) {
  return `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function fbTrack(eventName, data = {}) {
  if (typeof window === "undefined") return;

  const eventId = generateEventId(eventName);
  const externalId = getOrCreateExternalId();
  const fbp = await waitForFbp();
  const fbc = readCookie("_fbc");

  // نرسل الحدث للسيرفر فقط عبر /api/fb-track — المصدر الموثوق الوحيد
  // لـ content_ids الصحيحة وكل بيانات Advanced Matching
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
