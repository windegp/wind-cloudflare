# FINAL COMPLETION AUDIT — Runtime + Analytics

## Date: 2026-05-23
## Type: FULL RUNTIME DEPENDENCY + ANALYTICS INTEGRITY AUDIT

---

## ISSUE #1 — CHECKOUT RUNTIME FAILURE (CHUNK LOAD ERROR)

### ROOT CAUSE: Firebase Storage Module Contamination in App Layout + Checkout Page

**Exact problem chain:**

```
layout.js
  → SettingsProvider (SettingsContext.js)
    → lib/firebase.js
      → import { getStorage } from "firebase/storage"      ← LINE 3
      → import { getAuth } from "firebase/auth"             ← LINE 4
      → import { getDatabase } from "firebase/database"     ← LINE 5
  → CartProvider (CartContext.js)
    → uses localStorage (safe)
  → LiveTracker
    → getRtdb() → firebase/database

checkout/page.js
  → lib/firebase.js (imports { getDb })
    → firebase/firestore/lite  (safe)
    → firebase/storage          ❌ UNUSED BUT LOADED
    → firebase/auth             ❌ UNUSED BUT LOADED  
  → context/GlobalLoaderContext.js
  → context/CartContext.js
```

**Critical finding:** `src/lib/firebase.js` lines 3-5:

```js
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
```

These imports are executed **eagerly at module load time** even though the functions (`getStorageInstance`, `getAuthInstance`, `getRtdb`) are lazily called. When Cloudflare Pages / `@opennextjs/cloudflare` bundles the checkout page chunk, it includes ALL of `lib/firebase.js` and its transitive dependencies.

**Why checkout specifically fails:**

1. **`firebase/storage`** uses `XMLHttpRequest` during module initialization in some bundler modes. In Cloudflare's workerd runtime (where server-side rendering may occur for the first load), XHR is not available. Even though this is a client component, OpenNext/Cloudflare may attempt to evaluate the module in the edge runtime for SSR hydration.

2. **`firebase/auth`** uses `indexedDB` for auth state persistence. When evaluated in a context where indexedDB isn't available (edge worker), it throws silently but corrupts the module loading state.

3. **The checkout page is the ONLY page that uses `getDb` directly from `lib/firebase`** (via `setDoc`, `getDoc`, etc.). The admin page uses `getDb` but that's a different route. Other pages may not trigger the same import chain during chunk evaluation.

4. The **ChunkLoadError** manifests because the JavaScript chunk file loads OK, but during module evaluation, the Firebase SDK initialization fails in the edge runtime context, throwing an unhandled exception that prevents the chunk from completing evaluation.

### IMMEDIATE FIX: Isolate Firebase Storage/Auth imports

**Solution:** Create a checkout-specific Firebase wrapper that ONLY imports `firebase/firestore/lite`, avoiding `storage`, `auth`, and `database`:

```js
// src/lib/firebase-checkout.js — dedicated for checkout page only
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

const firebaseConfig = { /* same config */ };

let app = null;
let db = null;

export const getCheckoutDb = () => {
  if (!app) app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  if (!db) db = getFirestore(app);
  return db;
};
```

**Files to modify:**
- NEW: `src/lib/firebase-checkout.js` — lightweight Firebase client
- `src/app/checkout/page.js` — change `import { getDb } from "@/lib/firebase"` → `import { getCheckoutDb } from "@/lib/firebase-checkout"`

---

## ISSUE #2 — ANALYTICS / VISITOR COUNTS / FILTERS INCORRECT

### BUG #1: Timezone Mismatch Between Visitor Counter and Dashboard

**Files involved:** `src/context/SettingsContext.js` vs `src/app/api/admin/dashboard-stats/route.js`

**Root cause:**

```js
// SettingsContext.js (line 10-13) — runs in BROWSER timezone
function getTodayStr() {
  const now = new Date();  // ← BROWSER timezone (may be UTC+2 Egypt, UTC+3, etc.)
  ...
}
```

```js
// dashboard-stats/route.js (line 119) — runs in SERVER timezone
const nowCairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
```

**The mismatch:** SettingsContext.js runs in the visitor's browser. `new Date()` gives the local timezone of the visitor's device. At 11 PM in Cairo, the browser says "today" is still today. But for a visitor from Saudi Arabia (UTC+3), midnight comes an hour earlier. So:

- A Saudi visitor at 12:30 AM their time (11:30 PM Cairo time) → `getTodayStr()` returns the NEXT day's date
- The counter writes `todayDate: "2026-05-24"` but Cairo is still `2026-05-23`
- Dashboard queries for Cairo time `2026-05-23` misread `yesterdayVisitors` instead of `todayVisitors`

**Time distribution error:** The `rolloverLock` mechanism with localStorage is browser-specific. Different users in different timezones can trigger multiple rollovers, corrupting `yesterdayVisitors` and `todayVisitors`.

### BUG #2: Visitor Increment Race Conditions

**File:** `src/context/SettingsContext.js` lines 62-106

```js
getDoc(settingsRef).then(snap => { ... 
  updateDoc(settingsRef, { "counters.visitors": increment(1), ... })
```

This is a **read-then-write** pattern that is NOT atomic. Between `getDoc` and `updateDoc`:
- Another tab on the same browser can increment
- The `rolloverLock` is client-side only (localStorage) — doesn't prevent server-side concurrent writes
- Multiple visitors incrementing simultaneously can lose counts

