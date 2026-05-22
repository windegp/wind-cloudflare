 WIND SHOPPING - ARCHITECTURE MASTER REFERENCE

**Version:** 1.0  
**Last Updated:** May 17, 2026  
**Status:** Production - Functional & Operational  
**Purpose:** Single Source of Truth for System Architecture, Data Flows, and Technical Decisions.

---

## TABLE OF CONTENTS

1. [Complete System Overview](#1-complete-system-overview)
2. [Data Flow Maps](#2-data-flow-maps)
3. [Admin ↔ Website Relationships](#3-admin--website-relationships)
4. [Cache & State Ownership Documentation](#4-cache--state-ownership-documentation)
5. [Server vs Client Responsibility Map](#5-server-vs-client-responsibility-map)
6. [Performance & Scalability Memory](#6-performance--scalability-memory)
7. [Security Memory](#7-security-memory)
8. [Technical Debt Tracker](#8-technical-debt-tracker)
9. [Refactor Roadmap](#9-refactor-roadmap)
10. [Future Engineering Rules](#10-future-engineering-rules)

---

## 1. COMPLETE SYSTEM OVERVIEW

### 1.1 Application Architecture

**Type:** Next.js 15 E-commerce Platform  
**Runtime:** Cloudflare Pages (Edge Runtime)  
**Deployment Model:** Serverless Edge Functions + Static Assets  
**Primary Language:** JavaScript (React 19)

### 1.2 Infrastructure Stack

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUDFLARE PAGES                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Next.js 15 Application (Edge Runtime)      │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │ │
│  │  │ SSR/ISR Pages│  │  API Routes  │  │  Static  │ │ │
│  │  │ (React 19)   │  │  (Serverless)│  │  Assets  │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Cloudflare KV (Edge Cache Storage)         │ │
│  │  - Homepage Data    - Product Cache                │ │
│  │  - Settings Cache   - Idempotency Keys             │ │
│  │  - Write Guards     - Rate Limiting                │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                   FIREBASE SERVICES                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Firestore   │  │     RTDB     │  │   Storage    │  │
│  │  (Primary DB)│  │ (Live Track) │  │   (Images)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐                                       │
│  │     Auth     │                                       │
│  │ (Admin Only) │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                   CLIENT BROWSER                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │                    SWR Cache                        │ │
│  │  - Global State Management                          │ │
│  │  - Request Deduplication                            │ │
│  │  - Background Revalidation                          │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │              sessionStorage Cache                   │ │
│  │  - Product Data (60s fresh, 5min stale)            │ │
│  │  - Homepage Sections                                │ │
│  │  - Product Stats                                    │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │              localStorage                           │ │
│  │  - Cart (persistent)                                │ │
│  │  - Wishlist (persistent)                            │ │
│  │  - Idempotency Fallback                             │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Next.js Architecture

**Version:** 15.1.0  
**React Version:** 19.0.0  
**Rendering Strategy:** Hybrid (SSR + CSR + ISR)

**Key Configurations:**
- **Transpiled Packages:** `firebase`, `@firebase/app`, `@firebase/firestore`, `swr`
- **Image Optimization:** Disabled (`unoptimized: true`) for Cloudflare compatibility
- **Console Removal:** Production builds strip console logs
- **Edge Compatibility:** Custom webpack config for Firebase on Edge Runtime

**Routing:**
- **Redirects:** `/product/:path*` → `/products/:path*` (permanent, SEO-critical)
- **Rewrites:** `/:slug` → `/collections/:slug` (collection-first routing)

### 1.4 Firebase Architecture

**Project:** `wind-reviews`  
**Region:** Default (us-central1)

**Services Used:**

1. **Firestore (Lite)** - Primary Database
   - Collections: `products`, `Orders`, `Customers`, `Reviews`, `ProductStats`, `collections`, `homepage`, `settings`
   - Mode: Lite SDK for Edge Runtime compatibility
   - Access Pattern: Server-side only (API routes)

2. **Realtime Database (RTDB)** - Live Tracking
   - Path: `LiveSessions/{sessionId}`
   - Purpose: Real-time visitor tracking for admin dashboard
   - Update Frequency: 20-second heartbeat
   - Cleanup: Manual (onDisconnect unreliable on Cloudflare)

3. **Firebase Storage** - Media Storage
   - Purpose: Product images, uploads
   - Access: Admin panel only
   - Alternative: ImageKit CDN (primary for production)

4. **Firebase Auth** - Authentication
   - Scope: Admin panel only
   - Public site: No authentication required

### 1.5 Cloudflare Integration

**KV Namespace:** `WIND_KV` (ID: `47cfb937f6354b88819be29386215889`)

**Compatibility:**
- Date: `2025-05-05`
- Flags: `nodejs_compat_v2`

**Build Output:** `.open-next` (OpenNext adapter for Cloudflare Pages)

### 1.6 External Services

1. **ImageKit** - CDN & Image Optimization
   - Primary image delivery
   - Transformation on-the-fly
   - Package: `@imagekit/next`

2. **Resend** - Transactional Email
   - Order confirmations
   - Admin notifications
   - REST API integration (Edge-compatible)

3. **Kashier** - Payment Gateway
   - Card payments
   - iFrame integration
   - HMAC SHA-256 signature verification

---

## 2. DATA FLOW MAPS

### 2.1 Product Data Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                   PRODUCT CREATION                       │
│                  (Admin Panel)                           │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Firestore: products/{id}                    │
│  Fields: title, price, images, handle, quantity,         │
│          categories, collections, metafields, seo        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│           KV Cache: product_{id}                         │
│  TTL: Infinite (manual invalidation only)                │
│  Invalidation: On product update via /api/revalidate     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│        Server Component: /products/[id]/page.js          │
│  - Checks KV cache first                                 │
│  - Falls back to Firestore                               │
│  - Uses React cache() for request deduplication          │
│  - Generates metadata for SEO                            │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         Client Component: ProductView                    │
│  - Receives initialProduct as prop                       │
│  - SWR for real-time updates (optional)                  │
│  - sessionStorage cache (60s fresh, 5min stale)          │
└─────────────────────────────────────────────────────────┘
```

**Authoritative Source:** Firestore `products/{id}`  
**Cache Layers:** KV → React cache() → sessionStorage → SWR  
**Invalidation Trigger:** Admin product update → `/api/revalidate` → KV delete → SWR mutate

### 2.2 Homepage Data Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│            HOMEPAGE CONFIGURATION                        │
│         (Admin: /admin/home-manager)                     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         Firestore: homepage/layout_config                │
│  - sections[] (array of section configs)                 │
│  - Each section: category, designId, data                │
│                                                           │
│         Firestore: homepage/main-hero                    │
│  - slides[] (hero carousel)                              │
│  - categories[] (quick nav buttons)                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      API Route: /api/homepage (GET)                      │
│  1. Check KV: homepage_data_v1                           │
│  2. If miss: Fetch from Firestore                        │
│  3. Price Enrichment: Batch fetch product prices         │
│  4. Review Stats: Batch fetch from ProductStats          │
│  5. Store in KV (infinite TTL)                           │
│  6. Return enriched data                                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│    Client: HomeSectionsMain (CSR with SWR)               │
│  - useSWR('homepage/data', fetch /api/homepage)          │
│  - 5-minute deduplication                                │
│  - Dynamic section rendering via DESIGN_REGISTRY         │
└─────────────────────────────────────────────────────────┘
```

**Authoritative Source:** Firestore `homepage/layout_config` + `homepage/main-hero`  
**Cache Layers:** KV → SWR  
**Invalidation:** Admin save → `/api/revalidate` (keys: `['homepage_data_v1']`) → KV delete → SWR mutate

### 2.3 Order Creation Flow

```
┌─────────────────────────────────────────────────────────┐
│              USER: /checkout Page                        │
│  - Fills form (email, phone, address)                    │
│  - Selects payment method                                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      ABANDONED CART TRACKING (Auto-save)                 │
│  Trigger: Email/phone entered + 5s debounce              │
│  Write: Firestore Orders/{orderId}                       │
│         Financial Status: "abandoned"                    │
│  Write: Firestore Customers/{email|phone}                │
│         Segment: "Abandoned_Checkout"                    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         USER CLICKS: "Complete Order"                    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      CLIENT: handleSubmit() in checkout/page.js          │
│  1. Validate form                                        │
│  2. Stop abandoned cart tracker                          │
│  3. Generate orderId (WIND-{timestamp}-{random})         │
│  4. Write to Firestore Orders (merge: true)              │
│     - Status: "pending_payment" (card) or "pending"      │
│  5. Update/Create Customer document                      │
│  6. Increment counters (COD/InstaPay only)               │
└─────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────┴───────┐
                    │               │
            ┌───────▼─────┐   ┌────▼──────┐
            │  Card       │   │ COD/      │
            │  Payment    │   │ InstaPay  │
            └─────────────┘   └───────────┘
                    │               │
                    ↓               ↓
        ┌───────────────────┐   ┌──────────────────┐
        │ /api/create-order │   │ /api/create-order│
        │ Returns iframeData│   │ Sends email      │
        └───────────────────┘   └──────────────────┘
                    │               │
                    ↓               ↓
        ┌───────────────────┐   ┌──────────────────┐
        │ Show Kashier      │   │ Redirect to      │
        │ iFrame Modal      │   │ /thank-you       │
        └───────────────────┘   └──────────────────┘
                    │
                    ↓
        ┌───────────────────┐
        │ Kashier Callback  │
        │ /api/kashier-     │
        │ callback          │
        │ - Verify HMAC     │
        │ - Update order    │
        │ - Increment       │
        │   counters        │
        │ - Send email      │
        └───────────────────┘
```

**Authoritative Source:** Firestore `Orders/{orderId}`  
**State Transitions:** `abandoned` → `pending_payment`/`pending` → `paid`/`completed`  
**Idempotency:** sessionStorage keys prevent duplicate counter increments

### 2.4 Review & Stats Flow

```
┌─────────────────────────────────────────────────────────┐
│         REVIEW SUBMISSION (Admin Panel)                  │
│  - Customer submits review                               │
│  - Admin approves: status = "published"                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         Firestore: Reviews/{reviewId}                    │
│  Fields: productHandle, rating, status, date,            │
│          hasImages, customerName, text                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      Firestore: ProductStats/{productHandle}             │
│  Aggregated fields:                                      │
│  - totalCount (number of reviews)                        │
│  - totalRatingSum (sum of all ratings)                   │
│  - Average calculated: totalRatingSum / totalCount       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         CACHE INVALIDATION                               │
│  /api/revalidate:                                        │
│  - product_stats_{handle}                                │
│  - product_{id}                                          │
│  - homepage_data_v1 (if featured review)                 │
│  - homepage_reviews_v1                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         CLIENT DISPLAY                                   │
│  - ProductCard: Batch fetch stats via                    │
│    /api/product-stats-batch                              │
│  - ProductView: Individual stats fetch                   │
│  - Homepage: Featured reviews from                       │
│    /api/homepage-reviews                                 │
└─────────────────────────────────────────────────────────┘
```

**Authoritative Source:** Firestore `Reviews/{id}` + `ProductStats/{handle}`  
**Aggregation:** Manual (admin triggers stats recalculation)  
**Cache Invalidation:** Cascading (review → stats → product → homepage)

### 2.5 Live Visitor Tracking Flow

```
┌─────────────────────────────────────────────────────────┐
│         USER VISITS WEBSITE                              │
│  Component: LiveTracker (client-side)                    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      Generate Session ID                                 │
│  sessionStorage: wind_live_session                       │
│  Format: sess_{random}                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      RTDB: LiveSessions/{sessionId}                      │
│  Write every 20 seconds (heartbeat):                     │
│  - path: current pathname                                │
│  - cartValue: subtotal                                   │
│  - itemsCount: cart items count                          │
│  - status: browsing|active_cart|checkout|purchased       │
│  - lastActive: serverTimestamp()                         │
│  - lastActiveClient: Date.now() (fallback)               │
│  - device: Mobile|Desktop                                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      ADMIN DASHBOARD: /admin/page.js                     │
│  - onValue listener on LiveSessions                      │
│  - Filter: lastActive < 2 hours (extended for CF)        │
│  - Display: Real-time active visitor count               │
│  - Visibility optimization: Pause when tab hidden        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│      CLEANUP                                             │
│  - Tab close: remove() session                           │
│  - onDisconnect: Unreliable on Cloudflare                │
│  - Heartbeat timeout: 2-hour expiry filter               │
└─────────────────────────────────────────────────────────┘
```

**Authoritative Source:** RTDB `LiveSessions/{sessionId}`  
**Update Frequency:** 20-second heartbeat (paused when tab hidden)  
**Cleanup Strategy:** Manual removal + 2-hour expiry filter (onDisconnect unreliable)

---

## 3. ADMIN ↔ WEBSITE RELATIONSHIPS

### 3.1 Homepage Management

**Admin Panel:** `/admin/home-manager`

**Workflow:**
1. Admin configures sections via drag-and-drop interface
2. Selects products/collections for each section
3. Customizes titles, images, badges, prices
4. Saves → Firestore `homepage/layout_config` + `homepage/main-hero`
5. Triggers `/api/revalidate` → Deletes `homepage_data_v1` from KV
6. Public site: Next request fetches fresh data from Firestore → Caches in KV

**Synchronization:**
- **Immediate:** Admin sees changes via SWR mutate
- **Public Site:** Next page load (KV cache cleared)
- **No Stale State:** KV invalidation ensures fresh data

### 3.2 Product Management

**Admin Panel:** `/admin/products`

**Workflow:**
1. Admin creates/updates product
2. Writes to Firestore `products/{id}`
3. Triggers `/api/revalidate` with `type: 'product', id, handle`
4. Invalidates:
   - `product_{id}` (KV)
   - `product_stats_{handle}` (KV)
   - `homepage_data_v1` (KV, if product is featured)
5. SWR mutate on client for immediate UI update

**Propagation:**
- Product pages: Immediate (KV cleared)
- Homepage: Immediate (if featured)
- Collections: Next load (no KV cache for collections)

### 3.3 Order Management

**Admin Panel:** `/admin/orders`

**Data Source:** Firestore `Orders` collection

**Relationship:**
- **Write:** Public checkout → Firestore
- **Read:** Admin panel → Firestore (real-time via SWR)
- **Update:** Admin can update order status
- **No Cache:** Orders not cached (always fresh from Firestore)

### 3.4 Analytics & Counters

**Admin Panel:** `/admin/page.js`

**Data Source:** Firestore `settings/siteSettings`

**Counters:**
- `counters.products` - Total products
- `counters.orders` - Total orders
- `counters.sales` - Total revenue
- `counters.customers` - Total customers
- `counters.visitors` - Total site visitors

**Update Mechanism:**
- **Visitors:** Client-side increment on first visit (sessionStorage guard)
- **Orders/Sales:** Server-side increment on order completion (sessionStorage guard)
- **Customers:** Server-side increment on first order (sessionStorage guard)

**Synchronization:**
- Admin: SWR with 5-second deduplication + revalidateOnFocus
- Public: No access to counters

### 3.5 Review Management

**Admin Panel:** `/admin/reviews`

**Workflow:**
1. Customer submits review (public form)
2. Writes to Firestore `Reviews/{id}` with `status: "pending"`
3. Admin approves → Updates `status: "published"`
4. Triggers stats recalculation → Updates `ProductStats/{handle}`
5. Invalidates caches:
   - `product_stats_{handle}`
   - `homepage_reviews_v1` (if featured)
   - `homepage_data_v1` (if featured)

**Propagation:**
- Product pages: Immediate (stats updated)
- Homepage: Immediate (if featured review)

---

## 4. CACHE & STATE OWNERSHIP DOCUMENTATION

### 4.1 Cloudflare KV Cache

**Purpose:** Edge-level persistent cache for expensive Firestore queries

**Namespace:** `WIND_KV`

**Key Patterns:**

| Key Pattern | Purpose | TTL | Invalidation |
|------------|---------|-----|--------------|
| `homepage_data_v1` | Homepage layout + hero | Infinite | Admin save |
| `product_{id}` | Product details | Infinite | Product update |
| `product_stats_{handle}` | Review stats | Infinite | Review publish |
| `collection_{slug}` | Collection data | Infinite | Collection update |
| `site_settings_v1` | Site settings | Infinite | Settings update |
| `homepage_reviews_v1` | Featured reviews | Infinite | Review publish |
| `idempotency_{opId}` | Idempotency check | 10 min | Auto-expire |
| `write_guard_{key}` | Write guard | 5 min | Auto-expire |
| `ratelimit_{type}_{ip}` | Rate limiting | 1-5 min | Auto-expire |

**Policy:**
- **Content Keys:** No TTL, persistent until explicit invalidation
- **Operational Keys:** Auto-expire with TTL

**Owner:** Server-side API routes  
**Invalidation:** `/api/revalidate` endpoint

### 4.2 SWR (Client-Side)

**Purpose:** Global client-side state management + request deduplication

**Configuration:**
```javascript
{
  revalidateOnFocus: false,
  dedupingInterval: 300000, // 5 minutes
  shouldRetryOnError: false,
  keepPreviousData: true
}
```

**Key Patterns:**

| Key | Data | Dedup Interval | Revalidation |
|-----|------|----------------|--------------|
| `homepage/data` | Homepage sections | 5 min | Manual (mutate) |
| `homepage-reviews` | Featured reviews | 5 min | Manual |
| `homepage-products-sections` | Dynamic sections | 5 min | Manual |
| `site-settings` | Site settings | 5 min (admin: 5s) | Admin: onFocus |
| `product-{id}` | Product details | 5 min | Manual |
| `product-stats-{handle}` | Review stats | 5 min | Manual |
| `related-{id}` | Related products | 5 min | Manual |
| `reviews-{handle}-{filter}-{page}` | Paginated reviews | 5 min | Manual |

**Owner:** Client components  
**Invalidation:** `mutate()` function (triggered by admin actions or user interactions)

### 4.3 sessionStorage Cache

**Purpose:** Per-tab cache for reducing API calls during browsing session

**Implementation:** `src/lib/session-cache.js`

**Cache Strategy:**
- **Fresh:** < 60s → Return immediately
- **Stale:** 60s - 5min → Return + background refresh
- **Expired:** > 5min → Ignore cache

**Key Patterns:**

| Key | Data | Max Age | Size Limit |
|-----|------|---------|------------|
| `wind_product_{id}` | Product details | 5 min | 20 keys total |
| `wind_homepage_sections` | Homepage sections | 5 min | 20 keys total |
| `wind_homepage_reviews` | Featured reviews | 5 min | 20 keys total |
| `wind_stats_{handle}` | Product stats | 5 min | 20 keys total |

**Features:**
- Automatic size control (max 20 keys, LRU eviction)
- Quota exceeded handling
- Fetch deduplication (in-flight promise sharing)
- Background refresh for stale data

**Owner:** Client-side hooks (`useFirestore.js`)  
**Invalidation:** Auto-expire + manual `removeSessionCache()`

### 4.4 localStorage

**Purpose:** Persistent cross-tab storage for cart and wishlist

**Key Patterns:**

| Key | Data | Persistence | Sync |
|-----|------|-------------|------|
| `wind_cart` | Cart items | Permanent | Manual |
| `wind_wishlist` | Wishlist items | Permanent | Manual |
| `wind_executed_ops` | Idempotency fallback | TTL-based | Auto-cleanup |
| `wind_write_guard` | Write guard fallback | TTL-based | Auto-cleanup |
| `pendingOrder` | Pending card payment | Temporary | Cleared on success |

**Owner:** Client-side context (`CartContext`) + utilities  
**Invalidation:** Manual clear or TTL expiry

### 4.5 React cache()

**Purpose:** Request-level deduplication for server components

**Usage:** Product page (`/products/[id]/page.js`)

```javascript
const getProductData = cache(async (id) => {
  // Fetch logic
});
```

**Scope:** Single request (SSR/ISR)  
**Owner:** Server components  
**Invalidation:** Automatic (per-request)

### 4.6 RTDB (Realtime Database)

**Purpose:** Live visitor tracking for admin dashboard

**Path:** `LiveSessions/{sessionId}`

**Data:**
```javascript
{
  path: "/products/abc123",
  cartValue: 500,
  itemsCount: 2,
  status: "active_cart",
  lastActive: serverTimestamp(),
  lastActiveClient: 1715987654321,
  device: "Mobile"
}
```

**Update Frequency:** 20-second heartbeat  
**Owner:** Client-side `LiveTracker` component  
**Cleanup:** Manual removal on tab close + 2-hour expiry filter

---

## 5. SERVER VS CLIENT RESPONSIBILITY MAP

### 5.1 Server-Side Responsibilities

**API Routes (Edge Functions):**

| Route | Purpose | Runtime | Auth |
|-------|---------|---------|------|
| `/api/homepage` | Fetch homepage data | Edge | Public |
| `/api/homepage-reviews` | Fetch featured reviews | Edge | Public |
| `/api/site-settings` | Fetch site settings | Edge | Public |
| `/api/product-stats-batch` | Batch fetch review stats | Edge | Public |
| `/api/create-order` | Create order + send email | Edge | Public |
| `/api/kashier-callback` | Payment webhook | Edge | HMAC verified |
| `/api/revalidate` | Cache invalidation | Edge | Public (should be secured) |
| `/api/write-ops` | Idempotency + write guards | Edge | Public |
| `/api/upload` | Image upload | Edge | Admin only |
| `/api/grant-access` | Maintenance mode access | Edge | Password |

**Server Components:**

| Component | Purpose | Data Source |
|-----------|---------|-------------|
| `/products/[id]/page.js` | Product page | KV → Firestore |
| `/collections/[slug]/page.js` | Collection page | Firestore |
| `/app/layout.js` | Root layout | Static |

**Responsibilities:**
- ✅ Firestore queries
- ✅ KV cache management
- ✅ Payment processing
- ✅ Email sending
- ✅ Webhook verification
- ✅ SEO metadata generation
- ✅ Server-side rendering

### 5.2 Client-Side Responsibilities

**Client Components:**

| Component | Purpose | State Management |
|-----------|---------|------------------|
| `HomeSectionsMain` | Homepage rendering | SWR |
| `ProductView` | Product details | SWR + sessionStorage |
| `ProductCard` | Product card | SWR (batch stats) |
| `CartDrawer` | Shopping cart | Context + localStorage |
| `CheckoutPage` | Checkout flow | Local state + Firestore |
| `LiveTracker` | Visitor tracking | RTDB |
| `ProductReviews` | Review display | SWR (paginated) |

**Responsibilities:**
- ✅ User interactions
- ✅ Cart management (localStorage)
- ✅ Form validation
- ✅ Client-side routing
- ✅ SWR cache management
- ✅ sessionStorage cache
- ✅ Real-time UI updates
- ✅ Analytics tracking (RTDB)

### 5.3 Trust Boundaries

**Server-Trusted Operations:**
- ✅ Order creation (Firestore writes)
- ✅ Counter increments (settings/siteSettings)
- ✅ Payment verification (HMAC)
- ✅ Email sending
- ✅ Cache invalidation

**Client-Trusted Operations (⚠️ Security Risk):**
- ⚠️ Visitor counter increment (client-side, sessionStorage guard)
- ⚠️ Live session tracking (RTDB writes from client)
- ⚠️ Abandoned cart tracking (client-side Firestore writes)

**Recommendations:**
- Move visitor counter to server-side (API route)
- Add Firebase Security Rules for RTDB
- Add server-side validation for abandoned cart writes

### 5.4 Incorrect Placements

**Client-Side Logic That Should Be Server-Side:**

1. **Visitor Counter Increment** (`SettingsContext.js`)
   - Current: Client-side Firestore write
   - Should: Server-side API route with IP deduplication

2. **Abandoned Cart Tracking** (`checkout/page.js`)
   - Current: Client-side Firestore writes
   - Should: Server-side API route with validation

3. **Live Session Tracking** (`LiveTracker.js`)
   - Current: Client-side RTDB writes
   - Should: Server-side API route (or secure with RTDB rules)

**Server-Side Logic That Could Be Client-Side:**

1. **Product Stats Batch Fetch** (`/api/product-stats-batch`)
   - Current: Server-side API route
   - Could: Client-side Firestore query (if security rules allow)
   - Reason: Reduces API route overhead

---

## 6. PERFORMANCE & SCALABILITY MEMORY

### 6.1 Expensive Routes

| Route | Cost | Reason | Optimization |
|-------|------|--------|--------------|
| `/api/homepage` | High | Batch Firestore queries (layout + hero + products + stats) | ✅ KV cache (infinite TTL) |
| `/api/homepage-reviews` | Medium | Firestore query + batch product fetch | ✅ KV cache |
| `/admin/home-manager` | High | Fetches all products (limit 500) + collections (limit 500) | ⚠️ Consider pagination |
| `/products/[id]` | Low | Single Firestore query | ✅ KV cache + React cache() |
| `/collections/[slug]` | Medium | Firestore query with array-contains | ⚠️ No KV cache |

### 6.2 Expensive Queries

**Firestore:**

1. **Homepage Product Enrichment** (`/api/homepage`)
   - Query: Batch fetch 30+ products for price/stats
   - Cost: 30+ reads per homepage load (first time)
   - Optimization: ✅ KV cache (infinite TTL)

2. **Homepage Reviews** (`/api/homepage-reviews`)
   - Query: Reviews (limit 10) + batch product fetch
   - Cost: 10-20 reads
   - Optimization: ✅ KV cache

3. **Admin Product Picker** (`/admin/home-manager`)
   - Query: All products (limit 500) + all collections (limit 500)
   - Cost: 1000 reads per admin page load
   - Optimization: ✅ SWR cache (5 min), ⚠️ Consider pagination

4. **Collection Products** (`/collections/[slug]`)
   - Query: `where("categories", "array-contains-any", [slug])`
   - Cost: Variable (depends on collection size)
   - Optimization: ⚠️ No cache, consider KV

**RTDB:**

1. **Live Sessions** (`/admin/page.js`)
   - Query: `onValue(LiveSessions)`
   - Cost: Real-time listener (continuous)
   - Optimization: ✅ Visibility-based pausing

### 6.3 Expensive Listeners

**RTDB Listeners:**

1. **Admin Dashboard Live View** (`/admin/page.js`)
   - Listener: `onValue(LiveSessions)`
   - Frequency: Real-time (every change)
   - Optimization: ✅ Pauses when tab hidden
   - Cost: Low (RTDB is cheap for reads)

2. **Live Tracker Heartbeat** (`LiveTracker.js`)
   - Write: Every 20 seconds
   - Optimization: ✅ Pauses when tab hidden
   - Cost: Medium (RTDB writes)

### 6.4 Bundle Size

**Main Bundle:**
- Next.js 15 + React 19
- Firebase SDK (Lite)
- SWR
- Tailwind CSS

**Optimizations:**
- ✅ Dynamic imports for admin components
- ✅ Code splitting by route
- ✅ Console removal in production
- ✅ Firestore Lite (smaller than full SDK)

**Concerns:**
- ⚠️ Firebase SDK still large (~100KB gzipped)
- ⚠️ React Quill (admin only, but not lazy-loaded)

### 6.5 Hydration

**Heavy Pages:**
1. **Homepage** (`/`)
   - Hydration: Full (all sections)
   - Optimization: ⚠️ Consider partial hydration
   - Current: Client-side rendering (CSR)

2. **Product Page** (`/products/[id]`)
   - Hydration: Moderate
   - Optimization: ✅ Server-side rendering (SSR)

3. **Checkout** (`/checkout`)
   - Hydration: Heavy (forms + payment)
   - Optimization: ✅ Client-side only (no SSR needed)

### 6.6 Firebase Cost Risks

**High-Cost Operations:**

1. **Admin Product Picker** - 1000 reads per load
2. **Homepage Enrichment** - 30+ reads per cache miss
3. **Live Session Writes** - 3 writes/minute per active user
4. **Abandoned Cart Tracking** - 1 write per 5 seconds (when typing)

**Mitigation:**
- ✅ KV cache for homepage (reduces reads by 99%)
- ✅ SWR cache for admin (5-minute deduplication)
- ✅ Visibility-based pausing for RTDB
- ✅ Debounced abandoned cart writes (5 seconds)
- ⚠️ Consider Firebase quota monitoring

### 6.7 Cache Inefficiencies

**Duplicate Cache Layers:**

1. **Product Data:**
   - KV → React cache() → sessionStorage → SWR
   - Issue: 4 layers for same data
   - Recommendation: Consolidate to KV + SWR

2. **Homepage Data:**
   - KV → SWR
   - Status: ✅ Efficient (2 layers)

3. **Settings:**
   - KV → SWR
   - Status: ✅ Efficient

**Stale Cache Risks:**

1. **sessionStorage:**
   - Risk: 5-minute stale data
   - Mitigation: Background refresh for stale data

2. **SWR:**
   - Risk: 5-minute deduplication
   - Mitigation: Manual `mutate()` on admin actions

---

## 7. SECURITY MEMORY

### 7.1 Authentication Architecture

**Admin Panel:**
- Firebase Auth (email/password)
- Protected routes: `/admin/*`
- Middleware: None (client-side auth check)

**Public Site:**
- No authentication required
- Maintenance mode: Password-based (`/api/grant-access`)

**Concerns:**
- ⚠️ Admin routes not protected by middleware
- ⚠️ Client-side auth check (can be bypassed)
- ⚠️ No session management

**Recommendations:**
- Add server-side middleware for `/admin/*`
- Implement session tokens
- Add Firebase Admin SDK for server-side auth verification

### 7.2 Upload Security

**Image Upload:** `/api/upload`

**Current Security:**
- ⚠️ No authentication check
- ⚠️ No file type validation
- ⚠️ No file size limit
- ⚠️ No rate limiting

**Recommendations:**
- Add Firebase Auth verification
- Validate file types (images only)
- Limit file size (e.g., 5MB)
- Add rate limiting

### 7.3 Webhook Verification

**Kashier Callback:** `/api/kashier-callback`

**Security:**
- ✅ HMAC SHA-256 signature verification
- ✅ Server-side only
- ✅ Validates payment data

**Status:** Secure

### 7.4 Revalidation Security

**Cache Invalidation:** `/api/revalidate`

**Current Security:**
- ⚠️ No authentication
- ⚠️ Public endpoint
- ⚠️ Can be abused to clear all caches

**Recommendations:**
- Add secret token verification
- Add rate limiting
- Log all revalidation requests

### 7.5 API Trust Boundaries

**Public Endpoints (No Auth):**
- `/api/homepage` - ✅ Safe (read-only)
- `/api/site-settings` - ✅ Safe (read-only)
- `/api/product-stats-batch` - ✅ Safe (read-only)
- `/api/create-order` - ⚠️ Needs validation
- `/api/revalidate` - ⚠️ Needs auth
- `/api/write-ops` - ⚠️ Needs validation

**Admin Endpoints (Should Have Auth):**
- `/api/upload` - ⚠️ No auth
- `/api/grant-access` - ✅ Password-based

### 7.6 Client-Trusted Logic

**Dangerous Client-Side Operations:**

1. **Visitor Counter** (`SettingsContext.js`)
   - Risk: Can be manipulated
   - Mitigation: sessionStorage guard (weak)

2. **Abandoned Cart** (`checkout/page.js`)
   - Risk: Can write fake orders
   - Mitigation: None

3. **Live Sessions** (`LiveTracker.js`)
   - Risk: Can write fake sessions
   - Mitigation: None

4. **Order Creation** (`checkout/page.js`)
   - Risk: Can manipulate order data
   - Mitigation: ⚠️ Server-side validation needed

**Recommendations:**
- Move all Firestore writes to server-side API routes
- Add Firebase Security Rules
- Validate all client data on server

### 7.7 Secrets Exposure

**Environment Variables:**
- ✅ Server-side only (not exposed to client)
- ✅ Cloudflare Pages environment variables

**Client-Exposed:**
- ⚠️ Firebase config (public, but acceptable)
- ⚠️ ImageKit public key (acceptable)

**Status:** Acceptable (Firebase config is meant to be public)

### 7.8 Unsafe Endpoints

**High-Risk Endpoints:**

1. `/api/revalidate` - Can clear all caches
2. `/api/upload` - Can upload arbitrary files
3. `/api/write-ops` - Can manipulate idempotency/guards

**Recommendations:**
- Add authentication
- Add rate limiting
- Add input validation
- Add logging

---

## 8. TECHNICAL DEBT TRACKER

### 8.1 Critical Issues (P0)

#### 1. Client-Side Firestore Writes
- **Severity:** High
- **Impact:** Security risk, data integrity
- **Affected Files:**
  - `src/context/SettingsContext.js` (visitor counter)
  - `src/app/checkout/page.js` (abandoned cart, order creation)
  - `src/components/LiveTracker.js` (live sessions)
- **Resolution:** Move all writes to server-side API routes
- **Difficulty:** Medium
- **Estimated Effort:** 2-3 days

#### 2. Missing Admin Authentication Middleware
- **Severity:** High
- **Impact:** Admin panel accessible without auth
- **Affected Files:**
  - `middleware.js` (no admin protection)
  - All `/admin/*` routes
- **Resolution:** Add server-side auth middleware
- **Difficulty:** Medium
- **Estimated Effort:** 1-2 days

#### 3. Unprotected Revalidation Endpoint
- **Severity:** High
- **Impact:** Cache can be cleared by anyone
- **Affected Files:**
  - `src/app/api/revalidate/route.js`
- **Resolution:** Add secret token verification
- **Difficulty:** Low
- **Estimated Effort:** 1 hour

### 8.2 Medium Issues (P1)

#### 1. Duplicate Cache Layers
- **Severity:** Medium
- **Impact:** Complexity, potential stale data
- **Affected Files:**
  - `src/lib/session-cache.js`
  - `src/hooks/useFirestore.js`
  - Product page components
- **Resolution:** Consolidate to KV + SWR only
- **Difficulty:** Medium
- **Estimated Effort:** 2-3 days

#### 2. RTDB onDisconnect Unreliable
- **Severity:** Medium
- **Impact:** Stale live sessions in admin dashboard
- **Affected Files:**
  - `src/components/LiveTracker.js`
  - `src/app/admin/page.js`
- **Resolution:** Implement server-side cleanup job
- **Difficulty:** Medium
- **Estimated Effort:** 1-2 days

#### 3. No Firebase Security Rules
- **Severity:** Medium
- **Impact:** Client can write to any collection
- **Affected Files:**
  - Firebase console (Firestore + RTDB rules)
- **Resolution:** Implement comprehensive security rules
- **Difficulty:** Medium
- **Estimated Effort:** 1 day

#### 4. Admin Product Picker Performance
- **Severity:** Medium
- **Impact:** 1000 Firestore reads per admin page load
- **Affected Files:**
  - `src/app/admin/home-manager/page.js`
- **Resolution:** Implement pagination or search
- **Difficulty:** Medium
- **Estimated Effort:** 2-3 days

### 8.3 Low Issues (P2)

#### 1. Homepage Client-Side Rendering
- **Severity:** Low
- **Impact:** SEO, initial load performance
- **Affected Files:**
  - `src/app/page.js` (maintenance mode wrapper)
  - `src/components/HomeSectionsMain.js`
- **Resolution:** Convert to SSR/ISR
- **Difficulty:** High (requires architecture change)
- **Estimated Effort:** 3-5 days

#### 2. No Rate Limiting on Most Endpoints
- **Severity:** Low
- **Impact:** Potential abuse
- **Affected Files:**
  - Most `/api/*` routes
- **Resolution:** Implement rate limiting middleware
- **Difficulty:** Low
- **Estimated Effort:** 1 day

#### 3. sessionStorage Cache Complexity
- **Severity:** Low
- **Impact:** Maintenance burden
- **Affected Files:**
  - `src/lib/session-cache.js` (687 lines)
- **Resolution:** Simplify or remove in favor of SWR
- **Difficulty:** Medium
- **Estimated Effort:** 2-3 days

### 8.4 Optimization Opportunities (P3)

#### 1. Bundle Size Optimization
- **Impact:** Faster initial load
- **Actions:**
  - Lazy-load React Quill (admin only)
  - Consider Firebase SDK alternatives
  - Analyze bundle with webpack-bundle-analyzer

#### 2. Image Optimization
- **Impact:** Faster page loads
- **Actions:**
  - Implement responsive images
  - Use WebP format
  - Lazy-load below-the-fold images

#### 3. Firestore Query Optimization
- **Impact:** Reduced costs
- **Actions:**
  - Add composite indexes
  - Optimize array-contains queries
  - Consider denormalization

---

## 9. REFACTOR ROADMAP

### Phase 0: Critical Security (1-2 weeks)

**Priority:** P0  
**Goal:** Secure the application

**Tasks:**
1. ✅ Add admin authentication middleware
   - Implement server-side auth check
   - Protect all `/admin/*` routes
   - Add session management

2. ✅ Move client-side Firestore writes to server
   - Create `/api/visitor-increment` for counter
   - Create `/api/abandoned-cart` for tracking
   - Create `/api/live-session` for tracking
   - Update client components to use APIs

3. ✅ Secure revalidation endpoint
   - Add secret token verification
   - Add rate limiting
   - Add logging

4. ✅ Implement Firebase Security Rules
   - Firestore: Deny all client writes
   - RTDB: Restrict live sessions to authenticated users
   - Storage: Admin-only uploads

**Dependencies:** None  
**Risks:** Breaking changes for admin panel  
**Rollback:** Keep old code commented for 1 week

### Phase 1: Performance & Scalability (2-3 weeks)

**Priority:** P1  
**Goal:** Optimize for scale

**Tasks:**
1. ✅ Consolidate cache layers
   - Remove sessionStorage cache
   - Rely on KV + SWR only
   - Update all components

2. ✅ Implement RTDB cleanup job
   - Create Cloudflare Worker for periodic cleanup
   - Remove sessions older than 2 hours
   - Schedule: Every 15 minutes

3. ✅ Optimize admin product picker
   - Implement search functionality
   - Add pagination (50 products per page)
   - Cache product list in SWR

4. ✅ Add rate limiting
   - Implement middleware for all API routes
   - Configure limits per endpoint type
   - Add IP-based blocking

**Dependencies:** Phase 0 complete  
**Risks:** Cache behavior changes  
**Rollback:** Feature flags for new cache strategy

### Phase 2: Architecture Improvements (3-4 weeks)

**Priority:** P2  
**Goal:** Improve maintainability

**Tasks:**
1. ✅ Convert homepage to SSR/ISR
   - Remove maintenance mode wrapper
   - Implement server-side data fetching
   - Add ISR with 60-second revalidation

2. ✅ Simplify sessionStorage cache
   - Remove if Phase 1 consolidation successful
   - Or simplify to basic LRU cache

3. ✅ Add comprehensive logging
   - Implement structured logging
   - Add error tracking (Sentry)
   - Add performance monitoring

4. ✅ Implement Firebase quota monitoring
   - Create dashboard for Firestore usage
   - Set up alerts for high usage
   - Optimize expensive queries

**Dependencies:** Phase 1 complete  
**Risks:** Major architecture changes  
**Rollback:** Gradual rollout with feature flags

### Phase 3: Optimization & Polish (2-3 weeks)

**Priority:** P3  
**Goal:** Fine-tune performance

**Tasks:**
1. ✅ Bundle size optimization
   - Lazy-load admin components
   - Analyze and optimize dependencies
   - Implement code splitting

2. ✅ Image optimization
   - Implement responsive images
   - Convert to WebP
   - Add lazy loading

3. ✅ Firestore query optimization
   - Add composite indexes
   - Denormalize where appropriate
   - Implement query caching

4. ✅ SEO improvements
   - Add structured data
   - Optimize meta tags
   - Implement sitemap generation

**Dependencies:** Phase 2 complete  
**Risks:** Low (incremental improvements)  
**Rollback:** Easy (per-feature rollback)

---

## 10. FUTURE ENGINEERING RULES

### 10.1 Data Access Rules

**RULE 1: No Direct Firestore Writes from Client**
- ❌ Never use Firestore SDK directly in client components
- ✅ Always use server-side API routes for writes
- ✅ Implement validation and authentication on server

**RULE 2: All Mutations Must Go Through Server**
- ❌ No client-side `setDoc()`, `updateDoc()`, `increment()`
- ✅ Create dedicated API routes for each mutation type
- ✅ Implement idempotency for critical operations

**RULE 3: Cache Invalidation Must Be Explicit**
- ❌ No automatic cache invalidation
- ✅ Always call `/api/revalidate` after mutations
- ✅ Document cache dependencies in code comments

### 10.2 Cache Management Rules

**RULE 4: Avoid Duplicate Cache Layers**
- ❌ No more than 2 cache layers for same data
- ✅ Prefer KV (server) + SWR (client)
- ✅ Document cache strategy in component comments

**RULE 5: Homepage Must Remain Server-Rendered**
- ❌ No client-side-only homepage rendering
- ✅ Use SSR or ISR for homepage
- ✅ Maintain SEO-friendly rendering

**RULE 6: No New sessionStorage Caches Without Justification**
- ❌ Don't add sessionStorage cache by default
- ✅ Use SWR for client-side caching
- ✅ Document why sessionStorage is needed (if added)

### 10.3 Performance Rules

**RULE 7: Avoid New Realtime Listeners Without Cost Analysis**
- ❌ No new RTDB listeners without approval
- ✅ Analyze cost impact before adding
- ✅ Implement visibility-based pausing

**RULE 8: Batch Firestore Queries When Possible**
- ❌ No N+1 query patterns
- ✅ Use `where(documentId(), "in", ids)` for batch fetches
- ✅ Limit batch size to 30 (Firestore limit)

**RULE 9: All Expensive Queries Must Be Cached**
- ❌ No uncached queries that fetch >10 documents
- ✅ Use KV cache for expensive queries
- ✅ Set appropriate TTL or manual invalidation

### 10.4 Security Rules

**RULE 10: All Admin Routes Must Be Protected**
- ❌ No public admin routes
- ✅ Implement server-side authentication middleware
- ✅ Verify Firebase Auth tokens on server

**RULE 11: All API Routes Must Validate Input**
- ❌ No trusting client data
- ✅ Validate all request parameters
- ✅ Sanitize user input

**RULE 12: Sensitive Operations Must Be Rate-Limited**
- ❌ No unlimited API access
- ✅ Implement rate limiting for all mutations
- ✅ Use stricter limits for expensive operations

### 10.5 Code Organization Rules

**RULE 13: Server Components for Data Fetching**
- ✅ Use server components for initial data fetching
- ✅ Pass data as props to client components
- ❌ Don't fetch data in client components unless interactive

**RULE 14: API Routes Must Follow RESTful Patterns**
- ✅ Use proper HTTP methods (GET, POST, PUT, DELETE)
- ✅ Return consistent response format
- ✅ Include proper error handling

**RULE 15: Document All Cache Dependencies**
- ✅ Add comments explaining cache invalidation
- ✅ Document data flow in component headers
- ✅ Update this architecture doc when adding new caches

### 10.6 Testing Rules

**RULE 16: Test Cache Invalidation Flows**
- ✅ Verify cache clears after mutations
- ✅ Test stale data scenarios
- ✅ Validate SWR mutate() calls

**RULE 17: Test Edge Cases for Idempotency**
- ✅ Verify duplicate submissions are prevented
- ✅ Test TTL expiration
- ✅ Validate cross-tab behavior

### 10.7 Monitoring Rules

**RULE 18: Monitor Firebase Quota Usage**
- ✅ Set up alerts for high read/write counts
- ✅ Track expensive queries
- ✅ Review quota usage weekly

**RULE 19: Log All Critical Operations**
- ✅ Log order creation
- ✅ Log payment processing
- ✅ Log cache invalidation
- ✅ Log authentication failures

---

## APPENDIX A: Key File Locations

### Configuration Files
- `next.config.mjs` - Next.js configuration
- `wrangler.jsonc` - Cloudflare Pages configuration
- `middleware.js` - Next.js middleware (routing only)
- `package.json` - Dependencies

### Firebase Integration
- `src/lib/firebase.js` - Client-side Firebase SDK
- `src/lib/firebase-edge.js` - Edge-compatible Firebase SDK

### Cache Management
- `src/lib/kv-cache.js` - Cloudflare KV utilities
- `src/lib/session-cache.js` - sessionStorage cache (687 lines)
- `src/components/SWRProvider.js` - SWR configuration

### API Routes
- `src/app/api/homepage/route.js` - Homepage data
- `src/app/api/create-order/route.js` - Order creation
- `src/app/api/revalidate/route.js` - Cache invalidation
- `src/app/api/write-ops/route.js` - Idempotency + write guards

### Core Components
- `src/app/page.js` - Homepage (maintenance mode wrapper)
- `src/components/HomeSectionsMain.js` - Homepage sections
- `src/app/products/[id]/page.js` - Product page (SSR)
- `src/app/checkout/page.js` - Checkout flow
- `src/components/LiveTracker.js` - Visitor tracking

### Admin Panel
- `src/app/admin/page.js` - Admin dashboard
- `src/app/admin/home-manager/page.js` - Homepage manager (904 lines)

### Utilities
- `src/lib/writeOptimizer.js` - Idempotency + write guards
- `src/lib/rateLimit.js` - Rate limiting
- `src/hooks/useFirestore.js` - Firestore hooks (451 lines)

---

## APPENDIX B: Environment Variables

### Required Variables
- `NEXT_PUBLIC_BASE_URL` - Base URL for the site
- `KASHIER_MERCHANT_ID` - Kashier merchant ID
- `KASHIER_API_KEY` - Kashier API key
- `RESEND_API_KEY` - Resend email API key

### Optional Variables
- `NEXT_PUBLIC_REVALIDATE_SECRET` - Revalidation secret (should be required)

---

## APPENDIX C: Known Contradictions

### 1. Homepage Rendering
- **Intended:** Server-side rendering for SEO
- **Actual:** Client-side rendering with maintenance mode wrapper
- **Reason:** Maintenance mode feature added later
- **Resolution:** Phase 2 refactor to SSR/ISR

### 2. Cache Invalidation
- **Intended:** Automatic cache invalidation
- **Actual:** Manual `/api/revalidate` calls
- **Reason:** No built-in cache dependency tracking
- **Resolution:** Document dependencies, consider automation

### 3. RTDB Cleanup
- **Intended:** onDisconnect() handles cleanup
- **Actual:** Manual cleanup with 2-hour expiry filter
- **Reason:** onDisconnect() unreliable on Cloudflare
- **Resolution:** Phase 1 server-side cleanup job

---

## DOCUMENT MAINTENANCE

**Update Triggers:**
- New cache layer added
- New API route created
- Architecture change
- Security issue discovered
- Performance bottleneck identified
- Refactor completed

**Review Schedule:**
- Weekly: Technical debt tracker
- Monthly: Performance metrics
- Quarterly: Full architecture review

**Version History:**
- v1.0 (May 17, 2026): Initial comprehensive documentation

---

**END OF ARCHITECTURE MASTER REFERENCE**