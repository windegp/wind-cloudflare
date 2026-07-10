# Homepage Runtime Dependency Audit

**Date:** 2026-07-07  
**Scope:** Public homepage (`/`) only — Admin dashboard excluded  
**Mode:** Inspection only — No modifications made

---

## Dependency Tree

```
app/layout.js (Server Component)
  │
  ├── globals.css
  ├── lib/polyfills.js                     ← No npm deps (pure JS)
  │
  ├── components/SWRProvider.js ("use client")
  │   └── swr (SWRConfig)                  ← npm: swr ^2.4.1
  │
  ├── context/GlobalLoaderContext.js ("use client")
  │   └── next/navigation (usePathname)     ← npm: next ^15.1.0
  │
  ├── components/GlobalLoader.js ("use client")
  │   ├── context/GlobalLoaderContext
  │   ├── next/navigation (usePathname)
  │   └── public/logo.png (static asset)
  │
  ├── context/AuthContext.js ("use client")
  │   ├── firebase/auth (getAuth, onAuthStateChanged)    ← npm: firebase ^12.9.0
  │   ├── firebase/firestore/lite (doc, getDoc)          ← npm: firebase ^12.9.0
  │   └── lib/firebase.js                                 ← see below
  │
  ├── context/SettingsContext.js ("use client")
  │   ├── swr (useSWR)                                    ← npm: swr ^2.4.1
  │   ├── firebase/firestore/lite (updateDoc, etc.)       ← npm: firebase ^12.9.0
  │   ├── next/navigation (usePathname)
  │   └── lib/analytics-helpers.js                        ← no npm deps (pure JS)
  │
  ├── context/CartContext.js ("use client")
  │   ├── context/SettingsContext
  │   ├── lib/cartCalculations.js
  │   │   └── lib/constants.js                            ← no npm deps
  │   └── (no direct npm imports beyond react)
  │
  ├── components/LiveTracker.js ("use client")
  │   ├── firebase/database (ref, set, onDisconnect, etc.) ← npm: firebase ^12.9.0
  │   ├── lib/firebase.js (getRtdb)
  │   ├── context/CartContext
  │   └── next/navigation (usePathname)
  │
  ├── components/layout/StoreLayout.js ("use client")
  │   ├── components/layout/Navbar.js ("use client")
  │   │   ├── context/CartContext (useCart)
  │   │   ├── context/SettingsContext (useSettings)
  │   │   ├── next/navigation (usePathname)
  │   │   └── components/icons-extra.js                   ← no npm deps (pure SVG)
  │   │
  │   ├── components/layout/CartDrawer.js ("use client")
  │   │   ├── context/CartContext (useCart)
  │   │   ├── firebase/firestore/lite (doc, getDoc, etc.)  ← npm: firebase ^12.9.0
  │   │   ├── lib/products.js                              ← no npm deps (static data)
  │   │   ├── lib/firebase.js (getDb)
  │   │   ├── components/QuickViewModal (dynamic)          ← lazy loaded
  │   │   └── components/icons-extra.js
  │   │
  │   ├── components/layout/Footer.js ("use client")
  │   │   └── (no npm deps beyond next/link)
  │   │
  │   └── components/layout/ScrollToTop.js ("use client")
  │       └── (no npm deps beyond react)
  │
  └── app/page.js → HomeSectionsMain (dynamic, ssr: false) ← LAZY LOADED
      └── components/HomeSectionsMain.js ("use client")
          ├── swr (useSWR)
          ├── context/GlobalLoaderContext (usePageReady)
          ├── hooks/useFirestore.js
          │   ├── swr (useSWR)
          │   ├── lib/firebase.js (getDb)
          │   ├── firebase/firestore/lite (collection, getDocs, etc.) ← npm: firebase
          │   └── lib/inventoryHelpers.js                   ← no npm deps (pure JS)
          └── lib/designRegistry.js                         ← ALL DYNAMIC IMPORTS
              └── All section components dynamically imported:
                  HeroSection, EditorialCenteredHero, FeaturedToday,
                  TopTenProducts, MarqueeProducts, BestSellersSection,
                  ExclusiveOffers, MasterpieceCollections, CircularCollections,
                  TopRatedWeekly, MostLikedWeekly, TopRatedAllTime,
                  MostLikedAllTime, TabbedHighlights, BannerProductGrid,
                  VisualBreakSection, CustomerReviewsSection,
                  FloatingCollectionsSection
```

