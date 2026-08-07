// lib/ttTrack.js
//
// طبقة تتبّع TikTok مستقلة تمامًا عن Meta (fbTrack.js). لا تشارك أي:
// event_id، external_id، cookies، أو دوال مع منظومة Meta — فقط نفس الفلسفة
// المعمارية (Dual Fire: Browser Pixel + Events API بنفس event_id الخاص
// بـ TikTok وحده، عبر نقطة استدعاء واحدة موحّدة).
//
// Pixel: TikTok Pixel 07/2026 — D4K5SMBC77U6QK8E5OMG (مُهيَّأ في layout.js فقط).

// 🔥 مولّد event_id مستقل تمامًا عن generateEventId() الموجودة في fbTrack.js —
// لا يُستدعى أي كود من fbTrack.js من هذا الملف إطلاقًا.
function generateTtEventId(eventName) {
  return `tt-${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readCookie(name) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// 🔥 نفس الدرس المُستفاد من waitForFbc() في fbTrack.js (تجنّب فقدان معرّف
// النقرة الإعلانية بسبب توقيت تحميل سكريبت المنصة) — لكن دالة مستقلة تمامًا
// هنا، مبنية لـ TikTok تحديدًا (_ttp بدل _fbc، ttclid بدل fbclid).
const TTP_POLL_INTERVAL_MS = 50;
const TTP_MAX_WAIT_MS = 3000;

function waitForTiktokPixel() {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    if (window.ttq && typeof window.ttq.track === "function") {
      resolve(true);
      return;
    }

    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += TTP_POLL_INTERVAL_MS;

      if (window.ttq && typeof window.ttq.track === "function") {
        clearInterval(interval);
        resolve(true);
        return;
      }

      if (elapsed >= TTP_MAX_WAIT_MS) {
        clearInterval(interval);
        resolve(false);
      }
    }, TTP_POLL_INTERVAL_MS);
  });
}

function waitForTtp() {
  return new Promise((resolve) => {
    const existing = readCookie("_ttp");
    if (existing) {
      resolve(existing);
      return;
    }

    let elapsed = 0;

    const interval = setInterval(() => {
      const ttp = readCookie("_ttp");
      elapsed += TTP_POLL_INTERVAL_MS;

      if (ttp || elapsed >= TTP_MAX_WAIT_MS) {
        clearInterval(interval);
        resolve(ttp);
      }
    }, TTP_POLL_INTERVAL_MS);
  });
}

function getTtclidFromUrl() {
  if (typeof window === "undefined") return undefined;
  try {
    return new URLSearchParams(window.location.search).get("ttclid") || undefined;
  } catch {
    return undefined;
  }
}

// 🔥 معرّف متصفح مجهول خاص بـ TikTok فقط — مفتاح تخزين مستقل تمامًا عن
// wind_external_id الخاص بـ Meta (لا مشاركة قيمة ولا مفتاح). القرار
// المعماري: لا نخلط هوية المنصتين، حتى لو كانت الآلية متشابهة شكليًا.
function getOrCreateTtExternalId() {
  if (typeof window === "undefined") return undefined;
  try {
    let id = localStorage.getItem("wind_tt_external_id");
    if (!id) {
      id = "wind-tt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("wind_tt_external_id", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

// 🔥 بناء بيانات هوية العميل الحقيقية (لحظة توفرها فقط — بلا بيانات مصطنعة)
// خاص بـ TikTok، مستقل تمامًا عن buildCheckoutMetaUserData في metaEventData.js.
// يُعيد قيمًا خامًا (غير مُجزَّأة) — التجزئة SHA-256 تتم في /api/tt-track/route.js
// بنفس فلسفة fbTrack.js (hashing على السيرفر لا على المتصفح).
export function buildTtUserData(formData = {}, fallback = {}) {
  const data = {};
  const add = (key, value) => {
    if (value === undefined || value === null) return;
    const normalized = String(value).trim();
    if (!normalized) return;
    data[key] = normalized;
  };
  add("email", formData.email || fallback.email);
  add("phone", formData.phone || fallback.phone);
  add("first_name", formData.firstName);
  add("last_name", formData.lastName);
  return data;
}

// 🔥 الحقول المسموح بها فقط — نفس فلسفة الـ Whitelist الصريحة في fbTrack.js
// (concept فقط، قائمة مستقلة هنا).
const ALLOWED_FIELDS = [
  "value", "currency", "content_ids", "content_name", "content_type",
  "num_items", "order_id", "email", "phone", "first_name", "last_name",
];

function buildContents(data) {
  const ids = Array.isArray(data.content_ids) ? data.content_ids.filter(Boolean) : [];
  if (ids.length === 0) return [];
  const perItemQty = ids.length === 1 ? (data.num_items || 1) : 1;
  // ⚠️ توزيع تقريبي للسعر عبر العناصر المتعددة — البيانات الحالية المشتركة
  // مع fbTrack() لا تحمل سعرًا منفصلًا لكل عنصر في حالة عربة متعددة
  // المنتجات (نفس القيد الموجود أصلًا في شكل البيانات، لم نخترعه هنا).
  const perItemPrice = ids.length > 0 && typeof data.value === "number"
    ? Number((data.value / ids.length).toFixed(2))
    : undefined;
  return ids.map((id) => ({
    content_id: id,
    content_type: data.content_type || "product",
    content_name: ids.length === 1 ? (data.content_name || "") : "",
    quantity: perItemQty,
    price: perItemPrice,
  }));
}

/**
 * نقطة الاستدعاء الموحّدة الوحيدة لكل أحداث TikTok — Dual Fire (Browser + Events API)
 * بنفس event_id الخاص بـ TikTok وحده.
 *
 * الشكل المقبول لـ `data` هو نفس الشكل المُمرَّر أصلًا لـ fbTrack() في كل نقاط
 * الاستدعاء الحالية (content_ids, content_name, content_type, value, currency,
 * num_items, order_id) — إعادة استخدام لنفس الكائن، وليس لأي كود أو منطق من
 * fbTrack.js نفسه. أي حقل خارج ALLOWED_FIELDS (مثل event_id أو em/ph المُجزَّأة
 * الخاصة بـ Meta) يُتجاهَل عمدًا هنا — TikTok event_id يُولَّد دائمًا محليًا.
 */
// 🔥 اسم WIND الداخلي "PageView" لا يطابق اسم الحدث القياسي لدى TikTok
// ("Page") — هذا التحويل الوحيد المطلوب؛ باقي الأحداث (ViewContent,
// AddToCart, InitiateCheckout, CompletePayment) أسماؤها الداخلية مطابقة
// أصلاً لأسماء TikTok الرسمية، فلا تحتاج أي تحويل.
const TT_EVENT_NAME_MAP = { PageView: "Page" };

export async function ttTrack(eventName, rawData = {}) {
  if (typeof window === "undefined") return;

  const data = {};
  for (const key of ALLOWED_FIELDS) {
    if (rawData[key] !== undefined) data[key] = rawData[key];
  }

  // event_id: لا نقبل أبدًا أي event_id قادم من الخارج (حتى لو كان موجودًا في
  // rawData بسبب مشاركة نفس الكائن مع استدعاء fbTrack المجاور) — TikTok
  // event_id مسؤولية هذا الملف فقط. يُبنى من eventName الأصلي كما هو
  // (بلا تغيير في هذا المنطق إطلاقًا).
  const eventId = eventName === "CompletePayment" && data.order_id
    ? `tt-CompletePayment-${data.order_id}`
    : generateTtEventId(eventName);

  // اسم الحدث الفعلي المُرسَل لـ TikTok (بعد التحويل عند الحاجة فقط) —
  // يُستخدَم حصريًا في نقطتي الإرسال أدناه (Browser + Events API)، وليس في
  // توليد event_id أعلاه.
  const ttEventName = TT_EVENT_NAME_MAP[eventName] || eventName;

    const pixelReadyPromise = waitForTiktokPixel();
const ttpPromise = waitForTtp();

const ttclid = getTtclidFromUrl();
const externalId = getOrCreateTtExternalId();

const pixelReady = await pixelReadyPromise;
const ttp = await ttpPromise;

  // 1) Browser Pixel
if (pixelReady) {
  try {
    if (eventName === "PageView") {
      window.ttq.page();
    } else {
      window.ttq.track(ttEventName, {
  contents: buildContents(data),
  value: data.value,
  currency: data.currency || "EGP",
  content_type: data.content_type || "product",
  order_id: data.order_id,
}, { event_id: eventId });
    }
  } catch (error) {
    console.error("[TikTok Pixel] Browser event failed:", error);
  }
} else {
  console.error("[TikTok Pixel] Pixel was not ready within timeout.");
}

if (eventName === "PageView") {
  window.ttq.page();
}

// 2) Events API (Server-side) — نفس event_id بالضبط
  const payload = {
    event: ttEventName,
    event_id: eventId,
    page_url: window.location.href,
    referrer: document.referrer || undefined,
    ttp,
    ttclid,
    external_id: externalId,
    contents: buildContents(data),
    value: data.value,
    currency: data.currency || "EGP",
    order_id: data.order_id,
    email: data.email,
    phone: data.phone,
    first_name: data.first_name,
    last_name: data.last_name,
  };

  const endpoint = "/api/tt-track";
  const body = JSON.stringify(payload);
  try {
    const blob = new Blob([body], { type: "application/json" });
    const queued = navigator.sendBeacon(endpoint, blob);
    if (queued) return;
  } catch {
    // sendBeacon غير متاح — fallback أدناه
  }
  try {
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // صامت
  }
}
