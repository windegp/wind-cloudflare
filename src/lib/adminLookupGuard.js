// حماية بحث دور الموظف (admins/{uid}) من استهلاك الكوتة.
//
// كل نداء أدمن لغير المالك كان يعمل قراءة Firestore REST. هنا:
//   1) كاش قصير (60 ثانية) داخل نفس الـ isolate لنتيجة الحلّ.
//   2) حدّ لعدد القراءات الفعلية (cache miss) لكل IP.
// الذاكرة فقط (لا كتابة على KV) عشان ما نستهلكش كتابات KV اليومية.
// لا نخزّن أبدًا نتيجة "الخدمة غير متاحة" — أخطاء الاتصال تُعاد محاولتها.
// ملاحظة: تعطيل موظف أو تغيير دوره قد يتأخر حتى 60 ثانية.

export const ROLE_CACHE_TTL_MS = 60_000;
export const LOOKUP_LIMIT = 30; // قراءات فعلية لكل IP في النافذة
export const LOOKUP_WINDOW_MS = 60_000;
const MAX_ENTRIES = 500;

const roleCache = new Map();
const lookupCounters = new Map();

function prune(map, now, expiryOf) {
  if (map.size <= MAX_ENTRIES) return;
  for (const [k, v] of map) if (now > expiryOf(v)) map.delete(k);
  if (map.size > MAX_ENTRIES) map.clear();
}

export function getCachedStaffResolution(uid, now = Date.now()) {
  const hit = roleCache.get(uid);
  if (!hit) return null;
  if (now > hit.exp) {
    roleCache.delete(uid);
    return null;
  }
  return hit.value;
}

export function cacheStaffResolution(uid, value, now = Date.now()) {
  prune(roleCache, now, (v) => v.exp);
  roleCache.set(uid, { value, exp: now + ROLE_CACHE_TTL_MS });
}

// true = مسموح بقراءة جديدة.
export function allowStaffLookup(ip, now = Date.now()) {
  const key = ip || "unknown";
  prune(lookupCounters, now, (v) => v.reset);
  let entry = lookupCounters.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + LOOKUP_WINDOW_MS };
  }
  entry.count += 1;
  lookupCounters.set(key, entry);
  return entry.count <= LOOKUP_LIMIT;
}

export function resetAdminLookupGuard() {
  roleCache.clear();
  lookupCounters.clear();
}