### lib/firebase.js — Central Firebase Module Dependency Chain

```
lib/firebase.js
  ├── firebase/app (initializeApp, getApps, getApp)        ← npm: firebase
  ├── firebase/firestore/lite (getFirestore)               ← npm: firebase
  ├── firebase/storage (getStorage)                        ← npm: firebase
  ├── firebase/auth (getAuth)                              ← npm: firebase
  └── firebase/database (getDatabase)                      ← npm: firebase
```

**Critical:** `lib/firebase.js` is imported by `AuthContext.js`, `LiveTracker.js`, `CartDrawer.js`, and `hooks/useFirestore.js`. This means **all five Firebase sub-modules** are bundled into the initial page load even if only `auth` and `firestore/lite` are immediately needed. `firebase/storage` and `firebase/database` are loaded eagerly on every page visit.

---

## npm Packages Executed on the Homepage (Initial Load)

| # | Package | Version | Imported By | Bundle Type | In transpilePackages? |
|---|---------|---------|-------------|-------------|----------------------|
| 1 | **react** | ^19.0.0 | Framework | Framework | ✅ (auto by Next.js SWC) |
| 2 | **react-dom** | ^19.0.0 | Framework | Framework | ✅ (auto by Next.js SWC) |
| 3 | **next** | ^15.1.0 | Framework (next/navigation, next/dynamic, next/script, next/font/google, next/link) | Framework | ✅ (auto by Next.js SWC) |
| 4 | **swr** | ^2.4.1 | SWRProvider, SettingsContext, HomeSectionsMain, useFirestore hooks | Bundled | ✅ Listed in transpilePackages |
| 5 | **firebase** | ^12.9.0 | lib/firebase.js (loads ALL sub-modules) | Bundled | ✅ Listed in transpilePackages |
| 6 | **@firebase/app** | (bundled) | firebase/app internally | Bundled | ✅ Listed in transpilePackages |
| 7 | **@firebase/firestore** | (bundled) | firebase/firestore/lite internally | Bundled | ✅ Listed in transpilePackages |

### Sub-modules of firebase loaded on homepage:

| Sub-module | Loaded? | Why | Browser Risk |
|------------|---------|-----|-------------|
| `firebase/app` | ✅ **Yes** | core initialization | LOW |
| `firebase/firestore/lite` | ✅ **Yes** | SettingsContext, AuthContext, CartDrawer, useFirestore | MEDIUM |
| `firebase/auth` | ✅ **Yes** | AuthContext (onAuthStateChanged) | **HIGH** — uses IndexedDB |
| `firebase/storage` | ✅ **Yes** | lib/firebase.js eager import | **MEDIUM** — uses XMLHttpRequest |
| `firebase/database` | ✅ **Yes** | LiveTracker (RTDB sessions) | **MEDIUM** — WebSocket fallback |

**All home page npm packages ARE covered by transpilePackages or are framework packages.**

---

## Packages NOT Loaded on Homepage (Lazy/Admin Only)

| Package | Loaded? | Where |
|---------|---------|-------|
| **@hello-pangea/dnd** | ❌ No | Admin dashboard only |
| **react-quill** | ❌ No | Admin dashboard only |
| **imagekit** | ❌ No | Image upload routes only |
| **@imagekit/next** | ❌ No | Image component (not on homepage) |
| **axios** | ❌ No | Not imported by any homepage component |
| **crypto-js** | ❌ No | Dynamic import via cryptoFallback.js (not triggered on homepage) |
| **papaparse** | ❌ No | Admin data export only |
| **csv-parser** | ❌ No | Server-side only |
| **firebase-admin** | ❌ No | Server-side only |
| **resend** | ❌ No | Server-side email only |
| **uuid** | ❌ No | Not imported on homepage |
| **clsx** | ❌ No | Not imported on homepage (used in some section components which are dynamically loaded) |
| **tailwind-merge** | ❌ No | Not imported on homepage |
| **react-nestable** | ❌ No | Admin dashboard only |

