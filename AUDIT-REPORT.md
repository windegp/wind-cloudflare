# 🔍 WIND Shopping — Full Architecture Audit Report

## 1. Executive Summary

The project has a **solid and functional** caching foundation. KV is correctly used as a shared server-side cache, SWR provides client-side deduplication, and cache invalidation flows are wired from admin actions through `/api/revalidate` to KV deletion + SWR `mutate()`. **The system works well today.**

However, the architecture sits at approximately **55-60% of the target goal**. The main gaps are:

- **`kvSet()` silently drops TTL arguments** — all data cached forever, no expiration
- **`firestoreQuota.js` imports non-existent exports** from `kv-cache.js` — dead code
- **Dual invalidation API routes** doing the same job (`/api/invalidate-*` vs `/api/revalidate`)
- **Client-side SWR fetchers bypass KV** for homepage sections and reviews (direct Firebase reads as fallback)
- **No KV caching for collection products** — every collection page visitor hits Firebase
- **No KV caching for related products** — every product page triggers Firebase reads
- **`useHomepageProductsSections` has `revalidateOnFocus: true`** — re-fetches on tab switch
- **ProductCard makes individual `/api/product-stats` calls** per card instead of batch
- **Session cache (`sessionStorage`) duplicates what KV+SWR already handle**

---

## 2. Current Architecture Map

### Files That Control Reads

| File | Role |
|------|------|
| `src/app/api/homepage/route.js` | KV-first read for homepage layout+hero |
| `src/app/api/homepage-reviews/route.js` | KV-first read for homepage reviews |
| `src/app/api/product/[id]/route.js` | KV-first read for single product |
| `src/app/api/product-stats/route.js` | KV-first read for product stats |
| `src/app/api/site-settings/route.js` | KV-first read for site settings |
| `src/app/products/[id]/page.js` | Server-side: KV→Firebase with `cache()` |
| `src/app/collections/[slug]/page.js` | Server-side: KV→Firebase for category data |
| `src/hooks/useFirestore.js` | Client-side SWR hooks (mixed KV and direct Firebase) |
| `src/components/products/ProductCard.js` | Direct `/api/product-stats` per card |
| `src/components/QuickViewModal.js` | Direct `/api/product-stats` on open |
| `src/components/products/ProductReviews.js` | Direct `/api/product-stats` + Firebase fallback |

### Files That Control Writes

| File | Role |
|------|------|
| `src/app/products/[id]/ProductView.js` | Like toggle (debounced Firebase write) |
| `src/components/products/ProductCard.js` | Like toggle from card |
| `src/components/products/ProductReviews.js` | Review submission (Firebase + KV invalidation) |
| `src/app/admin/products/page.js` | Product CRUD |
| `src/app/admin/products/create/page.js` | Product creation |
| `src/app/admin/reviews/page.js` | Review management, CSV import, likes editing |
| `src/app/admin/home-manager/page.js` | Homepage layout management |
| `src/app/admin/collections/page.js` | Collection CRUD |
| `src/app/admin/menu/page.js` | Navigation menu management |
| `src/context/SettingsContext.js` | Visitor counter increment |

### KV Cache Keys

| Key Pattern | Set By | TTL Used |
|-------------|--------|----------|
| `homepage_data_v1` | `/api/homepage` | ❌ None (forever) |
| `homepage_reviews_v1` | `/api/homepage-reviews` | ❌ None (forever) |
| `product_${id}` | `/api/product/[id]` + `products/[id]/page.js` | ❌ None (forever) |
| `product_stats_${handle}` | `/api/product-stats` | ❌ None (forever) |
| `site_settings_v1` | `/api/site-settings` | ❌ None (forever) |
| `collection_${slug}` | `collections/[slug]/page.js` | ❌ None (forever) |
| `idempotency_${opId}` | `/api/write-ops` | ⚠️ Passed but ignored by kvSet |
| `write_guard_${key}` | `/api/write-ops` | ⚠️ Passed but ignored by kvSet |
| `ratelimit_${type}_${ip}` | `rateLimit.js` | ✅ Uses `expirationTtl` directly on `kv.put` |

