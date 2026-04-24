# 🔥 WIND Diagnostics Report — Cache & State Mutation System

> **Date:** April 24, 2026  
> **Stack:** Next.js (App Router) · Firebase Firestore · Cloudflare Pages (Edge Runtime) · KV Cache (`@opennextjs/cloudflare`)  
> **Scope:** Root cause analysis for 3 critical bugs in the unified caching and state mutation system  
> **Constraint:** No code was modified during this investigation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Bug 1: Deleted Reviews Not Updating on Product Card](#2-bug-1-deleted-reviews-not-updating-on-product-card-stuck-cache--30-mins)
3. [Bug 2: Menu Deletion Delayed by 30 Seconds](#3-bug-2-menu-deletion-delayed-by-30-seconds)
4. [Bug 3: Product Likes Logic Broken](#4-bug-3-product-likes-logic-broken)
5. [Cross-Cutting Issues](#5-cross-cutting-issues)
6. [Priority Fix Order](#6-priority-fix-order)

---

## 1. Architecture Overview

### Cache Layers (in order of lookup)

| Layer | Location | TTL | Invalidated by `/api/revalidate`? |
|-------|----------|-----|----------------------------------|
| **1. Next.js Full Route Cache / ISR** | Server-side (Cloudflare) | Revalidation period | `revalidatePath()` — ⚠️ likely broken on CF Edge |
| **2. Cloudflare KV** | `WIND_KV` binding | No expiry (manual delete) | `kvDeleteMany()` — ✅ works |
| **3. SWR Client Cache** | Browser memory | `dedupingInterval` per hook | ❌ Not invalidated programmatically |
| **4. sessionStorage** | Browser (ProductCard stats) | 60-second freshness check | ❌ Not invalidated |
| **5. localStorage** | Browser (wishlist, admin cache) | Manual clear | ❌ Partially handled |

### KV Cache Key Map

| Key | Set by | Consumed by |
|-----|--------|-------------|
| `product_stats_${handle}` | `/api/product-stats` | `ProductCard.js`, `ProductReviews.js` |
| `product_${id}` | `/api/product/[id]`, `products/[id]/page.js` | `ProductView.js` (via `useProduct`), product detail page |
| `homepage_data_v1` | `/api/homepage` | `HomeSectionsMain.js` (SWR) |
| `homepage_reviews_v1` | `/api/homepage-reviews` | `HomeSectionsMain.js` (via `useHomepageReviews`) |
| `site_settings_v1` | `/api/site-settings` | `SettingsContext.js` (SWR → `Navbar.js`) |
| `collection_${slug}` | `/api/collections/[slug]` | Collection pages |

### `/api/revalidate` Type → Key Deletion Map

| `type` | KV Keys Deleted | `revalidatePath` Called |
|--------|----------------|------------------------|
| `homepage` | `homepage_data_v1` | `/` |
| `product` (requires `id`) | `product_${id}`, `homepage_data_v1`, `product_stats_${handle}` (if handle) | `/`, `/products/${handle}` |
| `product_stats` (requires `handle`) | `product_stats_${handle}`, `homepage_data_v1`, `homepage_reviews_v1` | `/`, `/products/${handle}` |
| `collection` (requires `slug`) | `collection_${slug}`, `homepage_data_v1` | `/`, `/collections/${slug}` |
| `site_settings` | `site_settings_v1` | `/` |
| `all` | All keys (via `kv.list()`) | `/` (layout) |

---

## 2. Bug 1: Deleted Reviews Not Updating on Product Card (Stuck Cache > 30 mins)

### Symptom
When a review is deleted from `src/app/admin/reviews/page.js`, the review count on the frontend Product Card does not decrease. Previously it took ~30 seconds; now it is completely stuck (> 30 minutes).

### Data Flow Trace

```
handleDeleteReview(id, productHandle, reviewRating)
  │
  ├─ 1. deleteDoc(doc(db, "Reviews", id))                    → Firebase: review deleted ✅
  ├─ 2. setDoc(statsRef, { totalCount: increment(-1), ... }) → Firebase: stats decremented ✅
  │
  └─ 3. fetch('/api/revalidate', {
           type: 'product_stats',
           id: productId,          ← ❌ BUG: productId is UNDEFINED
           handle: productHandle   ← ✅ correct
         })
         │
         └─ revalidate/route.js → type === 'product_stats' && handle
            │
            ├─ kvDeleteMany([
            │    'product_stats_${handle}',   ← ✅ deleted
            │    'homepage_data_v1',           ← ✅ deleted
            │    'homepage_reviews_v1'        ← ✅ deleted
            │  ])
            ├─ revalidatePath('/')                ← ⚠️ likely no-op on Cloudflare
            └─ revalidatePath('/products/${handle}') ← ⚠️ likely no-op on Cloudflare
```

### Root Causes

#### ❌ RC-1A: `productId` is undefined — `product_${id}` KV key never invalidated

**File:** `src/app/admin/reviews/page.js` **Line 359**

```javascript
const handleDeleteReview = async (id, productHandle, reviewRating) => {
  //                    ↑ id = review ID, NOT product ID
  // ...
  body: JSON.stringify({ 
    type: 'product_stats',
    id: productId,        // ← ❌ UNDEFINED! Not a function parameter
    handle: productHandle // ← ✅ correct
  })
```

The function receives `(id, productHandle, reviewRating)` where `id` is the **review** ID. The variable `productId` does not exist in this scope — it is **undefined**. This means:

- The `id` field in the revalidate payload is `undefined`
- Even if `id` were correctly set to the product ID, the `product_stats` branch **does not include** `product_${id}` in its `keysToDelete` array

**Impact:** The `product_${id}` KV cache entry (which contains the full product object including `reviewsCount` and `rating`) is **never cleared** when a review is deleted. The product detail page and `useProduct` hook both read from this stale cache.

#### ❌ RC-1B: `product_${id}` missing from `product_stats` keysToDelete

**File:** `src/app/api/revalidate/route.js` **Lines 28-32**

```javascript
} else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
    //              ↑ Missing: `product_${id}` ← the product detail cache!
    revalidatePath('/');
    revalidatePath(`/products/${handle}`);
}
```

Compare with the `product` type which **does** include it:

```javascript
} else if (type === 'product' && id) {
    keysToDelete = [`product_${id}`, 'homepage_data_v1'];  // ← includes product_${id}
    if (handle) keysToDelete.push(`product_stats_${handle}`);
```

**Impact:** Even if `id` were correctly passed, the `product_stats` branch ignores it. The product detail page at `/products/${handle}` serves stale product data (including old `reviewsCount`) from the `product_${id}` KV key indefinitely.

#### ⚠️ RC-1C: `revalidatePath` likely no-op on Cloudflare Edge Runtime

**File:** `open-next.config.ts`

```typescript
export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache  ← COMMENTED OUT
});
```

Without R2 incremental cache configured, `revalidatePath()` from `next/cache` has no persistent store to invalidate on Cloudflare Pages. The call **silently succeeds** but does nothing. This means the Next.js Full Route Cache / ISR cache is never purged, and the CDN may serve stale HTML until its own TTL expires.

#### ℹ️ RC-1D: `sessionStorage` in ProductCard adds up to 60s delay

**File:** `src/components/products/ProductCard.js` **Lines 40-48**

```javascript
if (parsed.timestamp && Date.now() - parsed.timestamp < 60000) {
    return;  // ← Skip re-fetch if cache is < 60 seconds old
}
```

This alone would only cause a 60-second delay, not 30+ minutes. But it compounds with RC-1A/1B to extend perceived staleness.

### Data Flow Mismatch Summary

| What the frontend READS | Where it's cached | Is it invalidated? |
|------------------------|-------------------|---------------------|
| Product stats (count/rating) via `/api/product-stats` | KV `product_stats_${handle}` | ✅ Yes — deleted by `product_stats` type |
| Product detail (incl. reviewsCount) via `/api/product/${id}` | KV `product_${id}` | ❌ **NO — never deleted** |
| Product stats in sessionStorage | Browser sessionStorage | ❌ No (60s self-heal only) |
| Homepage product cards via `/api/homepage` | KV `homepage_data_v1` | ✅ Yes — deleted by `product_stats` type |

**The Product Card on the homepage** fetches from `/api/product-stats` (KV `product_stats_${handle}`) which IS invalidated. So homepage cards should update on refresh (after 60s sessionStorage window).

**The Product Detail Page** fetches via `useProduct` → `/api/product/${id}` (KV `product_${id}`) which is **NOT invalidated**. This is the primary source of the "stuck > 30 mins" symptom.

### Actionable Fixes

**Fix 1A — Correct the undefined `productId` in `handleDeleteReview`:**

```javascript
// src/app/admin/reviews/page.js — Line 357-361
// BEFORE (broken):
body: JSON.stringify({ 
  type: 'product_stats',
  id: productId,        // ❌ undefined
  handle: productHandle
})

// AFTER (fixed):
body: JSON.stringify({ 
  type: 'product',
  id: productHandle,     // ✅ Use productHandle as the document ID in products collection
  handle: productHandle
})
```

> **Note:** Switching to `type: 'product'` will trigger the `product` branch which includes `product_${id}` in `keysToDelete`. However, you must verify that the product document ID in Firestore matches `productHandle`. If products use numeric IDs (e.g., `12345`) while handles are slugs (e.g., `wind-scarf`), you need a different approach — see Fix 1B.

**Fix 1B — Add `product_${id}` to the `product_stats` branch:**

```javascript
// src/app/api/revalidate/route.js — Lines 28-32
// BEFORE:
} else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];

// AFTER:
} else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
    if (id) keysToDelete.push(`product_${id}`);  // ✅ Invalidate product detail cache
```

And fix the caller to pass the correct product ID:

```javascript
// src/app/admin/reviews/page.js — Line 357-361
body: JSON.stringify({ 
  type: 'product_stats',
  id: productHandle,     // ✅ Pass the product ID (or handle, depending on your Firestore schema)
  handle: productHandle
})
```

**Fix 1C — Enable R2 Incremental Cache for Cloudflare (recommended):**

```typescript
// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache  // ✅ Enables revalidatePath on Cloudflare
});
```

---

## 3. Bug 2: Menu Deletion Delayed by 30 Seconds

### Symptom
Deleting an item from the menu via `src/app/admin/menu/page.js` takes about 30 seconds to reflect on the frontend, indicating that on-demand revalidation is failing or falling back to time-based revalidation.

### Data Flow Trace

```
Admin saves menu → Firebase updated
  │
  ├─ fetch('/api/revalidate', { type: 'homepage' })
  │    └─ kvDeleteMany(['homepage_data_v1'])  ← ✅ KV cleared
  │    └─ revalidatePath('/')                  ← ⚠️ likely no-op on Cloudflare
  │
  └─ fetch('/api/revalidate', { type: 'site_settings' })
       └─ kvDeleteMany(['site_settings_v1'])  ← ✅ KV cleared
       └─ revalidatePath('/')                  ← ⚠️ likely no-op on Cloudflare

Frontend (visitor) opens/reloads homepage:
  │
  ├─ Navbar.js → useSettings() → SettingsContext SWR
  │    └─ SWR key: 'site-settings'
  │    └─ dedupingInterval: 3600000 (1 HOUR for visitors!)  ← ❌ STALE FOR 1 HOUR
  │    └─ fetch('/api/site-settings') → KV miss → Firebase → fresh data
  │         ↑ But SWR won't re-fetch for 1 hour if already cached in memory
  │
  └─ HomeSectionsMain.js → SWR key: 'homepage/data'
       └─ dedupingInterval: 3600000 (1 HOUR)  ← ❌ STALE FOR 1 HOUR
```

### Root Causes

#### ❌ RC-2A: SWR `dedupingInterval: 3600000` for visitors in SettingsContext

**File:** `src/context/SettingsContext.js` **Line 23**

```javascript
dedupingInterval: isAdmin ? 30000 : 3600000, // 30s for admin, 1 HOUR for visitors
```

The Navbar reads `menuItems` from `activeSettings?.menuItems` which comes from this SWR hook. For **visitors**, SWR will not re-fetch site settings for **1 hour** after the last fetch, even if the KV cache has been invalidated server-side.

The 30-second delay the admin perceives is exactly the `dedupingInterval: 30000` for admin users. For regular visitors, the delay is **up to 1 hour**.

#### ❌ RC-2B: No `mutate()` call after revalidation in menu save

**File:** `src/app/admin/menu/page.js` **Lines 298-314**

```javascript
await Promise.all([
  fetch("/api/revalidate", { /* type: 'homepage' */ }),
  fetch("/api/revalidate", { /* type: 'site_settings' */ })
]);
// ← No mutate() call to update SWR cache in the admin's browser
```

After the KV cache is invalidated, the admin's SWR cache still holds stale data. The `SettingsContext` SWR hook is not told to revalidate. The admin must wait for the `dedupingInterval` (30s) to expire before SWR re-fetches.

#### ⚠️ RC-2C: `revalidatePath('/')` is likely a no-op on Cloudflare

Same as RC-1C — without R2 incremental cache, `revalidatePath` silently does nothing. The Next.js server-side rendered HTML for the homepage is never purged from the CDN/edge cache.

### Data Flow Mismatch Summary

| What the frontend READS | Cache Layer | Invalidated by `/api/revalidate`? |
|------------------------|-------------|-----------------------------------|
| Menu items via `useSettings()` → `/api/site-settings` | KV `site_settings_v1` | ✅ Yes — KV deleted |
| Menu items via `useSettings()` → SWR in-memory | Browser SWR | ❌ **NO — `dedupingInterval: 3600000`** |
| Homepage layout via SWR → `/api/homepage` | KV `homepage_data_v1` | ✅ Yes — KV deleted |
| Homepage layout via SWR → in-memory | Browser SWR | ❌ **NO — `dedupingInterval: 3600000`** |
| Next.js rendered HTML for `/` | Cloudflare CDN / ISR | ❌ **NO — `revalidatePath` is no-op** |

**The KV cache IS correctly invalidated.** The problem is that the **client-side SWR cache** is not notified to re-fetch, and the **server-side CDN cache** is not purged because `revalidatePath` doesn't work.

### Actionable Fixes

**Fix 2A — Call `mutate()` on SWR caches after revalidation:**

```javascript
// src/app/admin/menu/page.js — After the Promise.all revalidation calls
import { mutate } from 'swr';

// After saving menu:
await Promise.all([
  fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: 'homepage' }) }),
  fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: 'site_settings' }) })
]);

// ✅ Force SWR to re-fetch on next render
mutate('site-settings');    // Triggers SettingsContext re-fetch
mutate('homepage/data');    // Triggers HomeSectionsMain re-fetch
```

**Fix 2B — Reduce visitor `dedupingInterval` for site settings:**

```javascript
// src/context/SettingsContext.js — Line 21-24
// BEFORE:
dedupingInterval: isAdmin ? 30000 : 3600000,

// AFTER:
dedupingInterval: isAdmin ? 5000 : 60000,  // 5s admin, 60s visitors (was 1 hour!)
```

**Fix 2C — Enable R2 Incremental Cache (same as Fix 1C):**

This is required to make `revalidatePath` functional on Cloudflare Pages.

---

## 4. Bug 3: Product Likes Logic Broken

### Symptom
The logic for incrementing/decrementing likes for a specific product between the Admin panel and the Product Page is broken — likes neither increase nor decrease correctly.

### Data Flow Trace

```
═══════════════════════════════════════════
 PATH A: ProductView.js (Product Detail Page)
═══════════════════════════════════════════
handleWishlistToggle()
  ├─ Optimistic UI update (realLikesCount ±1)   ← ✅ instant visual
  ├─ localStorage wishlist toggle               ← ✅ persisted locally
  ├─ Debounced 1.5s → updateDoc(productRef, {
  │    likesCount: increment(netChange),         ← ✅ Firebase updated
  │    weeklyLikesCount: increment(netChange)   ← ✅ weekly updated
  │  })
  └─ ❌ NO call to /api/revalidate
       └─ KV `product_${id}` → STALE likesCount forever
       └─ KV `homepage_data_v1` → STALE likesCount forever

═══════════════════════════════════════════
 PATH B: ProductCard.js (Homepage / Collection)
═══════════════════════════════════════════
handleWishlistToggle()
  ├─ localStorage wishlist toggle               ← ✅ persisted locally
  ├─ setIsWishlisted()                          ← ✅ visual toggle
  ├─ updateDoc(productRef, {
  │    likesCount: increment(±1)                ← ✅ Firebase updated
  │  })
  ├─ ❌ NO weeklyLikesCount update
  ├─ ❌ NO call to /api/revalidate
  └─ ❌ NO optimistic likesCount display (ProductCard doesn't show count)

═══════════════════════════════════════════
 PATH C: Admin Reviews Page (handleUpdateLikes)
═══════════════════════════════════════════
handleUpdateLikes(productId)
  ├─ updateDoc(productRef, {
  │    likesCount: newLikes,                    ← ⚠️ ABSOLUTE value (not increment)
  │    weeklyLikesCount: recalculated           ← ✅ weekly recalculated
  │  })
  ├─ Local state update                         ← ✅ admin UI updated
  └─ ❌ NO call to /api/revalidate
       └─ KV `product_${id}` → STALE likesCount forever
```

### Root Causes

#### ❌ RC-3A: Zero cache invalidation for likes mutations

**Three separate mutation points** update `likesCount` in Firebase, but **none** of them call `/api/revalidate`:

| Source | File | Line | Calls `/api/revalidate`? |
|--------|------|------|--------------------------|
| `ProductView.handleWishlistToggle` | `src/app/products/[id]/ProductView.js` | 98-151 | ❌ No |
| `ProductCard.handleWishlistToggle` | `src/components/products/ProductCard.js` | 121-134 | ❌ No |
| `handleUpdateLikes` (admin) | `src/app/admin/reviews/page.js` | 124-169 | ❌ No |

**Impact:** After any like/unlike action, the KV caches `product_${id}` and `homepage_data_v1` remain stale. On the next page load or SWR re-fetch cycle, the old `likesCount` is served from KV, **overwriting** the optimistic UI update.

This is why "likes neither increase nor decrease" — the Firebase write succeeds, but the next read returns the stale KV value, making it appear as if the like never happened.

#### ❌ RC-3B: No `type` handler for likes in `/api/revalidate`

**File:** `src/app/api/revalidate/route.js`

The revalidate route has no `type: 'likes'` or equivalent. The available types are: `homepage`, `product`, `product_stats`, `collection`, `site_settings`, `all`. None of these are semantically appropriate for a likes mutation, and none are called from the like handlers.

#### ❌ RC-3C: Mutation strategy mismatch between Admin and Frontend

| Component | Strategy | Value Written |
|-----------|----------|---------------|
| Admin `handleUpdateLikes` | **Absolute set** | `likesCount: newLikes` (e.g., 50) |
| ProductView `handleWishlistToggle` | **Relative increment** | `likesCount: increment(netChange)` (e.g., +1 or -1) |
| ProductCard `handleWishlistToggle` | **Relative increment** | `likesCount: increment(±1)` |

**Conflict scenario:**
1. Admin sets `likesCount = 50` (absolute)
2. User on ProductView clicks like → Firebase `increment(1)` → `likesCount = 51`
3. User refreshes page → KV `product_${id}` still has `likesCount = 50` (stale) → UI shows 50
4. User clicks unlike → Firebase `increment(-1)` based on displayed count → `likesCount = 49`
5. Net effect: Admin set 50, user liked then unliked, but count is now 49 instead of 50

This mismatch causes drift between the admin's intended value and the actual Firebase value.

#### ❌ RC-3D: `ProductCard.js` doesn't update `weeklyLikesCount`

**File:** `src/components/products/ProductCard.js` **Line 131-132**

```javascript
const productRef = doc(getDb(), "products", id.toString());
await updateDoc(productRef, { likesCount: increment(isCurrentlyWishlisted ? -1 : 1) });
// ← Missing: weeklyLikesCount update and currentWeekId logic
```

Compare with `ProductView.js` which correctly updates both:

```javascript
const updateData = {
  likesCount: increment(netChange),
  likesUpdatedAt: new Date().toISOString()
};
if (product.currentWeekId === currentWeekIdStr) {
  updateData.weeklyLikesCount = increment(netChange);
} else if (netChange > 0) {
  updateData.weeklyLikesCount = 1;
  updateData.currentWeekId = currentWeekIdStr;
}
```

**Impact:** Likes from the homepage ProductCard don't contribute to weekly rankings, causing the "Top Liked This Week" section to be inaccurate.

### Data Flow Mismatch Summary

| What the frontend READS | Cache Layer | Invalidated on like? |
|------------------------|-------------|---------------------|
| `likesCount` via `useProduct` → `/api/product/${id}` | KV `product_${id}` | ❌ **NEVER** |
| `likesCount` via homepage product data → `/api/homepage` | KV `homepage_data_v1` | ❌ **NEVER** |
| `likesCount` in ProductView (initial) | `product.likesCount` from `useProduct` SWR | ❌ Stale on refresh |
| `likesCount` in ProductView (after like) | Local state `realLikesCount` | ✅ Optimistic only — lost on refresh |

### Actionable Fixes

**Fix 3A — Add `type: 'likes'` to `/api/revalidate/route.js`:**

```javascript
// src/app/api/revalidate/route.js — Add after the 'product_stats' branch
} else if (type === 'likes' && id) {
    keysToDelete = [`product_${id}`, 'homepage_data_v1'];
    if (handle) keysToDelete.push(`product_stats_${handle}`);
    revalidatePath('/');
    if (handle) revalidatePath(`/products/${handle}`);
}
```

**Fix 3B — Call `/api/revalidate` from `ProductView.handleWishlistToggle`:**

```javascript
// src/app/products/[id]/ProductView.js — Inside the setTimeout callback, after updateDoc
await updateDoc(productRef, updateData);
pendingActionRef.current = 0;

// ✅ Invalidate KV cache so the next read gets fresh data
try {
  await fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'likes',
      id: product.id,
      handle: product.handle || product.id
    })
  });
} catch (e) {
  console.error("WIND Likes Revalidate Error:", e);
}
```

**Fix 3C — Call `/api/revalidate` from `ProductCard.handleWishlistToggle`:**

```javascript
// src/components/products/ProductCard.js — After updateDoc
try {
  const productRef = doc(getDb(), "products", id.toString());
  await updateDoc(productRef, { 
    likesCount: increment(isCurrentlyWishlisted ? -1 : 1) 
  });
  
  // ✅ Invalidate KV cache
  fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'likes',
      id: id.toString(),
      handle: handle || slug || id.toString()
    })
  }).catch(() => {});
} catch (e) { console.log("Like Update Failed"); }
```

**Fix 3D — Call `/api/revalidate` from admin `handleUpdateLikes`:**

```javascript
// src/app/admin/reviews/page.js — After updateDoc in handleUpdateLikes
await updateDoc(productRef, updateData);

// ✅ Invalidate KV cache
try {
  await fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'likes',
      id: productId,
      handle: productToUpdate.handle || productId
    })
  });
} catch (e) {
  console.error("WIND Likes Revalidate Error:", e);
}
```

**Fix 3E — Add `weeklyLikesCount` logic to `ProductCard.handleWishlistToggle`:**

```javascript
// src/components/products/ProductCard.js — Replace the updateDoc call
const getCurrentWeekString = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
};

// Inside handleWishlistToggle, replace the updateDoc:
const updateData = {
  likesCount: increment(isCurrentlyWishlisted ? -1 : 1),
  likesUpdatedAt: new Date().toISOString()
};
// Note: ProductCard doesn't have access to product.currentWeekId from props
// Consider passing it or fetching it. Minimal fix:
updateData.weeklyLikesCount = increment(isCurrentlyWishlisted ? -1 : 1);

await updateDoc(productRef, updateData);
```

---

## 5. Cross-Cutting Issues

### ⚠️ CCI-1: `revalidatePath` is non-functional on Cloudflare Pages

**Impact:** Affects ALL bugs. Without R2 incremental cache, `revalidatePath()` from `next/cache` has no persistent store to operate on. It silently succeeds but does not purge the Next.js Full Route Cache or ISR cache.

**Fix:** Enable R2 incremental cache in `open-next.config.ts` (see Fix 1C). This requires creating an R2 bucket and binding it in `wrangler.jsonc`.

### ⚠️ CCI-2: SWR caches are never programmatically invalidated

**Impact:** Affects Bugs 1 and 2. After KV cache invalidation, the client-side SWR in-memory cache still holds stale data until its `dedupingInterval` expires. No `mutate()` calls are made after revalidation.

**Fix:** Import `mutate` from `swr` and call it with the relevant SWR keys after each `/api/revalidate` call in admin pages.

### ⚠️ CCI-3: `ProductReviews.js` still sends `secret` in revalidate payload

**File:** `src/components/products/ProductReviews.js` **Line 182**

```javascript
body: JSON.stringify({ 
  secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET,  // ← ❌ Removed from architecture but still sent here
  type: 'product_stats',
  handle: productHandle 
})
```

The `secret` field is no longer checked by `/api/revalidate/route.js` (it was removed during centralization), but this dead code still attempts to read an environment variable that may not exist on the client side (`NEXT_PUBLIC_` prefix required for client access). This is harmless but should be cleaned up.

---

## 6. Priority Fix Order

| Priority | Fix | Bug | Impact | Effort |
|----------|-----|-----|--------|--------|
| 🔴 P0 | Fix 1A + 1B: Add `product_${id}` to `product_stats` invalidation | Bug 1 | Reviews stuck forever | Low |
| 🔴 P0 | Fix 3A + 3B + 3C + 3D: Add `type: 'likes'` and call it from all mutation points | Bug 3 | Likes completely broken | Medium |
| 🟡 P1 | Fix 2A: Add `mutate()` calls after revalidation | Bug 2 | 30s-1hr delay | Low |
| 🟡 P1 | Fix 2B: Reduce visitor `dedupingInterval` | Bug 2 | 1hr staleness | Low |
| 🟢 P2 | Fix 1C / 2C: Enable R2 incremental cache | All | `revalidatePath` no-op | Medium |
| 🟢 P2 | Fix 3E: Add `weeklyLikesCount` to ProductCard | Bug 3 | Inaccurate weekly rankings | Low |
| 🔵 P3 | Clean up dead `secret` in ProductReviews.js | Hygiene | None (dead code) | Trivial |

---

*End of WIND Diagnostics Report — No code was modified during this investigation.*
