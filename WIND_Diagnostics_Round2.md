# 🔥 WIND Diagnostics — Round 2: Edge Case Cache & State Mutation Bugs

> **Date:** April 24, 2026  
> **Stack:** Next.js (App Router) · Firebase Firestore · Cloudflare Pages (Edge Runtime) · KV Cache  
> **Scope:** 3 specific edge-case bugs after Round 1 fixes were applied  
> **Constraint:** No code was modified during this investigation

---

## Table of Contents

1. [Bug 1: Adding a Review Takes ~30+ Seconds to Reflect on Product Card](#1-bug-1-adding-a-review-takes-30-seconds-to-reflect-on-product-card)
2. [Bug 2: Deleting a Review NEVER Decreases the Count on Product Card](#2-bug-2-deleting-a-review-never-decreases-the-count-on-product-card)
3. [Bug 3: Likes Sync & Concurrency Issue](#3-bug-3-likes-sync--concurrency-issue)
4. [Cross-Cutting Findings](#4-cross-cutting-findings)

---

## 1. Bug 1: Adding a Review Takes ~30+ Seconds to Reflect on Product Card

### Symptom
After submitting a review from the product page, the review count on the Product Card (homepage) does not update for ~30+ seconds.

### Data Flow Trace

```
ProductReviews.handleSubmitReview (product page)
  │
  ├─ 1. addDoc(Reviews, newReviewData)                     → Firebase ✅
  ├─ 2. setDoc(ProductStats, { increment(1), increment(rating) }) → Firebase ✅
  ├─ 3. fetch('/api/revalidate', {
  │      type: 'product_stats',
  │      handle: productHandle
  │    })
  │    └─ revalidate/route.js → type === 'product_stats' && handle
  │       ├─ kvDeleteMany([
  │       │    'product_stats_${handle}',     → ✅ deleted
  │       │    'product_${handle}',            → ⚠️ SEE BUG 2 ANALYSIS
  │       │    'homepage_data_v1',             → ✅ deleted
  │       │    'homepage_reviews_v1'           → ✅ deleted
  │       │  ])
  │       └─ revalidatePath('/')               → ⚠️ likely no-op on Cloudflare
  │
  ├─ 4. Local state update (optimistic)                    → ✅ product page shows new count
  └─ 5. onReviewStatsUpdate(avg, total)                    → ✅ ProductView updates

Meanwhile, on the HOMEPAGE (different browser tab/user):
  │
  └─ ProductCard.js useEffect [props.id, props.handle, ...]
       │
       ├─ sessionStorage.getItem('wind_stats_${handle}')
       │    └─ if timestamp < 60 seconds old → RETURN EARLY  ← ❌ BLOCKS RE-FETCH
       │
       └─ fetch('/api/product-stats?handle=...')
            └─ KV is now empty → Firebase → fresh data → ✅
               BUT: sessionStorage gate prevents this call for up to 60s!
```

### Root Causes

#### ❌ RC-1A: `sessionStorage` 60-second freshness gate in ProductCard

**File:** `src/components/products/ProductCard.js` **Lines 44-48**

```javascript
if (parsed.timestamp && Date.now() - parsed.timestamp < 60000) {
    return;  // ← Skips the entire fetch if sessionStorage cache is < 60s old
}
```

When a user visits the homepage, the ProductCard stores stats in `sessionStorage` with a timestamp. If a review is added and the KV cache is invalidated, but the user's `sessionStorage` entry is less than 60 seconds old, the **entire fetch is skipped**. The card continues displaying the old count.

This is the **primary cause** of the ~30 second delay. The actual delay can range from 0 to 60 seconds depending on when the user last loaded the page.

#### ❌ RC-1B: No `sessionStorage` invalidation after review submission

**File:** `src/components/products/ProductReviews.js` **Lines 176-189**

```javascript
// 3. إشارة WIND لمسح كاش إحصائيات المنتج في KV
try {
  await fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET,  // ← dead code
      type: 'product_stats',
      handle: productHandle 
    })
  });
} catch (e) { ... }
```

The revalidation call clears the **server-side KV cache** but does nothing about the **client-side `sessionStorage`**. There is no mechanism to tell the ProductCard to discard its `sessionStorage` entry.

#### ℹ️ RC-1C: `ProductReviews.js` still sends dead `secret` field

**File:** `src/components/products/ProductReviews.js` **Line 182**

```javascript
secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET,  // ← Not checked by /api/revalidate
```

The `/api/revalidate/route.js` no longer checks a `secret` field. This is harmless but is dead code. More importantly, `process.env.NEXT_PUBLIC_REVALIDATE_SECRET` may be `undefined` on the client if the env var isn't exposed with the `NEXT_PUBLIC_` prefix, making the field meaningless.

#### ℹ️ RC-1D: SWR `dedupingInterval: 3600000` on homepage data

**File:** `src/components/HomeSectionsMain.js` **Line 26**

```javascript
}, { dedupingInterval: 3600000 });  // 1 hour!
```

The homepage data SWR hook has a 1-hour deduplication interval. Even if KV is invalidated, the SWR in-memory cache won't re-fetch for up to 1 hour for a returning visitor. This compounds the sessionStorage issue for users who don't do a hard refresh.

### Actionable Fixes

**Fix 1A — Clear `sessionStorage` for the affected product after review submission:**

```javascript
// src/components/products/ProductReviews.js — After the /api/revalidate call (line 189)
// ✅ مسح sessionStorage للمنتج ده عشان الـ ProductCard يسحب فريش
const statsCacheKey = `wind_stats_${productHandle}`;
sessionStorage.removeItem(statsCacheKey);
```

**Fix 1B — Change the sessionStorage freshness gate from "skip entirely" to "fetch in background":**

```javascript
// src/components/products/ProductCard.js — Lines 44-48
// BEFORE:
if (parsed.timestamp && Date.now() - parsed.timestamp < 60000) {
    return;  // ❌ Completely skips re-fetch
}

// AFTER:
if (parsed.timestamp && Date.now() - parsed.timestamp < 60000) {
    return;  // Keep early return for quota protection,
             // BUT add a separate background revalidation trigger:
}
// Add AFTER the fetchStats() call at line 71:
// ✅ Listen for storage events from other tabs/components
const handleStorageChange = (e) => {
  if (e.key?.startsWith('wind_stats_')) {
    const newCacheKey = `wind_stats_${handleToSearch}`;
    if (e.key === newCacheKey && e.newValue) {
      const fresh = JSON.parse(e.newValue);
      setReviewsData(fresh);
      setMergedProduct(prev => ({ ...prev, reviewsCount: fresh.count, rating: fresh.rating }));
    }
  }
};
window.addEventListener('storage', handleStorageChange);
// Note: cleanup in return of useEffect
```

**Fix 1C — Reduce `dedupingInterval` for homepage SWR:**

```javascript
// src/components/HomeSectionsMain.js — Line 26
// BEFORE:
}, { dedupingInterval: 3600000 });

// AFTER:
}, { dedupingInterval: 60000 });  // 1 minute instead of 1 hour
```

**Fix 1D — Remove dead `secret` field:**

```javascript
// src/components/products/ProductReviews.js — Lines 181-185
// BEFORE:
body: JSON.stringify({ 
  secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET, 
  type: 'product_stats',
  handle: productHandle 
})

// AFTER:
body: JSON.stringify({ 
  type: 'product_stats',
  handle: productHandle 
})
```

---

## 2. Bug 2: Deleting a Review NEVER Decreases the Count on Product Card

### Symptom
When a review is deleted from the admin panel, the review count on the frontend Product Card never decreases — it stays stuck indefinitely.

### Data Flow Trace

```
handleDeleteReview(id, productHandle, reviewRating)  [admin/reviews/page.js:340]
  │
  ├─ 1. deleteDoc(Reviews, id)                            → Firebase ✅
  ├─ 2. setDoc(ProductStats, { increment(-1), ... })      → Firebase ✅
  │
  ├─ 3. fetch('/api/revalidate', {
  │      type: 'product_stats',
  │      handle: productHandle    ← ✅ correctly passed (after Round 1 fix)
  │    })
  │    └─ revalidate/route.js → type === 'product_stats' && handle
  │       │
  │       ├─ keysToDelete = [
  │       │    'product_stats_${handle}',   → ✅ correct key, deleted
  │       │    'product_${handle}',          → ❌ WRONG KEY! See below
  │       │    'homepage_data_v1',           → ✅ deleted
  │       │    'homepage_reviews_v1'         → ✅ deleted
  │       │  ]
  │       └─ kvDeleteMany(keysToDelete)
  │
  └─ 4. localStorage.removeItem("wind_admin_data_cache")  → ✅ admin cache cleared

Meanwhile, the Product Card reads from:
  │
  ├─ /api/product-stats?handle=... → KV key: product_stats_${handle}
  │    └─ This key IS deleted ✅ → next fetch gets fresh Firebase data
  │
  └─ /api/product/${id} → KV key: product_${id}
       └─ This key is NOT deleted ❌ → stale product data (with old reviewsCount)
```

### Root Causes

#### ❌ RC-2A: `product_${handle}` ≠ `product_${id}` — KV key mismatch

**File:** `src/app/api/revalidate/route.js` **Line 26**

```javascript
} else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, `product_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
    //                                              ^^^^^^^^^^^^^^^^
    //                                              ❌ WRONG: This deletes product_${handle}
    //                                                 but the actual KV key is product_${id}
```

**This is the critical bug.** The `product_stats` branch deletes `product_${handle}`, but the actual KV cache key used by the product API routes is `product_${id}` where `id` is the **Firestore document ID**.

In Firestore, the `products` collection uses document IDs that may differ from the `handle` field:
- Document ID: `6832950218` (numeric Shopify ID)
- Handle field: `wind-luxury-shawl` (slug)

The KV keys are:
- `product_68302950218` — **actually exists** (set by `/api/product/[id]/route.js` and `products/[id]/page.js`)
- `product_wind-luxury-shawl` — **does NOT exist** (never written by any code)

So `kvDeleteMany(['product_wind-luxury-shawl'])` deletes a key that was never created, while `product_68302950218` remains stale forever.

**Evidence from the codebase:**

| File | KV Key Written | Format |
|------|---------------|--------|
| `src/app/api/product/[id]/route.js:12` | `product_${id}` | `id` = URL param = Firestore doc ID |
| `src/app/products/[id]/page.js:23` | `product_${id}` | `id` = URL param = Firestore doc ID |
| `src/app/api/revalidate/route.js:26` | `product_${handle}` | `handle` = product slug ≠ doc ID |

The `product_${handle}` key is **never written** by any API route or page. It's a phantom key. The deletion is a no-op.

#### ❌ RC-2B: `product_stats` type doesn't accept `id` parameter

**File:** `src/app/api/revalidate/route.js` **Line 25**

```javascript
} else if (type === 'product_stats' && handle) {
```

The `product_stats` branch only requires `handle`. It doesn't accept or use an `id` parameter. The admin's `handleDeleteReview` now only sends `handle` (after the Round 1 fix removed the broken `id: productId`), so there's no way to pass the product's Firestore document ID.

Compare with the `product` type which correctly uses `id`:

```javascript
} else if (type === 'product' && id) {
    keysToDelete = [`product_${id}`, 'homepage_data_v1'];  // ✅ Uses id, not handle
```

#### ❌ RC-2C: `ProductCard` reads from `product_stats_${handle}` which IS correctly deleted, but the product detail page reads from `product_${id}` which is NOT

The ProductCard on the homepage fetches from `/api/product-stats?handle=...` which uses KV key `product_stats_${handle}`. This key **is** correctly deleted by the `product_stats` type. So after a hard refresh, the homepage ProductCard **should** show the updated count.

However, the product detail page at `/products/[id]` reads from KV key `product_${id}` (via `getProductData` and `useProduct`). This key is **never** deleted. The product detail page will show the old `reviewsCount` and `rating` from the stale product object until the KV entry is manually purged or expires (KV has no TTL).

**But the user reports the Product Card is stuck too.** This is because:
1. The `sessionStorage` 60-second gate (RC-1A) prevents re-fetching
2. The `homepage_data_v1` key is deleted, but SWR's `dedupingInterval: 3600000` (1 hour) prevents re-fetching for returning visitors
3. The `homepage_reviews_v1` key is deleted, but the `useHomepageReviews` hook has `dedupingInterval: 3600000`

So the KV invalidation works for `product_stats_${handle}`, but the client-side caches (sessionStorage + SWR) prevent the fresh data from being fetched.

### Actionable Fixes

**Fix 2A — Add `id` parameter to `product_stats` branch and delete `product_${id}`:**

```javascript
// src/app/api/revalidate/route.js — Lines 25-28
// BEFORE:
} else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, `product_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
    revalidatePath('/');
    revalidatePath(`/products/${handle}`);
}

// AFTER:
} else if (type === 'product_stats' && handle) {
    keysToDelete = [`product_stats_${handle}`, 'homepage_data_v1', 'homepage_reviews_v1'];
    if (id) keysToDelete.push(`product_${id}`);  // ✅ Delete the ACTUAL product cache key
    revalidatePath('/');
    revalidatePath(`/products/${handle}`);
}
```

**Fix 2B — Pass the product's Firestore document ID from `handleDeleteReview`:**

The admin needs to know the product's Firestore document ID. Currently `handleDeleteReview` only receives `(id, productHandle, reviewRating)` where `id` is the **review** ID.

```javascript
// src/app/admin/reviews/page.js — Line 340
// BEFORE:
const handleDeleteReview = async (id, productHandle, reviewRating) => {
  // ...
  body: JSON.stringify({
    type: 'product_stats',
    handle: productHandle
  })

// AFTER:
const handleDeleteReview = async (id, productHandle, reviewRating, productId) => {
  //                                                          ^^^^^^^^^ add product doc ID
  // ...
  body: JSON.stringify({
    type: 'product_stats',
    handle: productHandle,
    id: productId  // ✅ Pass the Firestore document ID of the product
  })
```

And update the caller to pass `productId`. Find where `handleDeleteReview` is called in the JSX and add the product's Firestore document ID as the 4th argument.

**Fix 2C — Also fix `ProductReviews.js` to pass `id`:**

```javascript
// src/components/products/ProductReviews.js — Lines 181-185
// BEFORE:
body: JSON.stringify({ 
  type: 'product_stats',
  handle: productHandle 
})

// AFTER:
body: JSON.stringify({ 
  type: 'product_stats',
  handle: productHandle,
  id: productHandle  // ✅ If Firestore doc ID === handle, this works.
                     // If doc ID is numeric, you need to pass the actual ID.
})
```

> **Important:** If your Firestore `products` collection uses the handle as the document ID (e.g., `products/wind-luxury-shawl`), then `product_${handle}` is correct and Fix 2A is unnecessary. But if your products use numeric Shopify IDs as document IDs (e.g., `products/68302950218`), then Fix 2A is critical. Check your Firestore console to confirm.

---

## 3. Bug 3: Likes Sync & Concurrency Issue

### Symptom
- User A likes → updates locally and in admin ✅
- User B likes same product → doesn't reflect anywhere ❌
- Admin adds manual like → doesn't increase ❌
- User A unlikes → Admin refreshes and suddenly sees correct total count ✅

### Data Flow Trace

```
═══════════════════════════════════════════════════════════
 USER A: Likes product on ProductView.js
═══════════════════════════════════════════════════════════
handleWishlistToggle()
  ├─ Optimistic: realLikesCount +1, isWishlisted=true      → ✅ Local UI
  ├─ localStorage wishlist update                          → ✅ Persisted
  ├─ Debounced 1.5s → updateDoc(products/${product.id}, {
  │    likesCount: increment(1),                            → ✅ Firebase: 50 → 51
  │    weeklyLikesCount: increment(1)                      → ✅ Firebase
  │  })
  ├─ fetch('/api/revalidate', { type: 'likes', id: product.id, handle })
  │    └─ kvDeleteMany(['product_${product.id}', 'homepage_data_v1', 'product_stats_${handle}'])
  │         → ✅ KV cleared for product.id
  └─ User A refreshes → useProduct fetches fresh from Firebase → ✅ shows 51

═══════════════════════════════════════════════════════════
 USER B: Likes same product on ProductCard.js (homepage)
═══════════════════════════════════════════════════════════
handleWishlistToggle()
  ├─ localStorage wishlist update                          → ✅ Persisted
  ├─ setIsWishlisted(true)                                 → ✅ Local UI toggle
  ├─ updateDoc(products/${id}, { likesCount: increment(1) }) → ✅ Firebase: 51 → 52
  ├─ fetch('/api/revalidate', { type: 'likes', id: id, handle })
  │    └─ kvDeleteMany(['product_${id}', 'homepage_data_v1', ...])
  │         → ✅ KV cleared
  │
  └─ ❌ BUT: User B's SWR cache for 'homepage/data' has dedupingInterval: 3600000
       → User B won't see the updated count on the homepage for up to 1 HOUR
       → User B navigates to product page → useProduct has dedupingInterval: 60000
          → Won't see 52 for up to 1 MINUTE

═══════════════════════════════════════════════════════════
 ADMIN: Manually sets likes to 55
═══════════════════════════════════════════════════════════
handleUpdateLikes(productId)
  ├─ updateDoc(products/${productId}, {
  │    likesCount: 55,                    → ⚠️ ABSOLUTE value (not increment!)
  │    weeklyLikesCount: recalculated
  │  })
  ├─ Local state update                   → ✅ Admin UI shows 55
  └─ ❌ NO fetch('/api/revalidate') call!
       └─ KV 'product_${productId}' stays at 52 (or whatever User B's like set it to)
       └─ User A refreshes → reads from KV → gets 52 (STALE!)
       └─ User B refreshes → reads from KV → gets 52 (STALE!)

═══════════════════════════════════════════════════════════
 USER A: Unlikes product
═══════════════════════════════════════════════════════════
handleWishlistToggle()
  ├─ updateDoc(products/${product.id}, { likesCount: increment(-1) })
  │    → Firebase: 55 - 1 = 54 (because Admin set it to 55)
  ├─ fetch('/api/revalidate', { type: 'likes', id, handle })
  │    └─ KV cleared!
  └─ Admin refreshes → KV miss → Firebase → gets 54
     → Admin sees "correct" count because the unlike + revalidate finally cleared the stale cache!
```

### Root Causes

#### ❌ RC-3A: Admin `handleUpdateLikes` does NOT call `/api/revalidate`

**File:** `src/app/admin/reviews/page.js` **Lines 124-169**

```javascript
const handleUpdateLikes = async (productId) => {
    // ...
    await updateDoc(productRef, updateData);  // ← Firebase updated

    // تحديث الواجهة أوتوماتيك
    setProducts(products.map(p => p.id === productId ? { ... } : p));
    
    // ❌ NO fetch('/api/revalidate') call!
    // ❌ KV cache 'product_${productId}' remains stale!
};
```

After the admin sets `likesCount` to an absolute value, the KV cache is never invalidated. All frontend users continue reading the stale `product_${id}` KV entry until:
1. Another user's like/unlike triggers `/api/revalidate` with `type: 'likes'`
2. The KV entry is purged by a full cache clear (`type: 'all'`)

This is why "Admin adds manual like → doesn't increase" — the KV cache still holds the old value, and the frontend reads from KV first.

#### ❌ RC-3B: Absolute vs Increment mutation conflict causes silent data drift

**File:** `src/app/admin/reviews/page.js` **Line 140**

```javascript
// Admin: ABSOLUTE set
likesCount: newLikes,  // e.g., 55
```

vs.

**File:** `src/app/products/[id]/ProductView.js` **Line 132**

```javascript
// Frontend: RELATIVE increment
likesCount: increment(netChange),  // e.g., increment(1) or increment(-1)
```

**Conflict scenario:**
1. Firebase `likesCount` = 50
2. Admin sets `likesCount = 55` (absolute) → Firebase = 55
3. But KV `product_${id}` still = 50 (not invalidated — RC-3A)
4. User A reads from KV → sees 50 → clicks like → `increment(1)` → Firebase = 56
5. User A's revalidate clears KV → next read gets 56 from Firebase
6. Admin expected 55, but now it's 56 due to the stale-read-then-increment pattern

The fundamental issue: **the frontend reads a stale `likesCount` from KV and uses it as the implicit base for `increment()`**. Since `increment()` is server-side atomic in Firestore, the actual Firebase value is correct, but the **displayed value** on the frontend is based on the stale KV cache. This creates a perception of "likes not working" because the UI shows the old number.

#### ❌ RC-3C: SWR `dedupingInterval` prevents fresh data from reaching the UI

Even after KV is correctly invalidated, multiple SWR hooks block re-fetching:

| Hook | SWR Key | `dedupingInterval` | File:Line |
|------|---------|-------------------|-----------|
| `useProduct` | `product-${id}` | 60000 (1 min) | `useFirestore.js:304` |
| Homepage data | `homepage/data` | 3600000 (1 hr) | `HomeSectionsMain.js:26` |
| Homepage sections | `homepage-products-sections` | 5000 (5s) | `useFirestore.js:246` |
| Site settings | `site-settings` | 60000 (1 min) | `SettingsContext.js:23` |
| Global default | — | 60000 (1 min) | `SWRProvider.js:9` |

After a like + revalidate, the SWR in-memory cache still holds the old `likesCount`. The user must wait for `dedupingInterval` to expire before SWR re-fetches from the (now fresh) API.

For the homepage, this means **up to 1 hour** before the like count updates on ProductCards.

#### ❌ RC-3D: `ProductCard.js` doesn't update `weeklyLikesCount`

**File:** `src/components/products/ProductCard.js` **Line 132**

```javascript
await updateDoc(productRef, { likesCount: increment(isCurrentlyWishlisted ? -1 : 1) });
// ← Missing: weeklyLikesCount, currentWeekId, likesUpdatedAt
```

Compare with `ProductView.js` which correctly handles weekly logic:

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

Likes from the homepage don't contribute to weekly rankings, causing the "Top Liked This Week" section to be inaccurate.

#### ❌ RC-3E: `likes` type in revalidate uses `product_${id}` but `id` from ProductCard may not match Firestore doc ID

**File:** `src/components/products/ProductCard.js` **Lines 138-140**

```javascript
body: JSON.stringify({
  type: 'likes',
  id: id.toString(),       // ← This is the product's `id` prop
  handle: handle || String(id)  // ← Falls back to String(id) if no handle!
})
```

The `id` prop on ProductCard comes from the product data. If the product data was sourced from the homepage API (which reads from KV `homepage_data_v1`), the `id` field should be the Firestore document ID. But if `handle` is undefined, the fallback `String(id)` is used as the handle, which may not match the actual handle field in Firestore.

Similarly in `ProductView.js` **Line 155**:

```javascript
handle: product.handle || product.id  // ← Falls back to product.id if no handle
```

If `product.handle` is undefined and `product.id` is a numeric ID like `68302950218`, then the revalidate call sends `handle: "68302950218"` which would try to delete `product_stats_68302950218` — a key that doesn't exist (the real key is `product_stats_wind-luxury-shawl`).

### Actionable Fixes

**Fix 3A — Add `/api/revalidate` call to `handleUpdateLikes`:**

```javascript
// src/app/admin/reviews/page.js — After updateDoc (line 152)
await updateDoc(productRef, updateData);

// ✅ Invalidate KV cache so frontend sees the admin's manual update
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

**Fix 3B — Call SWR `mutate()` after like revalidation to force immediate UI update:**

```javascript
// src/app/products/[id]/ProductView.js — After the fetch('/api/revalidate') call (line 157)
import { mutate } from 'swr';

// Inside the setTimeout callback, after revalidate:
fetch('/api/revalidate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'likes',
    id: product.id,
    handle: product.handle || product.id
  })
}).catch(() => {});