### SWR Key Map (Client-Side)

| SWR Key | Fetcher | KV Used? |
|---------|---------|----------|
| `homepage/data` | fetch `/api/homepage` | ✅ Yes |
| `homepage-products-sections` | fetch `/api/homepage` then Firebase fallback | ⚠️ Partial |
| `homepage-reviews` | fetch `/api/homepage-reviews` then Firebase fallback | ⚠️ Partial |
| `product-${id}` | fetch `/api/product/${id}` then Firebase fallback | ⚠️ Partial |
| `site-settings` | fetch `/api/site-settings` | ✅ Yes |
| `settings/siteSettings` | direct `fetchDoc()` Firebase | ❌ No |
| `paginated-products-${slug}-*` | direct Firebase | ❌ No |
| `related-${product.id}` | direct Firebase | ❌ No |
| `reviews-${handle}-*` | direct Firebase | ❌ No |

### Files That Invalidate Cache

| File | Method |
|------|--------|
| `src/app/api/revalidate/route.js` | Central: KV delete + `revalidatePath()` |
| `src/app/api/invalidate-product/route.js` | **Duplicate** of revalidate type=product |
| `src/app/api/invalidate-homepage/route.js` | **Duplicate** of revalidate type=homepage |
| `src/app/api/invalidate-collection/route.js` | **Duplicate** of revalidate type=collection |
| `src/app/api/invalidate-settings/route.js` | **Duplicate** of revalidate type=site_settings |
| `src/app/api/invalidate-stats/route.js` | **Duplicate** of revalidate type=product_stats |
| `src/lib/session-cache.js` | `invalidateProductCache()`, `invalidateHomepageCache()` |

---

## 3. Goal Completion Percentage: ~58%

| Goal Requirement | Status | % |
|-----------------|--------|---|
| Firebase = single source of truth | ✅ Yes | 100% |
| Data fetched from Firebase once when needed | ⚠️ API routes do this, but client hooks often bypass | 60% |
| Stored in KV cache once | ✅ API routes store in KV | 80% |
| Future visitors read from KV | ✅ API routes check KV first | 80% |
| Cache valid until admin/customer update | ❌ KV has no TTL — data lives forever until explicit invalidation | 30% |
| Cache refresh/invalidate on updates | ✅ Admin + customer actions trigger `/api/revalidate` | 85% |
| Save/update logic efficient | ✅ Debounced likes, batch writes, write guards | 95% |

---

## 4. What Already Works Well (MUST PRESERVE)

- **Admin update → KV invalidation → SWR mutate flow**: Admin saves → `/api/revalidate` → KV deleted → `revalidatePath()` → SWR `mutate()`. **Correct and fast.**
- **Like debouncing**: `pendingActionRef` tracks net change, only writes non-zero deltas. **Saves quota.**
- **Product page server-side rendering**: `getProductData()` uses `cache()` + KV→Firebase. **First visitor pays, subsequent get KV hit.**
- **Collection page server-side rendering**: Same KV-first pattern. **Works.**
- **Homepage API route**: KV-first with price enrichment. **Works.**
- **SWR global config**: `revalidateOnFocus: false`, `dedupingInterval: 60000`. **Good defaults.**
- **Admin SWR config**: `revalidateIfStale: false`, `dedupingInterval: 300000`. **Prevents waste.**
- **Write guard + idempotency**: Prevents duplicate submissions. **Works.**
- **Rate limiting**: KV-based per-IP. **Works.**
- **Visitor counter**: `sessionStorage` guard prevents double-counting. **Works.**
- **LiveTracker**: Uses RTDB (free, not Firestore quota). **Smart.**

---

## 5. Contradictions & Structural Problems

