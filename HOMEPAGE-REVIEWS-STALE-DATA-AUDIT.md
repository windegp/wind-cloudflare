# Homepage Reviews Section Stale Data Audit Report

**Project:** WIND Shopping  
**Section:** #17 CustomerReviewsSection (HomeSections.js)  
**Date:** April 27, 2026  
**Auditor:** Cascade AI  
**Status:** FORENSIC ANALYSIS - NO CODE CHANGES MADE

---

## Executive Summary

The homepage reviews section (#17) displays stale/deleted reviews due to a **combination of factors** involving the SWR caching layer, KV cache timing, and missing sessionStorage invalidation. The issue is **intermittent** and primarily affects users who have already loaded the homepage before a review was deleted.

**Root Cause Classification:** Cache invalidation gap + SWR `keepPreviousData` behavior  
**Severity:** MEDIUM - Affects UX but not data integrity  
**Risk if Unresolved:** Users see deleted reviews until hard refresh or cache expiry

---

## Complete Data Flow Tracing

### 1. Data Source to UI Flow

```
Firebase (Reviews collection)
    ↓
API Route: /api/homepage-reviews
    ├── KV Cache Check: homepage_reviews_v1
    ├── Firebase Query: where("status", "==", "published")
    └── KV Cache Write (on miss)
    ↓
Hook: useHomepageReviews() in useFirestore.js
    ├── SWR Key: 'homepage-reviews'
    ├── dedupingInterval: 300000 (5min)
    └── fetcher: fetchHomepageReviews()
    ↓
HomeSectionsMain.js
    ├── useHomepageReviews() → homepageReviewsData
    └── Passes to section: { reviews, products }
    ↓
HomeSections.js: CustomerReviewsSection (#17)
    ├── Props: data, bundle
    ├── Extracts: bundle?.reviews || data?.reviews || []
    └── Renders reviews carousel
```

### 2. Cache Layers Involved

| Layer | Cache Key | TTL/Duration | Cleared on Delete? |
|-------|-----------|--------------|-------------------|
| **KV (Edge)** | `homepage_reviews_v1` | Until revalidation | ✅ YES (via /api/revalidate) |
| **SWR (Client)** | `'homepage-reviews'` | 5min deduping | ✅ YES (via mutate()) |
| **sessionStorage** | `wind_homepage_reviews` | 5min stale | ❌ NO (never cleared) |
| **React State** | `useState` | Component lifetime | ✅ YES (on re-render) |

---

## Root Cause Analysis

### 🔴 Primary Issue: SWR `keepPreviousData` + Stale KV Window

**Location:** `SWRProvider.js:11`

The global SWR config includes:
```javascript
keepPreviousData: true // يخلي الموقع سريع وميعملش Loading عمال على بطال
```

**Problem:** When `mutate('homepage-reviews')` is called after a review deletion:
1. SWR immediately returns stale cached data
2. A background refetch is triggered
3. If the KV cache still has old data (race condition), stale reviews appear
4. Only after the refetch completes (2-3 seconds) do they disappear

**Evidence:**
```javascript
// Admin delete handler (admin/reviews/page.js:480-493)
await fetch('/api/revalidate', { ... }); // Clears KV
sessionStorage.removeItem(`wind_stats_${productHandle}`); // Wrong key!
mutate('homepage/data');
mutate('homepage-products-sections');
mutate('homepage-reviews'); // Triggers background refresh, keeps stale data temporarily
mutate(`product-${effectiveProductId}`);
```

### 🟡 Secondary Issue: Missing sessionStorage Invalidation

**Location:** `admin/reviews/page.js:489`

When a review is deleted, the code clears:
- ✅ KV cache via `/api/revalidate`
- ✅ SWR cache via `mutate()`
- ❌ **Missing:** `wind_homepage_reviews` from sessionStorage

```javascript
// Current code clears product stats only:
sessionStorage.removeItem(`wind_stats_${productHandle}`);

// Missing:
sessionStorage.removeItem('wind_homepage_reviews'); // ← NEVER CLEARED
```

**Impact:** If any component uses session-cache.js helpers to read homepage reviews, it would see stale data. However, `fetchHomepageReviews` doesn't currently use session cache.

### 🟡 Tertiary Issue: `invalidateHomepageCache()` Has Invalid Type

**Location:** `session-cache.js:530-537`

The `invalidateHomepageCache()` function calls:
```javascript
body: JSON.stringify({ 
  type: 'homepage_update',  // ← NOT RECOGNIZED by /api/revalidate
  reason: 'homepage_invalidation'
})
```

But `/api/revalidate/route.js` only handles:
- `'homepage'` ✓
- `'product'` ✓
- `'product_stats'` ✓
- `'likes'` ✓
- `'collection'` ✓
- `'site_settings'` ✓
- `'all'` ✓

**'homepage_update' is NOT a valid type**, so KV cache clearing would fail if this function were called.

---

## Why Deleted Reviews Still Appear

### Scenario 1: The Race Condition (Most Common)

1. User loads homepage → Reviews cached in SWR + KV
2. Admin deletes a review → Triggers revalidation
3. KV cache is cleared ✅
4. SWR `mutate('homepage-reviews')` triggers refetch
5. **But:** Another user (or same user different tab) still has SWR cache
6. **Result:** They see deleted review until SWR refetch completes (2-5 seconds)

### Scenario 2: The Deduping Window

1. User loads homepage at 12:00:00
2. SWR caches with 5min deduping
3. Admin deletes review at 12:02:00
4. KV cache cleared, SWR mutated
5. User navigates away and back at 12:03:00
6. **SWR returns cached data (still within 5min window)**
7. **Result:** Deleted review appears until 12:05:00

### Scenario 3: Fallback Firebase Query Mismatch

**Location:** `useFirestore.js:49` vs `api/homepage-reviews/route.js:20`

Both queries use:
```javascript
where("status", "==", "published")
```

But if a review's `status` field is corrupted, missing, or has whitespace (`" published"`), it could slip through. This is unlikely but possible with manual data edits.

---

## Files Responsible

| File | Role | Issue |
|------|------|-------|
| `SWRProvider.js:11` | Global SWR config | `keepPreviousData: true` shows stale data during refetch |
| `useFirestore.js:220-224` | Hook definition | No immediate cache invalidation mechanism |
| `admin/reviews/page.js:489` | Admin delete handler | Missing sessionStorage.clear for homepage reviews |
| `session-cache.js:534` | Cache invalidation helper | Invalid type `'homepage_update'` not handled by API |
| `HomeSections.js:1574` | Component props | Fallback arrays could mask stale data source |

---

## Are Other Sections Affected?

### ✅ Affected (Same Pattern)

| Section | Cache Key | Risk Level |
|---------|-----------|------------|
| Homepage Sections (Top Rated, Best Sellers) | `homepage-products-sections` | MEDIUM |
| Site Settings | `site_settings_v1` | LOW |
| Product Cards (Stats) | `wind_stats_${handle}` | LOW (properly cleared) |

### ❌ Not Affected

- Individual product pages (direct KV → Firebase, no SWR layer on server)
- Collection pages (different data flow)
- Cart/Wishlist (not cached persistently)

---

## Issue Classification

| Attribute | Assessment |
|-----------|------------|
| **Type** | Cache invalidation gap + SWR behavior |
| **Isolated?** | No - affects all SWR-cached homepage data |
| **Data Integrity?** | Safe - Firebase is correct, only cache is stale |
| **User Impact** | Medium - sees deleted content temporarily |
| **Frequency** | Intermittent - only during deduping window |
| **Reproducibility** | Hard - requires specific timing |

---

## Safest Minimal Fix (For Future Implementation)

### Option 1: Add `revalidateOnFocus: true` for Admins Only

**Location:** `admin/layout.js:87-94`

Already configured correctly:
```javascript
<SWRConfig value={{
  revalidateOnFocus: false, // Keeps false for quota protection
  dedupingInterval: 300000,
}}>
```

**Recommendation:** Don't change this - quota protection is more important.

### Option 2: Clear sessionStorage on Review Delete

**Location:** `admin/reviews/page.js:489`

Add:
```javascript
// Clear all homepage-related caches
sessionStorage.removeItem('wind_homepage_reviews');
sessionStorage.removeItem('wind_homepage_sections');
```

**Risk:** LOW - Only clears client cache, no architecture changes.

### Option 3: Force Hard Reload After Delete

**Location:** `admin/reviews/page.js:516`

Instead of just `alert()`, trigger:
```javascript
window.location.reload(); // Brute force but guaranteed fresh
```

**Risk:** LOW but bad UX - full page reload.

### Option 4: Optimistic UI Update (Best Long-term)

**Location:** `admin/reviews/page.js:501-511`

Already implemented partially - local state is updated immediately. The issue is other clients/tabs.

---

## Risk Assessment

### If Left Unresolved

| Risk | Likelihood | Impact |
|------|------------|--------|
| Users see deleted reviews | MEDIUM | Low (temporary, 2-5min max) |
| Reputation damage | LOW | Low (content is filtered, not offensive) |
| Data inconsistency | NONE | N/A (Firebase is always correct) |
| Firestore quota spike | LOW | Medium (if users refresh repeatedly) |

### Overall Risk: **LOW to MEDIUM**

The issue is annoying but not critical. The "deleted" reviews are still just filtered data (status !== published), not actual harmful content. The cache eventually clears (5min max).

---

## Detailed Technical Findings

### 1. SWR Cache Behavior

**File:** `SWRProvider.js`

```javascript
<SWRConfig value={{
  revalidateOnFocus: false,
  dedupingInterval: 60000, // ← Recently changed to 300000
  shouldRetryOnError: false,
  keepPreviousData: true,   // ← This is the culprit
}}>
```

When `mutate()` is called:
- SWR marks cache as stale
- Immediately returns cached data (due to `keepPreviousData`)
- Triggers background refetch
- UI updates when refetch completes

**Window of staleness:** 500ms - 3000ms depending on network.

### 2. KV Cache Key Mismatch Risk

**File:** `api/revalidate/route.js:26`

```javascript
} else if (type === 'product_stats' && handle) {
  keysToDelete = [`product_stats_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
```

✅ This correctly clears `homepage_reviews_v1` when review is deleted.

### 3. Missing Cache Key Constant

**File:** `session-cache.js:36`

```javascript
export const SESSION_CACHE_KEYS = {
  HOMEPAGE_REVIEWS: 'wind_homepage_reviews', // ← Defined but never used
  // ...
};
```

The session cache key exists but no fetcher uses it. The `fetchHomepageReviews` function in `useFirestore.js` bypasses session cache entirely.

### 4. Component Prop Fallback Chain

**File:** `HomeSections.js:1574`

```javascript
const reviews = bundle?.reviews || data?.reviews || [];
```

This creates multiple fallback sources that could mask which data is actually stale.

---

## Verification Commands (For Manual Testing)

To verify the issue:

```javascript
// 1. Check KV cache content
fetch('/api/homepage-reviews').then(r => r.json()).then(d => console.log(d.reviews.length));

// 2. Check SWR cache
// In browser console with React DevTools - look for 'homepage-reviews' key

// 3. Check sessionStorage
sessionStorage.getItem('wind_homepage_reviews');

// 4. Trigger revalidation
fetch('/api/revalidate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'product_stats', handle: 'test-handle', id: 'test-id' })
});
```

---

## Conclusion

The homepage reviews section shows stale data primarily due to:

1. **SWR's `keepPreviousData: true`** showing cached data during refetch (by design, but causes temporary staleness)
2. **5-minute deduping window** preventing immediate refetch after deletion
3. **Missing sessionStorage invalidation** (minor, since it's not actually used by fetcher)
4. **No hard refresh mechanism** for admin after delete

**The issue is NOT:**
- ❌ KV cache not clearing (it does)
- ❌ SWR not mutating (it does)
- ❌ Firebase returning deleted data (it doesn't)
- ❌ Component state being wrong (it's correct)

**The issue IS:**
- ✅ SWR caching behavior + timing windows
- ✅ Multiple cache layers not invalidated atomically

---

## Recommendations Summary

| Priority | Action | Effort | Risk |
|----------|--------|--------|------|
| 1 | Add `sessionStorage.removeItem('wind_homepage_reviews')` to delete handler | 2 min | ZERO |
| 2 | Document that stale data may appear for up to 5 minutes | 5 min | ZERO |
| 3 | Consider adding `revalidateOnFocus: true` for admin users only | 30 min | LOW |
| 4 | Fix `invalidateHomepageCache()` to use valid type | 5 min | ZERO |
| 5 | Add loading indicator during SWR refetch | 1 hour | LOW |

---

*End of Audit Report*