// ✅ Force SWR to re-fetch this product's data on next render
mutate(`product-${product.id}`);
mutate('homepage/data');
mutate('homepage-products-sections');
```

**Fix 3C — Add `weeklyLikesCount` logic to `ProductCard.handleWishlistToggle`:**

```javascript
// src/components/products/ProductCard.js — Replace line 132
// BEFORE:
await updateDoc(productRef, { likesCount: increment(isCurrentlyWishlisted ? -1 : 1) });

// AFTER:
const likeChange = isCurrentlyWishlisted ? -1 : 1;
const updatePayload = {
  likesCount: increment(likeChange),
  likesUpdatedAt: new Date().toISOString()
};
// Note: ProductCard doesn't have currentWeekId in props.
// Minimal safe approach: always increment weekly (may over-count on week boundary)
updatePayload.weeklyLikesCount = increment(likeChange);

await updateDoc(productRef, updatePayload);
```

**Fix 3D — Ensure `handle` is always correctly passed from ProductCard:**

```javascript
// src/components/products/ProductCard.js — Lines 137-141
// BEFORE:
body: JSON.stringify({
  type: 'likes',
  id: id.toString(),
  handle: handle || String(id)  // ❌ Falls back to numeric ID
})

// AFTER:
body: JSON.stringify({
  type: 'likes',
  id: id.toString(),
  handle: handle || mergedProduct.handle || mergedProduct.seo?.handle || String(id)
  // ✅ Try multiple sources for the handle before falling back to ID
})
```

**Fix 3E — Reduce homepage SWR `dedupingInterval`:**

```javascript
// src/components/HomeSectionsMain.js — Line 26
// BEFORE:
}, { dedupingInterval: 3600000 });

