// lib/fbTrack.js
//
// دالة موحّدة واحدة لإرسال كل حدث Meta Pixel من نقطة واحدة فقط:
// Dual Fire — تُطلق نفس الحدث عبر Browser Pixel (fbq) و Conversions API
// (عبر /api/fb-track) معاً، بنفس event_id بالضبط.
//
// TikTok has a separate SKU namespace. A small compatibility guard below
// converts a TikTok SKU back to the existing Meta catalog ID only when a
// caller accidentally supplies a TikTok SKU. Existing Meta IDs are untouched.

import { getCatalogId } from "@/lib/catalogId";
import { getTikTokSkuIdForItem } from "@/lib/tiktokCatalogId";

function getOrCreateExternalId() {
  if (typeof window === "undefined") return undefined;
  try {
    let id = localStorage.getItem("wind_external_id");
    if (!id) {
      id = "wind-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("wind_external_id", id);
    }
    return id;
  } catch { return undefined; }
}

function readCookie(name) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const FBP_POLL_INTERVAL_MS = 50;
const FBP_MAX_WAIT_MS = 500;
function waitForFbp() {
  return new Promise((resolve) => {
    const existing = readCookie("_fbp");
    if (existing) { resolve(existing); return; }
    let elapsed = 0;
    const interval = setInterval(() => {
      const fbp = readCookie("_fbp");
      elapsed += FBP_POLL_INTERVAL_MS;
      if (fbp || elapsed >= FBP_MAX_WAIT_MS) {
        clearInterval(interval);
        resolve(fbp);
      }
    }, FBP_POLL_INTERVAL_MS);
  });
}

const FBC_POLL_INTERVAL_MS = 50;
const FBC_MAX_WAIT_MS = 500;
function waitForFbc() {
  return new Promise((resolve) => {
    const existing = readCookie("_fbc");
    if (existing) { resolve(existing); return; }
    let hasFbclid = false;
    try { hasFbclid = new URLSearchParams(window.location.search).has("fbclid"); } catch { hasFbclid = false; }
    if (!hasFbclid) { resolve(undefined); return; }
    let elapsed = 0;
    const interval = setInterval(() => {
      const fbc = readCookie("_fbc");
      elapsed += FBC_POLL_INTERVAL_MS;
      if (fbc || elapsed >= FBC_MAX_WAIT_MS) {
        clearInterval(interval);
        resolve(fbc);
      }
    }, FBC_POLL_INTERVAL_MS);
  });
}

function generateEventId(eventName) {
  return `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Compatibility boundary: Meta remains the owner of getCatalogId(). If a
// TikTok SKU leaks into a Meta event (e.g. a shared checkout call), resolve it
// from the persisted cart snapshot. If no mapping exists, leave the value
// untouched rather than guessing or changing Meta IDs.
function normalizeMetaCatalogIds(data) {
  if (typeof window === "undefined" || !Array.isArray(data?.content_ids)) return data;
  try {
    const saved = JSON.parse(localStorage.getItem("wind_cart") || "[]");
    if (!Array.isArray(saved) || !saved.length) return data;
    const map = new Map();
    for (const item of saved) {
      const handle = item.handle || item.id;
      if (!handle) continue;
      const ttSku = getTikTokSkuIdForItem(item);
      const metaId = getCatalogId(handle, item.selectedColor);
      if (ttSku && metaId) map.set(String(ttSku), String(metaId));
    }
    if (!map.size) return data;
    return { ...data, content_ids: data.content_ids.map(id => map.get(String(id)) || id) };
  } catch {
    return data;
  }
}

const BROWSER_EVENT_PARAM_KEYS = [
  "value", "currency", "content_ids", "content_name", "content_type", "contents", "num_items", "order_id",
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

  const normalizedData = normalizeMetaCatalogIds(data);
  const eventId = normalizedData.event_id || generateEventId(eventName);
  const externalId = getOrCreateExternalId();
  const fbp = await waitForFbp();
  const fbc = await waitForFbc();

  if (typeof window.fbq === "function") {
    try {
      window.fbq("track", eventName, pickBrowserParams(normalizedData), { eventID: eventId });
    } catch (_) {}
  }

  const payload = JSON.stringify({
    event_name: eventName,
    event_id: eventId,
    event_source_url: window.location.href,
    external_id: externalId,
    fbp,
    fbc,
    ...normalizedData,
  });

  const endpoint = "/api/fb-track";
  const blob = new Blob([payload], { type: "application/json" });
  let beaconQueued = false;
  try { beaconQueued = navigator.sendBeacon(endpoint, blob); } catch (_) {}
  if (beaconQueued) return;

  try {
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }).catch(() => {});
  } catch (_) {}
}