### 🔴 P1: `kvSet()` Ignores TTL — All Cached Data Lives Forever

**File**: `src/lib/kv-cache.js:32-41`

`kvSet(key, data)` accepts only 2 parameters but is called with 3 (including TTL) in:
- `src/app/api/write-ops/route.js:51` — `kvSet(kvKey, data, idempotencyTtl / 1000)`
- `src/app/api/write-ops/route.js:106` — `kvSet(kvKey, data, guardTtl)`
- `src/app/api/write-guard-acquire/route.js:39` — `kvSet(kvKey, data, ttl)`
- `src/app/api/idempotency-mark/route.js:23` — `kvSet(kvKey, data, ttlMs / 1000)`
- `src/lib/firestoreQuota.js:304` — `kvSet(cacheKey, result, TTL.ADMIN_MEDIUM)`

**Impact**: Write guards and idempotency records live in KV forever. The `KV_TTL` constants defined in `kv-cache.js` are never used. Over time, KV fills with stale data.

**Risk**: HIGH — KV storage grows unbounded; guard records never auto-expire.

**Fix**: Add `ttl` parameter to `kvSet`, pass it to `kv.put(key, value, { expirationTtl: ttl })`.

### 🔴 P2: `firestoreQuota.js` Imports Non-Existent Exports — Dead Code

**File**: `src/lib/firestoreQuota.js:11`

```js
import { kvGet, kvSet, kvDelete, TTL, kvFirstFetch, CACHE_PRIORITY } from './kv-cache';
```

`TTL`, `kvFirstFetch`, and `CACHE_PRIORITY` **do not exist** in `kv-cache.js`. This means:
- `kvFirstFetchWithLog()` (line 258) will crash at runtime
- `kvFirstFetchCollection()` (line 282) works because it calls `kvGet`/`kvSet` directly
- The entire "KV-first fetch pattern" section is **dead/unreachable code**

**Risk**: MEDIUM — Functions crash if called; quota monitoring doesn't work as designed.

**Fix**: Either implement the missing exports in `kv-cache.js` or remove the dead code from `firestoreQuota.js`.

### 🟡 P3: Dual Invalidation API Routes

Five separate `/api/invalidate-*` routes duplicate what `/api/revalidate` already handles:
- `/api/invalidate-product` = `/api/revalidate` type=product
- `/api/invalidate-homepage` = `/api/revalidate` type=homepage
- `/api/invalidate-collection` = `/api/revalidate` type=collection
- `/api/invalidate-settings` = `/api/revalidate` type=site_settings
- `/api/invalidate-stats` = `/api/revalidate` type=product_stats

Plus three separate write-guard and idempotency routes that are also duplicated by `/api/write-ops`.

**Risk**: LOW — Works but creates maintenance burden and inconsistency risk.

**Fix**: Remove individual routes, use only `/api/revalidate` and `/api/write-ops`.

### 🟡 P4: SWR Fetchers Bypass KV with Direct Firebase Fallbacks

**File**: `src/hooks/useFirestore.js`

- `fetchHomepageProductsSections` (line 89): Falls back to **5-6 direct Firebase queries**
- `fetchHomepageReviews` (line 36): Falls back to **2-3 direct Firebase queries**
- `useProduct` fetcher (line 285): Falls back to direct `getDoc()`
- `useRelatedProducts` (line 309): **Always** reads Firebase — no KV at all
- `usePaginatedProducts` (line 251): **Always** reads Firebase — no KV at all
- `usePaginatedReviews` (line 362): **Always** reads Firebase — no KV at all
- `useSiteSettings` (line 205): **Always** reads Firebase via `fetchDoc` — no KV

**Risk**: MEDIUM — Every page load that misses KV triggers multiple Firebase reads.

**Fix**: Create API routes for related products, collection products, and reviews pagination that use KV-first pattern.

