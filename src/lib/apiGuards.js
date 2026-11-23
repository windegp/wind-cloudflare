import { getClientIP, checkRateLimit, createRateLimitResponse } from "@/lib/rateLimit";

const ALLOWED_HOSTS = new Set(["windeg.com", "www.windeg.com", "windeg.pages.dev"]);

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * True when the request comes from one of our own pages.
 * Browsers always send Origin on POST fetches; Referer is the fallback.
 * Requests with neither header (curl, scripts) are rejected.
 * In development, localhost is accepted.
 */
export function isSameOrigin(request) {
  const requestHost = hostOf(request.url);
  const source = request.headers.get("origin") || request.headers.get("referer") || "";
  const sourceHost = hostOf(source);
  if (!sourceHost) return false;

  if (sourceHost === requestHost) return true;
  if (ALLOWED_HOSTS.has(sourceHost)) return true;
  if (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(sourceHost)) {
    return true;
  }
  return false;
}

/**
 * Rate limit by client IP. Returns a Response when blocked, otherwise null.
 * checkRateLimit fails open when KV is unavailable.
 */
export async function enforceRateLimit(request, type = "DEFAULT") {
  const ip = getClientIP(request);
  const result = await checkRateLimit(ip, type);
  if (!result.allowed) return createRateLimitResponse(result.resetTime);
  return null;
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape a value for safe use in HTML text and attribute values. */
export function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Only http(s) URLs are allowed in email image src attributes. */
export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}
