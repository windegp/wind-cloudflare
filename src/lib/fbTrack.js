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

// 🔥 Dedup #1 — PageView: نفس الـ event_id بين Browser (fbq) و أول نداء Server.
// layout.js يولّد event_id واحد لأول PageView في الجلسة، ويخزّنه هنا مؤقتاً.
// عند أول استدعاء fbTrack("PageView", ...) في نفس الجلسة، نستخدم نفس الـ ID
// (فتتطابق نسخة Browser ونسخة Server لدى Meta ولا تُحتسب مرتين)، ثم نمسحه
// فوراً — أي تنقل لاحق بين الصفحات (route change) يولّد ID مستقل خاص به،
// لأنه لا يقابله حدث Browser آخر أصلاً (fbq يعمل مرة واحدة فقط لكل جلسة).
function consumeInitialPageViewId() {
  if (typeof window === "undefined") return undefined;
  const id = window.__fbInitialPageViewId;
  if (id) delete window.__fbInitialPageViewId;
  return id;
}

// 🔥 Dedup #2 — حارس عام قصير المدى ضد التكرار الفعلي لنفس الحدث
// (مثال: نقرة مزدوجة سريعة على نفس الزر قبل تفعيل disabled). يقارن
// (eventName + content_ids) خلال نافذة قصيرة فقط، ولا يمنع نفس الحدث لاحقاً
// بشكل شرعي (مثال: إضافة نفس المنتج للسلة مرتين بفارق دقائق).
const recentSends = new Map();
const DEDUP_WINDOW_MS = 1500;

function isLikelyDuplicate(eventName, data) {
  // 🔥 لازم نضم المسار الحالي للمفتاح — أحداث PageView لا تحمل content_ids
  // إطلاقاً، فبدون هذا كانت أي تنقلات سريعة بين صفحتين مختلفتين خلال
  // النافذة الزمنية ستُعتبر خطأً "نفس الحدث" وتُحذف الصفحة الثانية فعلياً.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const key = `${eventName}:${path}:${JSON.stringify(data.content_ids || [])}:${data.order_id || ""}`;
  const now = Date.now();
  const last = recentSends.get(key);
  recentSends.set(key, now);
  // تنظيف دوري بسيط لمنع تراكم الذاكرة
  if (recentSends.size > 50) {
    for (const [k, t] of recentSends) {
      if (now - t > DEDUP_WINDOW_MS) recentSends.delete(k);
    }
  }
  return last !== undefined && now - last < DEDUP_WINDOW_MS;
}

export async function fbTrack(eventName, data = {}) {
  if (typeof window === "undefined") return;

  if (isLikelyDuplicate(eventName, data)) {
    console.warn(`[fbTrack] Suppressed likely duplicate fire: ${eventName}`);
    return;
  }

  const eventId =
    data.event_id ||
    (eventName === "PageView" && consumeInitialPageViewId()) ||
    generateEventId(eventName);
  const externalId = getOrCreateExternalId();
  const fbp = await waitForFbp();
  const fbc = readCookie("_fbc");

  const payload = JSON.stringify({
    event_name:       eventName,
    event_id:         eventId,
    event_source_url: window.location.href,
    external_id:      externalId,
    fbp,
    fbc,
    ...data,
  });

  // ── sendBeacon أولاً: لا يُعترَض من Zaraz (على خلاف window.fetch)،
  // ويُكمل الإرسال بعد مغادرة الصفحة (مثل keepalive تماماً).
  // كان fetch+keepalive يتعطل بصمت بسبب Zaraz's fetch wrapper.
  const endpoint = "/api/fb-track";
  const blob = new Blob([payload], { type: "application/json" });

  try {
    if (navigator.sendBeacon(endpoint, blob)) return;
  } catch (_) { /* sendBeacon غير متاح */ }

  // Fallback: fetch بدون keepalive
  try {
    fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    payload,
    }).catch(() => {});
  } catch (_) { /* صامت */ }
}