### 🟡 P5: `useHomepageProductsSections` Has `revalidateOnFocus: true`

**File**: `src/hooks/useFirestore.js:245`

Contradicts the global SWR config (`revalidateOnFocus: false`). Every tab switch re-fetches homepage sections.

**Risk**: MEDIUM — Unnecessary Firebase reads on every tab focus.

**Fix**: Change to `revalidateOnFocus: false`.

### 🟡 P6: `useSiteSettings` vs `SettingsContext` — Two Paths for Same Data

- `useSiteSettings()` in `useFirestore.js:205` reads Firebase directly via `fetchDoc`
- `SettingsContext.js` reads via `/api/site-settings` (KV-first)

**Risk**: LOW — Wastes one Firebase read per component using `useSiteSettings`.

**Fix**: Remove `useSiteSettings` hook, use `useSettings()` from context everywhere.

### 🟢 P7: ProductCard Individual Stats Fetch

**File**: `src/components/products/ProductCard.js:69-84`

Each `ProductCard` makes an individual `fetch('/api/product-stats?handle=...')`. On a homepage with 20 cards = 20 API calls (KV serves most, but still 20 HTTP requests).

**Risk**: LOW — KV handles it, but HTTP overhead is wasteful.

**Fix**: Batch stats into homepage API response or create a batch endpoint.

### 🟢 P8: Session Cache Overlaps with KV+SWR

**File**: `src/lib/session-cache.js`

`smartFetch()` is defined but **no component uses it**. The invalidation helpers duplicate what SWR `mutate()` + `/api/revalidate` already handle. The `SESSION_CACHE_KEYS` don't match KV keys.

**Risk**: LOW — Dead code, slight confusion.

**Fix**: Either integrate `smartFetch` into the hooks or remove the unused portions.

---

## 6. Firebase Read Reduction Opportunities

| Current Flow | Firebase Reads | Proposed Flow | Reads After |
|-------------|---------------|---------------|-------------|
| Homepage (first visitor) | 2-3 + price enrichment | Same (KV stores result) | 0 after first |
| Homepage (repeat via KV) | 0 | Same ✅ | 0 |
| Homepage sections fallback | 5-6 | Create KV-cached API route | 0 after first |
| Product page (first) | 1-2 | Same (KV stores result) | 0 after first |
| Product page (repeat) | 0 | Same ✅ | 0 |
| Related products | 1-3 per visit | Create KV-cached API route | 0 after first |
| Collection products | 1 per page | Create KV-cached API route | 0 after first |
| Product stats per card | 0 (KV serves) | Batch into homepage data | 0 + fewer HTTP |
| Reviews pagination | 1 per page | KV-cache first batch | 0 after first |
| Site settings (useSiteSettings) | 1 per mount | Use SettingsContext (KV) | 0 |

**Estimated reduction**: From ~10-15 Firebase reads per full homepage visit → ~3-4 (first visit only), then 0 for subsequent visitors.

---

## 7. File-by-File Findings

### 🔴 Needs Fix

| File | Problem | Risk | Fix |
|------|---------|------|-----|
| `src/lib/kv-cache.js` | `kvSet` ignores TTL param; `KV_TTL` constants unused | HIGH | Add `ttl` param, pass to `kv.put` with `expirationTtl` |
| `src/lib/firestoreQuota.js` | Imports `TTL`, `kvFirstFetch`, `CACHE_PRIORITY` that don't exist | HIGH | Implement missing exports or remove dead code |

### 🟡 Needs Refactor

