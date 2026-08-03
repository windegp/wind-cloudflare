// lib/ttTrack.js
// Independent TikTok tracking layer. TikTok owns its own SKU namespace.

import { getCatalogId } from "@/lib/catalogId";
import { getTikTokSkuIdForItem } from "@/lib/tiktokCatalogId";

function generateTtEventId(eventName) {
  return `tt-${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readCookie(name) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const TTP_POLL_INTERVAL_MS = 50;
const TTP_MAX_WAIT_MS = 500;
function waitForTtp() {
  return new Promise((resolve) => {
    const existing = readCookie("_ttp");
    if (existing) { resolve(existing); return; }
    let hasTtclid = false;
    try { hasTtclid = new URLSearchParams(window.location.search).has("ttclid"); } catch { hasTtclid = false; }
    if (!hasTtclid) { resolve(undefined); return; }
    let elapsed = 0;
    const interval = setInterval(() => {
      const ttp = readCookie("_ttp");
      elapsed += TTP_POLL_INTERVAL_MS;
      if (ttp || elapsed >= TTP_MAX_WAIT_MS) { clearInterval(interval); resolve(ttp); }
    }, TTP_POLL_INTERVAL_MS);
  });
}

function getTtclidFromUrl() {
  if (typeof window === "undefined") return undefined;
  try { return new URLSearchParams(window.location.search).get("ttclid") || undefined; } catch { return undefined; }
}

function getOrCreateTtExternalId() {
  if (typeof window === "undefined") return undefined;
  try {
    let id = localStorage.getItem("wind_tt_external_id");
    if (!id) {
      id = "wind-tt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("wind_tt_external_id", id);
    }
    return id;
  } catch { return undefined; }
}

export function buildTtUserData(formData = {}, fallback = {}) {
  const data = {};
  const add = (key, value) => {
    if (value === undefined || value === null) return;
    const normalized = String(value).trim();
    if (normalized) data[key] = normalized;
  };
  add("email", formData.email || fallback.email);
  add("phone", formData.phone || fallback.phone);
  add("first_name", formData.firstName);
  add("last_name", formData.lastName);
  return data;
}

const ALLOWED_FIELDS = [
  "value", "currency", "content_ids", "content_name", "content_type",
  "num_items", "order_id", "email", "phone", "first_name", "last_name",
];

// Backward-compatible boundary: if an older caller still supplies a Meta
// getCatalogId(), translate it to the exact TikTok sku_id from the cart.
// Canonical TikTok IDs are left unchanged. If no cart mapping exists, do not
// guess; preserve the supplied ID.
function normalizeTikTokCatalogIds(data) {
  if (typeof window === "undefined" || !Array.isArray(data?.content_ids)) return data;
  try {
    const saved = JSON.parse(localStorage.getItem("wind_cart") || "[]");
    if (!Array.isArray(saved) || !saved.length) return data;
    const map = new Map();
    for (const item of saved) {
      const handle = item.handle || item.id;
      if (!handle) continue;
      const metaId = getCatalogId(handle, item.selectedColor);
      const ttSku = getTikTokSkuIdForItem(item);
      if (metaId && ttSku) map.set(String(metaId), String(ttSku));
    }
    if (!map.size) return data;
    return { ...data, content_ids: data.content_ids.map(id => map.get(String(id)) || id) };
  } catch {
    return data;
  }
}

function buildContents(data) {
  const ids = Array.isArray(data.content_ids) ? data.content_ids.filter(Boolean) : [];
  if (!ids.length) return [];
  const perItemQty = ids.length === 1 ? (data.num_items || 1) : 1;
  const perItemPrice = ids.length && typeof data.value === "number" ? Number((data.value / ids.length).toFixed(2)) : undefined;
  return ids.map((id) => ({
    content_id: id,
    content_type: data.content_type || "product",
    content_name: ids.length === 1 ? (data.content_name || "") : "",
    quantity: perItemQty,
    price: perItemPrice,
  }));
}

const TT_EVENT_NAME_MAP = { PageView: "Page" };

export async function ttTrack(eventName, rawData = {}) {
  if (typeof window === "undefined") return;

  const data = normalizeTikTokCatalogIds(Object.fromEntries(
    ALLOWED_FIELDS.filter(key => rawData[key] !== undefined).map(key => [key, rawData[key]])
  ));

  const eventId = eventName === "CompletePayment" && data.order_id
    ? `tt-CompletePayment-${data.order_id}`
    : generateTtEventId(eventName);
  const ttEventName = TT_EVENT_NAME_MAP[eventName] || eventName;
  const ttp = await waitForTtp();
  const ttclid = getTtclidFromUrl();
  const externalId = getOrCreateTtExternalId();

  try {
    if (typeof window.ttq !== "undefined") {
      window.ttq.track(ttEventName, {
        contents: buildContents(data),
        value: data.value,
        currency: data.currency || "EGP",
        content_type: data.content_type || "product",
        order_id: data.order_id,
      }, { event_id: eventId });
    }
  } catch {}

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
    if (navigator.sendBeacon(endpoint, blob)) return;
  } catch {}
  try {
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}
