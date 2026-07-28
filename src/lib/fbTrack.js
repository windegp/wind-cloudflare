// lib/fbTrack.js
//
// دالة موحّدة واحدة لإرسال كل حدث Meta Pixel من نقطة واحدة فقط:
// Dual Fire — تُطلق نفس الحدث عبر Browser Pixel (fbq) و Conversions API
// (عبر /api/fb-track) معاً، بنفس event_id بالضبط، فتُدمَج الاثنتان لدى Meta
// كحدث واحد بأعلى جودة مطابقة ممكنة (EMQ) بدل احتسابهما منفصلَين أو
// الاعتماد على قناة واحدة فقط.
//
// Zaraz أُزيل نهائياً من المشروع (Phase 1) — لا يوجد أي Workaround خاص به هنا.

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

// 🔥 نفس منطق waitForFbp أعلاه، لكن لـ _fbc تحديدًا — وشرطي فقط عند وجود
// fbclid في الرابط الحالي (أي: زائر قادم لتوّه من نقرة إعلان Meta). فبدون
// fbclid لا داعي للانتظار إطلاقًا (لا يوجد شيء تتوقع الكوكي أن تحمله).
// بهذا الشرط، لا يتأخر أي حدث لزائر لا يحمل fbclid أصلاً — فقط الحالة
// التي قد تفقد fbc فعليًا بسبب التوقيت (fbevents.js لم يُثبّت الكوكي بعد).
const FBC_POLL_INTERVAL_MS = 50;
const FBC_MAX_WAIT_MS = 500;

function waitForFbc() {
  return new Promise((resolve) => {
    const existing = readCookie("_fbc");
    if (existing) {
      resolve(existing);
      return;
    }
    let hasFbclid = false;
    try {
      hasFbclid = new URLSearchParams(window.location.search).has("fbclid");
    } catch {
      hasFbclid = false;
    }
    if (!hasFbclid) {
      // لا fbclid في الرابط الحالي → لا سبب لانتظار كوكي لن تُنشأ أصلاً
      resolve(undefined);
      return;
    }
    let elapsed = 0;
    const interval = setInterval(() => {
      const fbc = readCookie("_fbc");
      elapsed += FBC_POLL_INTERVAL_MS;
      if (fbc || elapsed >= FBC_MAX_WAIT_MS) {
        clearInterval(interval);
        resolve(fbc); // قد تكون undefined لو انتهى الوقت بدون نجاح، وهذا مقبول
      }
    }, FBC_POLL_INTERVAL_MS);
  });
}

// 🔥 قائمة بيضاء صريحة لِما يُسمح بإرساله لـ fbq() كـ Custom Data في المتصفح.
// نتعمّد عدم تمرير كائن data كاملاً كما هو: بعض الأحداث (خصوصاً Purchase)
// تحمل حقول بيانات عميل (email, phone, ...) مخصّصة فقط لـ Conversions API
// من السيرفر (حيث تُشفَّر Hashing قبل إرسالها لـ Meta) — تمرير هذه الحقول
// كما هي إلى fbq() في المتصفح سيُظهرها Plain Text في custom_data وهو
// استخدام غير صحيح وغير آمن. القناة الصحيحة لبيانات العميل في المتصفح هي
// Advanced Matching (خارج نطاق Phase 1 الحالي، موثّق كتحسين مستقبلي).
const BROWSER_EVENT_PARAM_KEYS = [
  "value",
  "currency",
  "content_ids",
  "content_name",
  "content_type",
  "contents",
  "num_items",
  "order_id",
];

function pickBrowserParams(data) {
  const out = {};
  for (const key of BROWSER_EVENT_PARAM_KEYS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

export async function fbTrack(eventName, data = {}) {
  if (typeof window === "undefined") return;

  const eventId = data.event_id || generateEventId(eventName);
  const externalId = getOrCreateExternalId();
  const fbp = await waitForFbp();
  const fbc = await waitForFbc();

  // ── 1) Browser Pixel — نفس event_id بالضبط، حقول قياسية فقط (Whitelist) ──
  if (typeof window.fbq === "function") {
    try {
      window.fbq("track", eventName, pickBrowserParams(data), { eventID: eventId });
    } catch (_) {
      // fbq قد يكون معطَّلاً (أداة حجب إعلانات مثلاً) — لا يوقف الجزء
      // السيرفري أدناه؛ الـ CAPI يبقى يعمل بشكل مستقل تماماً.
    }
  }

  // ── 2) Conversions API — نفس event_id بالضبط، بيانات كاملة (بما فيها
  // حقول العميل الخام التي سيُشفّرها السيرفر قبل إرسالها لـ Meta) ──
  const payload = JSON.stringify({
    event_name:       eventName,
    event_id:         eventId,
    event_source_url: window.location.href,
    external_id:      externalId,
    fbp,
    fbc,
    ...data,
  });

  const endpoint = "/api/fb-track";
  const blob = new Blob([payload], { type: "application/json" });

  let beaconQueued = false;
  try {
    beaconQueued = navigator.sendBeacon(endpoint, blob);
  } catch (_) { /* sendBeacon غير متاح */ }

  if (beaconQueued) return;

  // Fallback: fetch بدون keepalive (نادر الحدوث — فقط لو sendBeacon فشل)
  try {
    fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    payload,
    }).catch(() => {});
  } catch (_) { /* صامت */ }
}