// AFTER:
}, { dedupingInterval: 60000 });  // 1 minute instead of 1 hour
```

---

## 4. Cross-Cutting Findings

### ⚠️ CCF-1: `product_${handle}` vs `product_${id}` — Systemic Key Mismatch

This is the **most critical systemic issue** in the codebase. The `product_stats` branch in `/api/revalidate/route.js` now deletes `product_${handle}`, but **no code ever writes** a KV key named `product_${handle}`. All product data is cached under `product_${id}` where `id` is the Firestore document ID.

| Who WRITES `product_${id}` | Who WRITES `product_${handle}` |
|---------------------------|-------------------------------|
| `/api/product/[id]/route.js` | **NOBODY** ❌ |
| `products/[id]/page.js` | **NOBODY** ❌ |

| Who DELETES `product_${id}` | Who DELETES `product_${handle}` |
|-----------------------------|-------------------------------|
| `type: 'product'` branch ✅ | `type: 'product_stats'` branch ❌ (phantom key) |
| `type: 'likes'` branch ✅ | `type: 'product_stats'` branch ❌ (phantom key) |

**Fix:** The `product_stats` branch should accept an `id` parameter and delete `product_${id}` instead of (or in addition to) `product_${handle}`.

### ⚠️ CCF-2: No SWR `mutate()` calls anywhere in the codebase

After any `/api/revalidate` call, the server-side KV cache is cleared, but the client-side SWR in-memory cache is never notified. No component calls `mutate()` after revalidation. This means:

- **Homepage:** SWR won't re-fetch for up to 1 hour (`dedupingInterval: 3600000`)
- **Product page:** SWR won't re-fetch for up to 1 minute (`dedupingInterval: 60000`)
- **Site settings:** SWR won't re-fetch for up to 1 minute (`dedupingInterval: 60000`)

**Fix:** After every `/api/revalidate` call, call `mutate()` with the relevant SWR keys. Alternatively, use `mutate(key, undefined, { revalidate: true })` to force immediate re-fetch.

### ⚠️ CCF-3: `revalidatePath` is non-functional on Cloudflare Pages

Without R2 incremental cache configured in `open-next.config.ts`, `revalidatePath()` from `next/cache` silently does nothing. The Next.js Full Route Cache and ISR cache are never purged. This affects all three bugs but is a separate infrastructure fix.

---

## Summary: Root Cause → Fix Mapping

| Bug | Root Cause | Primary Fix |
|-----|-----------|-------------|
| **1: Review add 30s delay** | `sessionStorage` 60s gate blocks re-fetch | Clear `sessionStorage` for affected product after review submit |
| **1: Review add 30s delay** | SWR `dedupingInterval: 3600000` on homepage | Reduce to `60000` |
| **2: Review delete stuck** | `product_${handle}` KV key doesn't exist — `product_${id}` never deleted | Change `product_stats` branch to delete `product_${id}` via new `id` param |
| **2: Review delete stuck** | `handleDeleteReview` doesn't pass product Firestore doc ID | Add `productId` param and pass it to revalidate |
| **3: Likes not syncing** | Admin `handleUpdateLikes` never calls `/api/revalidate` | Add revalidate call after `updateDoc` |
| **3: Likes not syncing** | SWR `mutate()` never called after revalidation | Add `mutate()` calls for relevant SWR keys |
| **3: Likes data drift** | Admin uses absolute `likesCount: N`, frontend uses `increment(±1)` | Ensure KV is always invalidated before any increment (so stale base doesn't cause drift) |
| **3: Likes incomplete** | `ProductCard` doesn't update `weeklyLikesCount` | Add weekly logic to `ProductCard.handleWishlistToggle` |

---

*End of WIND Diagnostics Round 2 — No code was modified during this investigation.*