**The rollover logic also has a TOCTOU (time-of-check time-of-use) bug:**
```js
if (counters.todayDate !== today) {  // READ
  // ... async gap where another visitor could also do rollover ...
  updateDoc(settingsRef, { "counters.todayDate": today, ... })  // WRITE
}
```

### BUG #3: KV Cache Contamination After Reconciliation

**File:** `src/app/api/site-settings/route.js`

The KV cache stores a FULL snapshot of `settings/siteSettings`. When we update `counters.customers` via the reconciliation endpoint, the KV cache may still have the OLD value. The cache is served to ALL visitors for 24 hours (KV_TTL.SETTINGS = 86400). So:

- After reconciliation (counters.customers = 12500)
- KV cache still serves `counters.customers = 30000` for up to 24 hours
- Admin dashboard reads from KV cache (if using site-settings API) or reads directly from Firestore (if using counters snapshot in dashboard-stats route)

**Actually, looking at dashboard-stats/route.js line 108-109:**
```js
const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
const counters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
```

The dashboard stats route reads DIRECTLY from Firestore — NOT from KV cache. But the `site-settings` API (`/api/site-settings`) serves KV cache to the SettingsContext. So:

- **Dashboard stats:** reads live Firestore → POST-reconciliation consistent ✅
- **SettingsContext (products count card, etc.):** reads KV cache → potentially stale ❌

### BUG #4: Yesterday Visitors Inaccuracy

**File:** `src/context/SettingsContext.js` lines 73-78

```js
"counters.yesterdayVisitors": finalTodayVisitors  // ← copies todayVisitors to yesterday
```

This is set from the BROWSER at rollover time. But:
1. Rollover happens on first visitor AFTER midnight (browser local time)
2. If no visitor comes for 6 hours after midnight Cairo time, `yesterdayVisitors` stays at the OLD value until the first post-midnight visitor triggers the rollover
3. The dashboard reads `yesterdayVisitors` directly — so "Yesterday" filter is unreliable

### BUG #5: SWR Cache Staleness

**File:** `src/app/admin/page.js` (dashboard)

```js
const fetchDashboardStats = useCallback(async (period, startDate, endDate) => { ... });
```

The dashboard fetches stats every 60 seconds (polling). But SWR deduping at 300 seconds (5 minutes) means:
- The first fetch may be fresh
- Consecutive fetches within 5 minutes may be deduped
- But the `useEffect` for periodic refresh explicitly calls `fetch()` directly, bypassing SWR's cache

Actually, looking more carefully, the dashboard uses `fetch()` directly, not `useSWR`. So SWR caching doesn't affect dashboard stats. The polling at 60 seconds should work fine.

---

## FILES REQUIRING MODIFICATION

| File | Issue | Fix |
|------|-------|-----|
| `src/lib/firebase.js` | Imports storage/auth/database eagerly | Create lightweight checkout variant |
| `src/app/checkout/page.js` | Uses full firebase.js | Switch to checkout-dedicated Firebase import |
| `src/context/SettingsContext.js` | Browser-timezone rollover | Use Cairo timezone for `getTodayStr()` |
| `src/context/SettingsContext.js` | Race condition in rollover | Atomic Firestore transaction |
| `src/app/api/site-settings/route.js` | KV cache desync | TTL reduction + cache busting mechanism |
| `src/app/api/admin/reconcile-customers/route.js` | (already created) | already syncs KV cache ✅ |

---

## SAFE IMPLEMENTATION PLAN

### Step 1: Create lightweight Firebase wrapper for checkout
```
NEW: src/lib/firebase-checkout.js
→ Only imports firebase/app + firebase/firestore/lite
→ No storage, auth, or database
```

### Step 2: Update checkout page import
```
src/app/checkout/page.js line 10:
  import { getDb } from "@/lib/firebase"  
→ import { getCheckoutDb } from "@/lib/firebase-checkout"
  (rename to getDb inside the file for minimal code changes)
```

### Step 3: Fix SettingsContext timezone
```
src/context/SettingsContext.js function getTodayStr():
→ Use Cairo timezone instead of browser local:
  new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
```

### Step 4: Fix rollover race condition
```
src/context/SettingsContext.js:
→ Use runTransaction() instead of getDoc + updateDoc pattern
  for the rollover logic
```

### Step 5: KV cache invalidation
```
src/app/api/site-settings/route.js:
→ Reduce TTL for counters from 86400 to 3600 (1 hour)
→ Add counter-specific key (not bundled with entire settings)
```

---

## EDGE CASES & RISK MITIGATION

| Edge Case | Risk | Mitigation |
|-----------|------|------------|
| Checkout still fails after Firebase import fix | LOW | The import isolation is a standard pattern |
| SettingsContext timezone change breaks existing todayDate | LOW | All dates are validated by `parseDateToMs` in dashboard |
| Rollover transaction conflicts | LOW | Firestore transactions retry automatically |
| KV cache still stale after TTL reduction | LOW | Cache busts within 1 hour max |

---

## VALIDATION CHECKLIST

- [ ] Checkout page loads without ChunkLoadError
- [ ] Checkout page performs Firestore writes correctly
- [ ] Today visitors match between dashboard and real-time
- [ ] Yesterday visitors roll over correctly at midnight Cairo
- [ ] Week filter shows consistent data
- [ ] Month filter shows consistent data
- [ ] "All" filter uses correct counters.customers
- [ ] No regression in admin dashboard metrics
- [ ] No regression in public site functionality
- [ ] Reconciliation endpoint works correctly (dry-run + apply)
- [ ] Legacy migration route remains hardened (403/410)