| File | Problem | Risk | Fix |
|------|---------|------|-----|
| `src/hooks/useFirestore.js` | `useHomepageProductsSections` has `revalidateOnFocus: true` | MEDIUM | Set to `false` |
| `src/hooks/useFirestore.js` | `useRelatedProducts` always hits Firebase | MEDIUM | Create `/api/related-products` with KV |
| `src/hooks/useFirestore.js` | `usePaginatedProducts` always hits Firebase | MEDIUM | Create `/api/collection-products` with KV |
| `src/hooks/useFirestore.js` | `useSiteSettings` bypasses KV | MEDIUM | Remove, use SettingsContext |
| `src/hooks/useFirestore.js` | Fallback fetchers do 5-6 Firebase reads | MEDIUM | Remove fallbacks or add KV caching |
| `src/app/api/invalidate-*` (5 routes) | Duplicate `/api/revalidate` | LOW | Remove, consolidate |
| `src/app/api/write-guard-*` (3 routes) | Duplicate `/api/write-ops` | LOW | Remove, consolidate |
| `src/app/api/idempotency-*` (2 routes) | Duplicate `/api/write-ops` | LOW | Remove, consolidate |
| `src/components/products/ProductCard.js` | Individual stats fetch per card | LOW | Batch stats in homepage data |
| `src/lib/session-cache.js` | `smartFetch` unused; keys don't match KV keys | LOW | Integrate or remove unused parts |

### ✅ Excellent — Should Remain Untouched

| File | Why It's Good |
|------|---------------|
| `src/app/api/revalidate/route.js` | Central, handles all invalidation types correctly |
| `src/app/api/homepage/route.js` | Perfect KV-first pattern with price enrichment |
| `src/app/api/product/[id]/route.js` | Clean KV-first pattern |
| `src/app/api/product-stats/route.js` | Clean KV-first pattern |
| `src/app/api/site-settings/route.js` | KV-first with admin fresh bypass |
| `src/app/api/homepage-reviews/route.js` | Clean KV-first pattern |
| `src/app/products/[id]/page.js` | Server-side KV→Firebase with `cache()` |
| `src/app/collections/[slug]/page.js` | Server-side KV→Firebase |
| `src/app/products/[id]/ProductView.js` | Debounced likes, proper invalidation |
| `src/components/SWRProvider.js` | Good global defaults |
| `src/app/admin/layout.js` | Admin SWR config prevents waste |
| `src/context/SettingsContext.js` | Smart KV-first with admin fresh bypass |
| `src/components/LiveTracker.js` | Uses RTDB (free), not Firestore |
| `src/lib/rateLimit.js` | KV-based, works correctly |
| `src/lib/writeOptimizer.js` | Debounce, NetChangeTracker, WriteGuard all work |
| `src/lib/constants.js` | Clean, centralized |
| `src/lib/apiResponse.js` | Clean, standardized |
| `src/lib/firebase.js` | Singleton pattern, correct |
| `src/lib/firebase-edge.js` | Edge-compatible, correct |

---

## 8. Hidden Waste Detection

| Waste Type | Location | Severity |
|------------|----------|----------|
| TTL silently dropped | `kv-cache.js` kvSet | 🔴 |
| Dead imports crash at runtime | `firestoreQuota.js` | 🔴 |
| 5 duplicate invalidate routes | `src/app/api/invalidate-*` | 🟡 |
| 5 duplicate write-guard/idempotency routes | `src/app/api/write-guard-*`, `idempotency-*` | 🟡 |
| `revalidateOnFocus: true` on homepage sections | `useFirestore.js:245` | 🟡 |
| Direct Firebase for related products | `useFirestore.js:309` | 🟡 |
| Direct Firebase for collection products | `useFirestore.js:251` | 🟡 |
| Direct Firebase for site settings hook | `useFirestore.js:205` | 🟡 |
| 20 individual HTTP requests for stats on homepage | `ProductCard.js` | 🟢 |
| `smartFetch()` never used | `session-cache.js` | 🟢 |
| Session cache keys don't match KV keys | `session-cache.js` vs `kv-cache.js` | 🟢 |
| `KV_TTL` constants defined but never used | `kv-cache.js:4-10` | 🟢 |
| `getVersionedKey()` / `CACHE_VERSION` never used | `firestoreQuota.js:20,409` | 🟢 |
| `useReadTracker` hook uses `useRef` without import | `firestoreQuota.js:380` | 🟢 |