---

## Answers to Specific Questions

### 1. Which npm packages are actually executed on the homepage?

The following npm packages are bundled and executed on the initial homepage load:

| # | Package | Evidence |
|---|---------|----------|
| **swr** | Imported in SWRProvider, SettingsContext, useFirestore hooks |
| **firebase** (with sub-modules: app, auth, firestore/lite, storage, database) | Imported in lib/firebase.js which is imported by AuthContext, SettingsContext, LiveTracker, CartDrawer, useFirestore |

Plus framework packages: **react**, **react-dom**, **next**.

**Total: 3 installable npm packages** (react-dom is counted under react, @firebase/* are sub-packages of firebase)

### 2. Which of them are NOT listed in transpilePackages?

**None.** All 3 packages that execute on the homepage are either:
- Listed in `transpilePackages`: **swr**, **firebase**, **@firebase/app**, **@firebase/firestore**
- Framework packages (react, react-dom, next) — automatically transpiled by Next.js SWC

The `firebase/auth`, `firebase/storage`, `firebase/database` sub-modules are part of the `firebase` package, which IS listed in transpilePackages. Next.js Webpack/SWC's `transpilePackages` matches the package name `firebase` and will transpile all its sub-imports.

### 3. Which one is the highest probability cause of crashes on older Chrome/WebView?

**`firebase/auth`** — specifically the `onAuthStateChanged` observer.

| Candidate | Crash Type | Mechanism | Risk |
|-----------|-----------|-----------|------|
| **firebase/auth** | Runtime API failure | Uses IndexedDB internally for auth state persistence. On Android WebViews where IndexedDB is disabled or throws, Firebase SDK v12 can throw during initialization. The `onAuthStateChanged` listener in AuthContext.js runs immediately on mount. | **HIGH** |
| **firebase/storage** | Runtime API failure | Uses XMLHttpRequest. Available in all Chrome versions. Low risk. | **LOW** |
| **firebase/database** | Runtime API failure | Uses WebSocket with HTTP long-polling fallback. Available in Chrome 60+. | **LOW** |
| **swr** | Syntax error | Ships modern JS but IS in transpilePackages. SWC should transpile it. | **LOW** |
| **firebase** (core) | Size/performance | Large bundle (~400KB+) may cause timeout failures on slow devices, but not a crash. | **MEDIUM** |

### 4. Confidence percentage for each candidate.

| Candidate | Confidence | Evidence |
|-----------|-----------|----------|
| **firebase/auth** crash on older Chrome/WebView | **85%** | 1) `onAuthStateChanged` called unconditionally in AuthContext.js (line 18-34). 2) Firebase Auth SDK v12 internally calls `indexedDB.open()` which can throw `SecurityError` in third-party iframe contexts or some Android WebViews. 3) The error IS caught (line 28: `console.error`), but the catch is on the Firestore doc fetch, not on the auth listener itself — if IndexedDB throws during listener setup, the error may propagate before the catch. 4) Chrome 60+ supports IndexedDB, but Android WebView in older apps may have it disabled. |
| **firebase/storage** crash | **15%** | XMLHttpRequest is universally supported. The import is eager but unused on the homepage. |
| **SWC transpilation failure** for home page packages | **10%** | All home page packages are either framework-built or in transpilePackages. SWC correctly transpiles optional chaining, nullish coalescing, and class fields for browserslist targets. |
| **firebase** bundle size causing timeout | **40%** | The eager import of ALL firebase sub-modules (auth, storage, database, firestore) via lib/firebase.js creates a large client bundle. On slow 3G connections with old devices, this could cause timeout/page-load failures. |

---

## Summary

| Item | Verdict |
|------|---------|
| All home page npm packages are in `transpilePackages` | ✅ Yes |
| Home page syntax compatibility risk from npm packages | ✅ LOW — all are covered |
| Home page runtime API crash risk (firebase/auth IndexedDB) | ⚠️ MEDIUM-HIGH |
| Home page bundle size concern (eager firebase sub-modules) | ⚠️ MEDIUM |
| Packages NOT on homepage (admin only) | @hello-pangea/dnd, react-quill, imagekit, @imagekit/next, axios, crypto-js, papaparse, react-nestable |