---

## 9. Safe Upgrade Plan (From Current Stable State)

### Phase A: Fix Broken Things (Zero Risk to Working Features)

1. **Add TTL support to `kvSet`** — Add optional `ttl` parameter, pass to `kv.put` with `{ expirationTtl }`. Default to no TTL for backward compatibility.
2. **Fix `firestoreQuota.js` imports** — Either implement `kvFirstFetch`/`TTL`/`CACHE_PRIORITY` in `kv-cache.js` or remove the dead code.
3. **Fix `useHomepageProductsSections` revalidateOnFocus** — Change `true` to `false`.

### Phase B: Remove Duplication (Low Risk)

4. **Remove 5 `/api/invalidate-*` routes** — Already covered by `/api/revalidate`.
5. **Remove 5 `/api/write-guard-*` + `/api/idempotency-*` routes** — Already covered by `/api/write-ops`.
6. **Remove `useSiteSettings` hook** — Use `useSettings()` from context instead.

### Phase C: Add KV Caching for Missing Paths (Medium Risk, High ROI)

7. **Create `/api/related-products` route** — KV-first, key=`related_${productId}`, invalidated when product updates.
8. **Create `/api/collection-products` route** — KV-first, key=`collection_products_${slug}`, invalidated when collection updates.
9. **Remove Firebase fallbacks from SWR fetchers** — If KV API fails, show error instead of burning Firebase reads.

### Phase D: Optimization (Low Risk, Nice-to-Have)

10. **Batch product stats into homepage API response** — Eliminate 20 individual HTTP requests.
11. **Clean up `session-cache.js`** — Remove unused `smartFetch`, align keys with KV.
12. **Clean up `firestoreQuota.js`** — Remove unused `getVersionedKey`, `CACHE_VERSION`, `useReadTracker`.

---

## 10. Highest ROI Fixes First

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| 1 | Add TTL to `kvSet` | Prevents KV bloat, enables auto-expiry | 5 min |
| 2 | Fix `firestoreQuota.js` dead imports | Prevents runtime crashes | 15 min |
| 3 | `revalidateOnFocus: false` on homepage sections | Eliminates tab-switch re-fetches | 1 min |
| 4 | Remove `useSiteSettings` (use context) | Saves 1 Firebase read per use | 5 min |
| 5 | Remove duplicate API routes | Reduces maintenance, prevents inconsistency | 10 min |
| 6 | Create `/api/related-products` with KV | Saves 1-3 Firebase reads per product page | 30 min |
| 7 | Create `/api/collection-products` with KV | Saves 1 Firebase read per collection page | 30 min |
| 8 | Remove Firebase fallbacks from SWR fetchers | Prevents quota burns on KV miss | 15 min |

---

## 11. What Must NOT Be Changed

- **Admin update → `/api/revalidate` → KV delete → SWR mutate flow** — Works perfectly
- **Like debouncing with `pendingActionRef`** — Saves quota effectively
- **Server-side `cache()` wrapper on product/collection pages** — Correct pattern
- **All API routes that already use KV-first pattern** — homepage, product, product-stats, site-settings, homepage-reviews
- **SWR global config in `SWRProvider.js`** — Good defaults
- **Admin SWR config in `admin/layout.js`** — Prevents admin waste
- **WriteGuard + idempotency logic in `writeOptimizer.js`** — Works correctly
- **Rate limiting via KV** — Works correctly
- **LiveTracker using RTDB** — Smart, free, no Firestore quota
- **Visitor counter with sessionStorage guard** — Prevents double-counting
- **Batch write utilities** — Work correctly
- **`ProductView` like + invalidation flow** — Debounced write → Firebase → revalidate → mutate

---

*Report generated from forensic analysis of the current stable codebase. No code was modified during this audit.*
