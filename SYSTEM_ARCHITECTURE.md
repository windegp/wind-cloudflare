# WIND Shopping - System Architecture Documentation
## COMPLETE REVERSE-ENGINEERING ANALYSIS

**Version:** 1.0  
**Generated:** April 2026  
**Purpose:** Single Source of Truth for all developers working on the WIND Shopping platform

---

# 1. GLOBAL ARCHITECTURE OVERVIEW

## 1.1 Overall Architecture Pattern

The system follows a **Hybrid SSR + Client-Side Architecture** built on:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WIND SHOPPING ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │   Next.js 15 │───▶│  Cloudflare  │───▶│    KV Cache Layer        │  │
│  │   (App Dir)  │    │     Edge     │    │  (Edge-Compatible)       │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│         │                   │                         │                 │
│         ▼                   ▼                         ▼                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │    SWR       │    │   Firebase   │    │   Realtime Database      │  │
│  │ Client Cache │◀───│  Firestore   │    │   (Live Sessions)        │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│                                          (RTDB - No Quota Impact)      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Core Layer Breakdown

### Layer 1: API Layer (`/api/*`)
- **Purpose:** Edge-compatible data fetching with KV caching
- **Files:** 17 API routes
- **Cache Strategy:** KV-first, Firebase fallback
- **Key Pattern:** All routes use `dynamic = 'force-dynamic'` for Cloudflare compatibility

### Layer 2: Hooks Layer (`/hooks/`)
- **Purpose:** SWR-powered data fetching abstraction
- **Key File:** `useFirestore.js` - The central nervous system
- **Pattern:** Deduping interval + revalidation control for quota protection

### Layer 3: Context Layer (`/context/`)
- **AuthContext:** Firebase Auth + Firestore user role lookup
- **CartContext:** LocalStorage-backed cart state + calculations
- **SettingsContext:** Site-wide settings with SWR caching
- **GlobalLoaderContext:** Page-level loading orchestration

### Layer 4: Components Layer (`/components/`)
- **Design Registry Pattern:** Dynamic section loading based on layout config
- **StoreLayout:** Conditional rendering (excludes admin routes)
- **ProductCard:** Smart review stats fetching with 3-tier priority

### Layer 5: Admin System (`/app/admin/`)
- **Access Control:** Firebase Auth + UID whitelist (`ADMIN_UID`)
- **Real-time Updates:** Reduced cache intervals for admin views
- **Invalidation APIs:** Dedicated routes for cache purging

### Layer 6: Firestore Database
- **Collections:** products, collections, Reviews, ProductStats, settings, Orders, Customers
- **Dual Firebase Setup:** Client SDK + Edge-compatible wrapper
- **Quota Protection:** Aggressive caching + batched reads + limits enforced

---

# 2. FILE-BY-FILE BREAKDOWN

## 2.1 Core Library Files (`/src/lib/`)

### `firebase.js` - Client-Side Firebase Instance
```
Purpose: Browser-compatible Firebase initialization
Main Exports:
  - getDb() → Firestore instance (lazy init)
  - getStorageInstance() → Firebase Storage
  - getAuthInstance() → Firebase Auth
  - getRtdb() → Realtime Database (Live Sessions)

Dependencies:
  - firebase/app, firebase/firestore/lite, firebase/storage, firebase/auth, firebase/database

Used By:
  - All client components
  - useFirestore hooks
  - ProductReviews, ProductCard, ProductView

Risk Level: CRITICAL
  - Breaking this breaks ALL Firebase connections
  - The "lite" firestore SDK is mandatory for quota control
```

### `firebase-edge.js` - Edge Runtime Wrapper
```
Purpose: Cloudflare Edge-compatible Firebase (bypasses EvalError)
Main Exports:
  - getFirebaseEdge() → { app, db }
  - getEdgeDb() → Firestore instance for edge

Dependencies:
  - Same firebase packages but initialized differently

Used By:
  - Server components (page.js files)
  - API routes running on edge

Risk Level: HIGH
  - If this fails, SSR breaks completely
  - Must remain compatible with both node and edge runtimes
```

### `kv-cache.js` - Cloudflare KV Cache Layer
```
Purpose: Edge-compatible KV operations for caching
Main Exports:
  - getKV() → Returns WIND_KV binding
  - kvGet(key) → JSON.parse cached data
  - kvSet(key, data) → Store with JSON.stringify
  - kvDelete(key) → Remove single key
  - kvDeleteMany(keys[]) → Batch deletion

Dependencies:
  - @opennextjs/cloudflare (getCloudflareContext)

Used By:
  - ALL API routes (homepage, product, site-settings, etc.)
  - Server-side product fetching
  - Revalidation API

Risk Level: CRITICAL
  - KV failure = no caching = quota exhaustion
  - Always wrapped in try/catch (returns null on failure)
```

### `constants.js` - Centralized Configuration
```
Purpose: Single source for all hardcoded values
Key Constants:
  - ADMIN_UID: "jGb9wBMHZfRIQgR9yfbb3rkvzRw2" (HARDCODED ADMIN)
  - SHIPPING_COST: 70 (EGP)
  - FREE_SHIPPING_THRESHOLD: Infinity
  - VALID_PROMO_CODES: { FREE: "free" }
  - FIRESTORE_COLLECTIONS: All collection names
  - KASHIER_CONFIG: Payment gateway settings
  - ORDER_STATUS: pending/processing/shipped/delivered/cancelled

Used By:
  - cartCalculations.js
  - create-order API
  - All checkout components

Risk Level: MEDIUM
  - Changes here affect business logic globally
  - ADMIN_UID must match Firebase Auth user
```

### `cartCalculations.js` - Cart Math Engine
```
Purpose: Pure functions for cart calculations (shared between client/server)
Main Exports:
  - calculateSubtotal(cartItems)
  - calculateShipping(promoCode)
  - calculateTotal(subtotal, shipping)
  - calculateAllTotals(cartItems, promoCode)
  - validatePromoCode(code)
  - formatCurrency(amount)
  - getShippingDisplayText(promoCode)

Dependencies:
  - SHIPPING_COST, VALID_PROMO_CODES from constants

Used By:
  - CartContext (client)
  - create-order API (server)
  - Checkout page

Risk Level: HIGH
  - Must remain identical between client/server
  - Any change affects pricing display AND order totals
```

### `apiResponse.js` - Response Standardization
```
Purpose: Consistent API response format
Main Exports:
  - successResponse(data, message, status)
  - errorResponse(error, code, status)
  - validationError(message)
  - unauthorizedError(message)
  - forbiddenError(message)
  - notFoundError(resource)
  - internalError(error)

Used By:
  - Webhook handlers
  - Revalidation API

Risk Level: LOW
  - Format changes affect API consumers
```

### `kashier.js` - Payment Gateway Crypto
```
Purpose: Web Crypto API for Kashier payment signatures
Main Exports:
  - generatePaymentHash(orderId, amount, currency)
  - verifyWebhookSignature(data, receivedSignature)

Used By:
  - /api/create-order
  - /api/webhooks/kashier
  - /app/actions/kashier.js

Risk Level: CRITICAL
  - Signature errors = payment failures
  - Must use Web Crypto API (Node crypto not available on edge)
```

### `designRegistry.js` - Dynamic Section Loader
```
Purpose: Maps layout config to actual component imports
Main Export:
  - DESIGN_REGISTRY: Object mapping section types to dynamic imports

Registry Entries:
  - HERO_SECTION: MODERN_SLIDER / EDITORIAL_CENTERED
  - FEATURED_SECTION: IMDB_STYLE
  - TOP_TEN_SECTION: TOP_TEN_LIST
  - MARQUEE_SECTION: PRODUCTS_SLIDER
  - BEST_SELLERS_SECTION: BEST_SELLERS_GRID
  - EXCLUSIVE_OFFERS_SECTION: PREMIUM_CARDS
  - COLLECTIONS_SPOTLIGHT: POSTER_COLLECTIONS
  - CIRCULAR_COLLECTIONS: CIRCULAR_COLLECTIONS_DESIGN
  - TOP_RATED_WEEKLY_SECTION: DYNAMIC_RATING_GRID
  - MOST_LIKED_WEEKLY_SECTION: DYNAMIC_LIKES_GRID
  - TOP_RATED_ALL_TIME_SECTION: DYNAMIC_RATING_GRID_ALL_TIME
  - MOST_LIKED_ALL_TIME_SECTION: PREMIUM_GRID_ALL_TIME
  - TABBED_HIGHLIGHTS_SECTION: TABBED_TABS_DESIGN
  - BANNER_PRODUCT_GRID_SECTION: BANNER_EDITORIAL_DESIGN
  - VISUAL_BREAK_SECTION: DARK_PROMO_DESIGN
  - CUSTOMER_REVIEWS_SECTION: CUSTOMER_REVIEWS_DESIGN
  - FLOATING_COLLECTIONS_SECTION: FLOATING_COLLECTIONS_DESIGN

Used By:
  - HomeSectionsMain.js (renders homepage sections)

Risk Level: MEDIUM
  - Adding new sections requires registry update
  - Missing entries = blank sections on homepage
```

### `useLocalLoading.js` - Component Loading State
```
Purpose: Local loading states (buttons, forms)
Main Exports:
  - useLocalLoading(initialState)
    Returns: { isLoading, setIsLoading, startLoading, stopLoading, withLoading }

Used By:
  - Form submissions
  - Button actions
  - NOT for page-level loading (GlobalLoader handles that)

Risk Level: LOW
```

### `SkeletonLoaders.jsx` - Loading UI Components
```
Purpose: Skeleton screens for loading states
Main Exports:
  - SkeletonGrid(columns, rows)
  - SkeletonCard()
  - SkeletonHero()
  - SkeletonText(lines)

Used By:
  - Components awaiting data
  - GlobalLoader receding transition

Risk Level: LOW
```

## 2.2 Context Files (`/src/context/`)

### `AuthContext.js` - Authentication State
```
Purpose: Firebase Auth state + user role management
Main Exports:
  - AuthProvider (wrapper component)
  - useAuth() hook

Internal Logic:
  1. onAuthStateChanged listener
  2. Fetch user role from "Users" collection
  3. Expose: { user, userData, loading, isAdmin }

External Dependencies:
  - firebase/auth
  - firebase/firestore/lite
  - Users collection (Firestore)

Who Uses This:
  - layout.js (root provider)
  - Admin pages (role check)

Risk Level: HIGH
  - Breaking this locks out admin access
  - isAdmin check relies on userData?.role === 'admin'
```

### `CartContext.js` - Shopping Cart State
```
Purpose: Global cart state with LocalStorage persistence
Main Exports:
  - CartProvider
  - useCart() hook

State:
  - cartItems[] (id, title, price, selectedSize, selectedColor, qty, image)
  - isCartOpen (boolean)
  - appliedPromo (string)
  - discountError (string)

Calculations:
  - Uses cartCalculations.js for all math
  - subtotal, shipping, total (computed values)

Operations:
  - addToCart(product) - merges by id+size+color
  - updateQty(id, size, delta, color)
  - removeFromCart(id, size, color)
  - clearCart()
  - applyPromoCode(code)

Persistence:
  - Loads from localStorage 'wind_cart' on mount
  - Saves to localStorage on every cartItems change

Who Uses This:
  - ProductView (add to cart)
  - CartDrawer (display items)
  - Checkout (order creation)

Risk Level: CRITICAL
  - Cart data loss = lost sales
  - addToCart matches by BOTH size AND color (critical for variants)
```

### `SettingsContext.js` - Site Configuration
```
Purpose: Site-wide settings with visitor counter
Main Exports:
  - SettingsProvider
  - useSettings() hook

SWR Configuration:
  - Admin: fresh=true parameter (bypass cache)
  - Admin: revalidateOnFocus=true
  - Admin: dedupingInterval=5000ms
  - Visitors: dedupingInterval=60000ms

Visitor Counter:
  - Checks sessionStorage 'wind_v_counted'
  - Increments settings.counters.visitors via increment()
  - Only runs once per session

Dependencies:
  - /api/site-settings
  - settings/siteSettings document

Who Uses This:
  - All pages needing site settings
  - Admin dashboard (live counters)

Risk Level: MEDIUM
  - Counter double-counts if sessionStorage cleared
```

### `GlobalLoaderContext.js` - Page Loading Orchestration
```
Purpose: Controls global loading overlay
Main Exports:
  - GlobalLoaderProvider
  - useGlobalLoader() → { isVisible, isReceding, loaderType, pageReady, setPageReady, signalPageReady }
  - usePageReady() → { signalPageReady }

Behavior:
  - Route change: Reset loader state
  - Admin/Checkout: Kill loader immediately (fast display)
  - 8-second max timeout (fail-safe)
  - pageReady signal triggers recede animation

Critical Code:
  ```javascript
  // Line 27-31: Admin/Checkout bypass
  if (pathname?.startsWith("/admin") || pathname?.includes("/checkout")) {
    setIsVisible(false);
    setPageReady(true);
    return;
  }
  ```

Who Uses This:
  - GlobalLoader component
  - All pages (signalPageReady when data loaded)
  - ProductView, CategoryView, HomeSectionsMain

Risk Level: HIGH
  - Loader stuck = site appears frozen
  - Must call signalPageReady() or 8s timeout kicks in
```

## 2.3 Hooks Layer (`/src/hooks/`)

### `useFirestore.js` - Data Fetching Abstraction
```
Purpose: SWR-powered Firestore queries with caching

FETCHERS (Internal):

1. fetchDoc(path)
   - Gets single document
   - Used by: useSiteSettings

2. fetchCollection([path, limitCount, orderField, orderDir])
   - Queries collection with limit
   - Hard limit: 20 if not specified (quota protection)
   - Used by: useProductsList

3. fetchHomepageReviews()
   - Fetches published reviews + product data
   - Batch fetches: Reviews first, then products by handle
   - Used by: useHomepageReviews

4. fetchHomepageProductsSections() [LEGENDARY BATCH FETCHING]
   - 4 parallel queries for ratings/likes data
   - Week calculation: ISO week string (YYYY-W##)
   - Single batch fetch for all product details
   - Smart fill: If < 5 weekly, fill from all-time
   - Returns: { topRatedWeekly, mostLikedWeekly, topRatedAllTime, mostLikedAllTime }

CUSTOM HOOKS (Public API):

1. useSiteSettings()
   - Cache: 5 minutes
   - Revalidate: Never (mutate() forces refresh)
   - Key: 'settings/siteSettings'

2. useProductsList(limitCount=20)
   - Default order: title ASC
   - Key: ['products', limit, 'title', 'asc']

3. useHomepageReviews()
   - Tries /api/homepage-reviews first (KV)
   - Falls back to direct Firestore
   - Cache: 5 minutes

4. useHomepageProductsSections()
   - Tries /api/homepage first (KV)
   - Falls back to fetchHomepageProductsSections()
   - Key: 'homepage-products-sections'
   - RevalidateOnFocus: true (fresh data on return)

5. usePaginatedProducts(categorySlug, limitCount=10, lastVisibleDoc)
   - Cursor-based pagination
   - Queries by: categories array-contains-any [slug, `/slug`]
   - Order: createdAt DESC
   - Cache: 10 minutes
   - Key: `paginated-products-${slug}-${lastDoc?.id || 'start'}`

6. useProduct(id)
   - Tries /api/product/${id} first (KV)
   - Falls back to doc(db, "products", id)
   - Key: `product-${id}`
   - Cache: 1 minute

7. useRelatedProducts(product)
   - Priority 1: metafields.pageCrossSellHandles (manual)
   - Priority 2: collections[0] (auto by category)
   - Priority 3: Random fallback
   - Deduplicates by product ID
   - Returns max 5 products
   - Cache: 10 minutes

8. usePaginatedReviews(productHandle, lastVisibleDoc, filter)
   - Filter options: "all", "images", "5star"
   - Limit: 3 reviews per batch (quota protection)
   - Cache: 10 minutes

Dependencies:
  - swr
  - firebase/firestore/lite
  - @/lib/firebase

Used By:
  - ProductView (useProduct, useRelatedProducts)
  - ProductReviews (usePaginatedReviews)
  - CategoryView (usePaginatedProducts)
  - HomeSectionsMain (useHomepageReviews, useHomepageProductsSections)
  - Admin pages (various)

Risk Level: CRITICAL
  - Deduping intervals control quota usage
  - Wrong intervals = quota exhaustion
  - Cache keys must be unique per query
```

## 2.4 API Routes (`/app/api/`)

### `homepage/route.js` - Homepage Data Aggregation
```
Purpose: Aggregates layout + hero + price-enriched products
Cache Key: 'homepage_data_v1'

Flow:
  1. Try KV cache first
  2. Fetch: homepage/layout_config + homepage/main-hero
  3. Price Enrichment: Extract all product IDs from sections
  4. Batch fetch products (up to 30) for current prices
  5. Merge prices into section data
  6. Store in KV

Output:
  {
    success: true,
    source: 'cache' | 'firebase',
    data: {
      layout: { sections: [...] },
      hero: { slides: [...], categories: [...] }
    }
  }

Headers:
  - X-Cache: HIT | MISS

Used By:
  - HomeSectionsMain (SWR fetcher)

Risk Level: HIGH
  - Price enrichment requires product IDs in layout
  - Missing products = stale prices displayed
```

### `homepage-reviews/route.js` - Review Preview Data
```
Purpose: Latest 10 published reviews with product info
Cache Key: 'homepage_reviews_v1'

Flow:
  1. Try KV cache
  2. Query: Reviews (published, date DESC, limit 10)
  3. Extract unique product handles
  4. Batch fetch products by documentId IN handles
  5. Build productsMap (handle → product data)
  6. Store in KV

Output:
  {
    reviews: [...],
    products: { handle: { id, title, mainImage, ... } }
  }

Used By:
  - useHomepageReviews hook
  - CustomerReviewsSection component

Risk Level: MEDIUM
  - Reviews without matching products = broken links
```

### `product/[id]/route.js` - Single Product Cache
```
Purpose: Cached individual product data
Cache Key: `product_${id}`

Flow:
  1. Try KV cache
  2. Fetch: doc(db, "products", id)
  3. Convert Timestamps to ISO strings
  4. Store in KV (raw data, no formatting)

Output:
  Full product document + id

Used By:
  - useProduct hook
  - Product page SSR

Risk Level: HIGH
  - Timestamp conversion critical for serialization
  - Cache invalidation must trigger on product update
```

### `product-stats/route.js` - Review Statistics
```
Purpose: Cached review stats per product
Cache Key: `product_stats_${handle}`

Flow:
  1. Try KV cache
  2. Fetch: doc(db, "ProductStats", handle)
  3. Calculate: rating = totalRatingSum / totalCount
  4. Return: { count, rating, handle }
  5. Default: { count: 0, rating: 5 }

Used By:
  - ProductCard (review stars)
  - ProductReviews (stats display)

Risk Level: HIGH
  - Stats out of sync = wrong star ratings
  - Must invalidate on new review
```

### `site-settings/route.js` - Global Settings
```
Purpose: Site-wide configuration + counters
Cache Key: 'site_settings_v1'

Query Params:
  - fresh=true (admin only, bypass cache)

Flow:
  1. If !fresh: try KV cache
  2. Fetch: doc(db, "settings", "siteSettings")
  3. Store in KV (unless fresh request)

Output:
  { success: true, source: 'cache'|'firebase', data: settingsDoc }

Used By:
  - SettingsContext (SWR)

Risk Level: MEDIUM
  - Counters (visitors, orders) may be stale
  - Admin uses fresh=true for live data
```

### `create-order/route.js` - Order Creation & Email
```
Purpose: Creates Kashier payment or sends order email

Payment Method: 'card'
  1. Generate payment hash (HMAC SHA256)
  2. Return iframeData for Kashier iFrame
  3. NO database write (webhook handles it)

Payment Method: 'cod' | 'instapay'
  1. Generate order number (WND-YYYYMMDD-TTTT)
  2. Send email via Resend REST API
  3. Return success

Email Template:
  - Dark theme (matches site)
  - Order summary with items table
  - Customer details
  - Payment method display

Dependencies:
  - KASHIER_MERCHANT_ID, KASHIER_API_KEY (env)
  - RESEND_API_KEY (env)
  - NEXT_PUBLIC_BASE_URL (env)

Used By:
  - Checkout page (handleSubmit)

Risk Level: CRITICAL
  - Hash generation errors = payment failures
  - Email failure doesn't block order (logged only)
```

### `webhooks/kashier/route.js` - Payment Webhook
```
Purpose: Handle Kashier payment success/failure

Security:
  1. Rate limiting (15 req/min per IP)
  2. Replay attack protection (processedOrders Set)
  3. Signature verification (verifyWebhookSignature)

On Payment Success (event='pay', status='SUCCESS'):
  1. Update Orders/${orderId}: Financial Status = "paid"
  2. Update Customers/${customerId}: Total Orders++, Total Spent+
  3. Update settings counters: orders++, sales += Total

Duplicate Protection:
  - Checks existing Financial Status
  - Skips if already "paid"

Used By:
  - Kashier webhook POST

Risk Level: CRITICAL
  - Webhook failure = order not marked paid
  - Duplicate processing = double order count
```

### `kashier-callback/route.js` - Payment Redirect
```
Purpose: Handle redirect after payment completion

Flow:
  1. Extract: paymentStatus, orderId, amount, signature
  2. Verify signature (if provided)
  3. Redirect: SUCCESS → /checkout/success
  4. Redirect: FAILURE → /checkout/failed

Signature Check:
  - Creates expectedSig from orderId.amount.currency.paymentStatus
  - Compares to receivedSig
  - Mismatch = tampering detected → redirect to failed

Used By:
  - Kashier redirect (GET)

Risk Level: HIGH
  - Signature mismatch blocks legitimate payments
  - Wrong redirect URL = customer confusion
```

### `revalidate/route.js` - Cache Invalidation (UNIFIED)
```
Purpose: Single endpoint for ALL cache invalidation

Types:
  - 'homepage' → delete 'homepage_data_v1'
  - 'product' + id → delete `product_${id}`, 'homepage_data_v1', optionally `product_stats_${handle}`
  - 'product_stats' + handle → delete stats, homepage_data, homepage_reviews, optionally product
  - 'likes' + id → delete product, stats
  - 'collection' + slug → delete `collection_${slug}`, homepage_data
  - 'site_settings' → delete 'site_settings_v1'
  - 'all' → list all KV keys, delete all

Next.js Revalidation:
  - Calls revalidatePath() for affected routes

Used By:
  - ProductView (like updates)
  - ProductCard (like updates)
  - ProductReviews (new review)

Risk Level: HIGH
  - Incorrect type/id = stale cache persists
  - 'all' type clears EVERYTHING (use carefully)
```

### `upload/route.js` - ImageKit Auth
```
Purpose: Generate ImageKit upload authentication params

Flow:
  1. Validate ImageKit env vars
  2. Generate auth params using imagekit.getAuthenticationParameters()
  3. Return: { token, expire, signature }

Used By:
  - ImageUploader component

Risk Level: MEDIUM
  - Expired signatures = upload failures
```

### `grant-access/route.js` - Password Protection
```
Purpose: Set access cookie for maintenance mode bypass

Flow:
  1. Set cookie 'wind_site_access' = 'granted'
  2. Max age: 30 days
  3. HttpOnly: true

Used By:
  - page.js (password form submit)

Risk Level: LOW
```

### Invalidate Routes (Specific)
All use `kvDelete` or `kvDeleteMany` + `revalidatePath()`:

- `invalidate-homepage/route.js` → `homepage_data_v1`
- `invalidate-product/route.js` → `product_${id}`, `homepage_data_v1`, optional `product_stats_${handle}`
- `invalidate-collection/route.js` → `collection_${slug}`, `homepage_data_v1`
- `invalidate-settings/route.js` → `site_settings_v1`
- `invalidate-stats/route.js` → Requires REVALIDATE_SECRET, `product_stats_${handle}`

**DEPRECATION NOTICE:** These are superseded by `/api/revalidate` but kept for backward compatibility.

## 2.5 Page Components

### `page.js` (Homepage/Maintenance)
```
Purpose: Password-protected maintenance page OR full homepage

Logic:
  1. Check password input ("271117")
  2. On success: POST /api/grant-access, show HomeSectionsMain
  3. On fail: Show error briefly

State:
  - password, isAuthorized, showError

Used Components:
  - HomeSectionsMain (lazy loaded)

Risk Level: MEDIUM
  - Hardcoded password in source
  - Must change before production release
```

### `products/[id]/page.js` - Product Page (SSR)
```
Purpose: Server-side product page with SEO

Server Functions:

1. getProductData(id) [CACHED]
   - Priority 1: Static products (src/lib/products.js)
   - Priority 2: KV Cache (`product_${id}`)
   - Priority 3: Firebase fetch + KV store
   - Converts Timestamps to ISO strings

2. generateMetadata({ params })
   - Calls getProductData
   - Returns: title, description, keywords, OpenGraph
   - SEO source: product.seo?.title || product.title
   - Description: product.seo?.description || cleaned description

3. Page Component (async)
   - Calls getProductData
   - Generates JSON-LD structured data (Schema.org Product)
   - Sanitizes product data (JSON.parse(JSON.stringify()))
   - Renders ProductView

Props Passed:
  - initialProduct: sanitized product data
  - sourceCategory: from searchParams.cat

Risk Level: CRITICAL
  - SSR failure = 404/blank page
  - Timestamp conversion errors break serialization
  - SEO metadata affects search rankings
```

### `products/[id]/ProductView.js` - Product Detail Client
```
Purpose: Full product page with interactions

State:
  - product (merged from props + SWR)
  - selectedSize, selectedColor, quantity
  - activeImage, activeIdx
  - isWishlisted, realLikesCount
  - isGalleryOpen, galleryIdx, isZoomed
  - isSizeGuideOpen, isDescModalOpen
  - isQuickViewOpen
  - relatedProducts[]
  - realRating, realReviewsCount

Data Flow:
  1. Receive initialProduct from SSR
  2. useProduct(id) for live updates
  3. Merge: fbProduct > staticProd > initialProduct
  4. useRelatedProducts(activeProduct) for suggestions

Key Interactions:

1. Like System (Debounced)
   ```javascript
   // Optimistic update (immediate UI)
   // Debounced 1.5s (pendingActionRef)
   // Firebase write only if netChange !== 0
   // Calls /api/revalidate after Firebase success
   ```

2. Gallery
   - Touch swipe support (heroTouchStartX ref)
   - Fullscreen modal with zoom
   - Color-swatch image switching

3. Add to Cart
   - Validates size/color selection
   - Calls CartContext.addToCart()
   - Quantity selector

Effects:
  - Disable body scroll on modal open
  - Reset quantity on product change
  - Signal page ready when loaded

Who Uses This:
  - products/[id]/page.js

Risk Level: CRITICAL
  - Debounced like logic complex (timing bugs possible)
  - Gallery touch events must not conflict
  - Size/color selection required before add to cart
```

### `collections/[slug]/page.js` - Collection Page (SSR)
```
Purpose: Server-side collection/category page

Server Functions:

1. serializeData(obj)
   - Recursively converts Firebase Timestamps to ISO strings
   - Handles nested objects and arrays

2. getCategoryData(slug) [CACHED]
   - Try KV: `collection_${slug}`
   - Query: collections where slug == slug (or `/slug` for legacy)
   - Store in KV

3. generateMetadata({ params })
   - Title: category.seoTitle || category.name || formatted slug
   - Description: category.seoDescription || fallback

4. Page Component (async)
   - Fetches category data
   - Generates JSON-LD (CollectionPage schema)
   - Renders CategoryView

Props Passed:
  - initialSlug: slug
  - initialCategoryData: serialized category

Risk Level: HIGH
  - Slug normalization (with/without /) affects queries
  - Serialization must handle all Timestamp types
```

### `collections/[slug]/CategoryView.js` - Collection Grid Client
```
Purpose: Product grid with infinite scroll

Constants:
  - PAGE_SIZE = 12 (products per batch)

State:
  - products[]
  - categoryData
  - loading, loadingMore
  - lastDoc (pagination cursor)
  - hasMore (boolean)
  - isSeoExpanded

Data Flow:
  1. Receive initialCategoryData from SSR
  2. usePaginatedProducts(slug, PAGE_SIZE) for first batch
  3. Update state from SWR data

fetchMore() - Manual Pagination:
  - Special slugs handled differently:
    - 'top-rated-all-time' | 'top-rated-weekly' → orderBy("rating", desc)
    - 'most-liked-all-time' → orderBy("likesCount", desc)
    - 'most-liked-weekly' → where("currentWeekId", weekStr) + orderBy("weeklyLikesCount")
    - Others → where("categories", array-contains-any, [slug, `/slug`])
  - Uses startAfter(lastDoc) for cursor
  - Appends results to products[]

Grid:
  - 2 cols mobile / 3 cols md / 4 cols lg
  - ProductCard for each item
  - sourceCategory passed for breadcrumb

Empty State:
  - "لا توجد قطع متوفرة..." message
  - Link back to homepage

SEO Section:
  - bottomDescription with "Read More" toggle
  - Gradient fade on collapsed

Risk Level: MEDIUM
  - fetchMore bypasses SWR (manual Firestore calls)
  - Week calculation must match server-side
  - Missing lastDoc = duplicate products
```

### `checkout/page.js` - Checkout Form
```
Purpose: Multi-step checkout with payment integration

Components:
  - KashierIframeModal (for card payments)
  - InputField wrapper

State:
  - formData (email, names, address, phone, governorate, etc.)
  - paymentMethod ('card', 'cod', 'instapay')
  - loading, submitError
  - errors (validation)
  - iframeData (Kashier params)
  - discountCode, summaryOpen

Ref Strategy (Critical):
  ```javascript
  activeOrderIdRef.current  // Stable for page lifetime
  isOrderSubmittedRef.current  // Prevents abandoned cart radar
  lastSavedDraftRef.current  // Deduplication for draft saves
  ```

Abandoned Cart Radar:
  - Triggers: valid email OR valid phone
  - Debounce: 5 seconds
  - Saves to Orders/${activeOrderId} with status="abandoned"
  - Also creates/updates Customers/${customerId}

Order Submission Flow:

1. Card Payment:
   - POST /api/create-order with iframeData
   - Store pendingOrder in localStorage
   - Show KashierIframeModal
   - Webhook will finalize

2. COD/InstaPay:
   - Create Order (setDoc with merge)
   - Update counters (orders++, sales+=total)
   - Update Customer (orders++, spent+=total, segments)
   - If new customer: increment settings.counters.customers
   - POST /api/create-order (sends email)
   - Clear cart, redirect to /thank-you

Payment Methods UI:
  - Card: Shows payment icons (Apple Pay, Mastercard, Visa, Meeza, Amex)
  - COD: Simple radio option
  - InstaPay: Shows instructions + WhatsApp button

Validation:
  - Required: email, firstName, address, city, phone (11 digits)

Risk Level: CRITICAL
  - Double order creation if refs lost
  - Counter increment must be idempotent (sessionStorage flags)
  - Card payment relies on webhook (may never arrive)
```

## 2.6 Component Files

### `components/HomeSectionsMain.js` - Homepage Section Renderer
```
Purpose: Dynamic homepage composition based on layout config

Data Sources:
  1. /api/homepage → layout.sections + hero
  2. useHomepageProductsSections() → ratings/likes bundles
  3. useHomepageReviews() → customer reviews

Section Rendering:
  ```javascript
  layoutConfig.map(section => {
    const SectionCategory = DESIGN_REGISTRY[section.category];
    const Component = SectionCategory[section.designId];
    
    // Data injection:
    if (section.category === "HERO_SECTION") sectionData = heroData;
    else if (["FEATURED_PRODUCTS", "TOP_RATED"].includes(...)) 
      sectionData = { ...section.data, bundle: homeSectionsData };
    else if (section.category === "CUSTOMER_REVIEWS_SECTION")
      sectionData = { ...section.data, reviews, products };
    
    return <Component key={...} data={sectionData} />;
  })
  ```

Page Ready Logic:
  - Waits for layout + hero data
  - Preloads first hero image
  - Calls signalPageReady() when ready

Optimization:
  - useMemo for renderedSections (prevents re-render on data stable)

Risk Level: HIGH
  - DESIGN_REGISTRY lookup failures = blank sections
  - Missing bundle data = empty product grids
```

### `components/products/ProductReviews.js` - Review System
```
Purpose: Display, filter, and submit product reviews

State:
  - reviews[] (current batch)
  - loading, loadingMore, hasMore, lastDoc
  - filter ('all', 'images', '5star')
  - showAddModal, isSubmitting
  - newReview (name, rating, text, imageUrls)
  - uploadedImages[]
  - localStats { avg, total }
  - hoverRating (for star input)

Stats Fetching (3-Tier):
  1. Try /api/product-stats (KV cache)
  2. Try ProductStats/${handle} (Firestore)
  3. Calculate from all Reviews (fallback, one-time)

Review Fetching:
  - usePaginatedReviews hook for first batch
  - fetchMoreFromFirebase() for subsequent batches
  - Limit: 3 per batch (quota protection)

New Review Submission:
  1. Upload images (ImageUploader)
  2. addDoc to Reviews collection
  3. Update ProductStats (increment count, sum)
  4. POST /api/revalidate (type: 'product_stats')
  5. Clear sessionStorage cache key
  6. mutate() SWR keys for instant UI update
  7. Optimistic UI update (prepend to reviews[])

Filters:
  - "all": No additional where clause
  - "images": where("hasImages", "==", true)
  - "5star": where("rating", "==", 5)

Image Upload:
  - Uses ImageUploader component
  - Stores URLs in newReview.imageUrls

Risk Level: HIGH
  - Review stats dual-write (Reviews + ProductStats)
  - Must stay in sync or ratings display wrong
  - Image upload failures don't block review submission
```

### `components/products/ProductCard.js` - Product Card
```
Purpose: Grid product display with smart stats

Props:
  - Standard product fields
  - sourceCategory (for breadcrumb context)
  - reviewsCount, rating (may be undefined)

Review Stats Strategy (3-Tier Priority):
  ```javascript
  // Priority 1: Props (from parent/SWR mutate)
  if (props.reviewsCount !== undefined) {
    use props, cache to sessionStorage, return;
  }
  
  // Priority 2: sessionStorage (if < 60s old)
  const cached = sessionStorage.getItem(`wind_stats_${handle}`);
  if (cached && fresh) {
    use cache;
    if (cacheAge > 30s) fetch in background;
    return;
  }
  
  // Priority 3: API fetch
  fetchStats(handle, cacheKey, false);
  ```

Interactions:
  - Quick View (opens modal with full details)
  - Wishlist toggle (with debounced Firebase update)
  - Color swatch selection (updates image)

Like/Heart Feature:
  - LocalStorage persists wishlist state
  - Firebase increment/decrement on toggle
  - Calls /api/revalidate after Firebase update
  - Updates SWR caches via mutate()

Price Display:
  - displayPrice: root price > variant[0].price
  - displayOldPrice: compareAtPrice > oldPrice > variant compareAtPrice
  - Discount: calculated percentage

Category Display:
  - Gets from collections[0] (replaces categories)
  - Formats: capitalize each word

Image Handling:
  - Supports external URLs, CDN paths, local paths
  - Color swatch can trigger image change
  - Lazy loading with fade-in animation

Risk Level: HIGH
  - Review stats logic complex (3-tier priority)
  - Price fallback chain must match checkout
  - Image URL resolution has multiple formats
```

### `components/layout/StoreLayout.js` - Layout Wrapper
```
Purpose: Conditional layout based on route

Logic:
  ```javascript
  const isAdmin = pathname?.startsWith('/admin');
  
  return (
    <>
      {!isAdmin && <Navbar />}
      {!isAdmin && <CartDrawer />}
      <main>{children}</main>
      {!isAdmin && <Footer />}
      {!isAdmin && <ScrollToTop />}
    </>
  );
  ```

Used By:
  - Root layout.js (wraps all pages)

Risk Level: MEDIUM
  - Wrong isAdmin check affects all admin pages
  - Must match middleware logic
```

### `components/LiveTracker.js` - Real-time Session Tracking
```
Purpose: Track active visitors via Firebase RTDB

Logic:
  1. Skip if pathname starts with '/admin'
  2. Create/get session ID from sessionStorage
  3. onDisconnect(sessionRef).remove() (auto-cleanup)
  4. Determine status: browsing < active_cart < checkout < purchased
  5. set() session data with serverTimestamp

Data Stored:
  - path, cartValue, itemsCount, status
  - lastActive, device (Mobile/Desktop)

Dependencies:
  - firebase/database (RTDB)
  - getRtdb() from firebase.js

Risk Level: LOW
  - RTDB has no quota impact
  - onDisconnect handles cleanup automatically
```

### `components/GlobalLoader.js` - Loading Overlay
```
Purpose: Visual feedback during page transitions

Behavior:
  - Returns null for /admin/* and /checkout/* (immediate display)
  - Shows WIND logo + animated progress bar
  - Fades out when isReceding = true
  - Uses CSS animation for smooth exit

Controlled By:
  - GlobalLoaderContext (isVisible, isReceding)

Risk Level: MEDIUM
  - Must not block admin/checkout (business critical)
```

### `components/SWRProvider.js` - SWR Configuration
```
Purpose: Global SWR settings

Configuration:
  - revalidateOnFocus: false (prevents quota drain)
  - dedupingInterval: 60000 (1 minute)
  - shouldRetryOnError: false (prevents error loops)
  - keepPreviousData: true (reduces loading states)

Used By:
  - layout.js (wraps entire app)

Risk Level: HIGH
  - Changing these affects ALL data fetching
  - dedupingInterval too low = quota exhaustion
```

---

# 3. DATA FLOW MAPPING

## 3.1 Homepage Flow

```
User Request → page.js
                    ↓
            Password Check (maintenance mode)
                    ↓
            HomeSectionsMain.js
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
useSWR('/api/homepage')   useHomepageProductsSections()   useHomepageReviews()
    ↓                       ↓                               ↓
/api/homepage            /api/homepage (fallback)        /api/homepage-reviews
    ↓                       ↓                               ↓
KV Cache? ──Yes──▶ Return    KV Cache? ──Yes──▶ Return     KV Cache? ──Yes──▶ Return
    │
    No                      No                              No
    ↓                       ↓                               ↓
Firestore:                Firestore:                      Firestore:
- layout_config           - Batch fetch 4 queries         - Reviews (published)
- main-hero               - Batch fetch products          - Product lookup
    ↓                       ↓                               ↓
Price Enrichment          Return bundles                  Return reviews+products
    ↓
Store in KV
    ↓
Return sections[]
    ↓
DESIGN_REGISTRY lookup per section
    ↓
Render HeroSection, FeaturedToday, BestSellersSection, etc.
    ↓
signalPageReady() → GlobalLoader recedes
```

## 3.2 Product Page Flow

```
User Request → /products/[id]/page.js
                    ↓
            getProductData(id) [SERVER-SIDE]
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
Static Products   KV Cache        Firestore
(products.js)   (product_${id})   (products collection)
    ↓               ↓               ↓
Return immediately  Return         Fetch + Store in KV
                    ↓
            generateMetadata()
                    ↓
            JSON-LD Schema markup
                    ↓
            Render ProductView (client component)
                    ↓
            useProduct(id) [CLIENT-SIDE]
                    ↓
            /api/product/${id} → KV → Firestore fallback
                    ↓
            Merge: fbProduct > static > initialProduct
                    ↓
            useRelatedProducts(product)
                    ↓
            Cross-sell handles → Collections → Random fallback
                    ↓
            signalPageReady() → Display content
                    ↓
            User interactions:
            - Like (debounced → Firebase + revalidate)
            - Size/Color selection
            - Add to Cart → CartContext
            - Gallery navigation
            - Reviews (separate flow)
```

## 3.3 Reviews Flow

```
Initial Load:
ProductReviews mounts
    ↓
fetchGlobalStats() ──▶ /api/product-stats?handle=X
    ↓
KV Cache? ──Yes──▶ Return {count, rating}
    │
    No
    ↓
Firestore: ProductStats/${handle}
    ↓
Exists? ──Yes──▶ Return
    │
    No (first visit)
    ↓
Query all Reviews (published, productHandle=X)
    ↓
Calculate avg + count
    ↓
Store in ProductStats (one-time init)
    ↓
Return stats

Review Submission:
User clicks "Add Review"
    ↓
Modal opens → Form input
    ↓
Image upload (ImageUploader → ImageKit)
    ↓
Submit handler
    ↓
1. addDoc to Reviews collection
2. Update ProductStats (increment count + sum)
3. POST /api/revalidate (type: 'product_stats')
4. Clear sessionStorage
5. mutate() SWR caches
6. Optimistic UI update (prepend review)
    ↓
Reviews list updates instantly
```

## 3.4 Checkout Flow

```
Checkout Page Load:
    ↓
signalPageReady() (immediate for checkout)
    ↓
Generate activeOrderId (WIND-${timestamp}-${random})
    ↓
Form input with 5s debounced save
    ↓
Abandoned Cart Radar (if email/phone valid):
- Create Order with status="abandoned"
- Create/Update Customer

User clicks Submit:
    ↓
Validate form
    ↓
isOrderSubmittedRef.current = true (stops radar)
    ↓
Branch by paymentMethod:

Card:
    ↓
POST /api/create-order (paymentMethod='card')
    ↓
Generate payment hash
    ↓
Return iframeData
    ↓
Show KashierIframeModal
    ↓
User completes payment in iFrame
    ↓
Kashier redirects to callback
    ↓
POST /api/webhooks/kashier
    ↓
Verify signature
    ↓
Update Order: status="paid"
    ↓
Update Customer: orders++, spent+=
    ↓
Update settings counters

COD/InstaPay:
    ↓
Create Order (status="pending")
    ↓
Update counters (if not card)
    ↓
Update Customer
    ↓
POST /api/create-order (sends email)
    ↓
clearCart()
    ↓
Redirect /thank-you?orderId=X
```

---

# 4. FIRESTORE SCHEMA & USAGE

## 4.1 Collections Overview

| Collection | Purpose | Write Frequency | Read Frequency |
|------------|---------|-----------------|----------------|
| products | Product catalog | Low (admin) | Very High (with KV cache) |
| collections | Category metadata | Low | Medium |
| Reviews | Customer reviews | Medium | High (with pagination) |
| ProductStats | Aggregated ratings | Medium | Very High (with KV cache) |
| settings | Site configuration | Low | High (with KV cache) |
| Orders | Purchase records | High | Medium |
| Customers | Buyer profiles | Medium | Medium |
| homepage | Layout configuration | Low | High (with KV cache) |
| Users | Admin accounts | Very Low | Low |
| LiveSessions | RTDB - Active visitors | Continuous | Low |

## 4.2 products Collection

```javascript
{
  id: string,  // Document ID = product handle
  title: string,
  description: string,  // HTML content
  price: string,
  compareAtPrice: string,  // Old price for discount display
  images: string[],  // Array of image URLs
  
  // Variants
  options: [
    { name: "المقاس" | "اللون", values: "S,M,L,XL" | "أحمر,أزرق" }
  ],
  colorSwatches: {
    "أحمر": "#FF0000" | "https://...swatch.jpg"
  },
  
  // Categorization
  collections: string[],  // ["shawls", "new-arrivals"]
  categories: string[],   // Legacy: ["/shawls"]
  
  // SEO
  seo: {
    title: string,
    description: string,
    handle: string
  },
  
  // Inventory
  quantity: number,
  sellOutOfStock: "Yes" | "No",
  
  // Metafields (custom data)
  metafields: {
    pageCrossSellHandles: "product-1,product-2",
    customHtmlSnippet: "<div>...</div>",
    customHtmlPosition: "above_title" | "below_cart" | "below_description"
  },
  
  // Engagement (auto-updated)
  likesCount: number,
  weeklyLikesCount: number,
  currentWeekId: "2026-W17",
  likesUpdatedAt: ISOString,
  
  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Query Patterns:**
- Single product: `doc(db, "products", id)`
- By collection: `where("categories", "array-contains-any", [slug, `/slug`])`
- By ID list: `where(documentId(), "in", ids)` (batch fetch)
- Top rated: `orderBy("rating", "desc")`
- Most liked: `orderBy("likesCount", "desc")`

**Critical Fields:**
- `collections` (new) vs `categories` (legacy) - both supported
- `price` vs `variants[].price` - root price takes priority
- `likesCount` - user-updated via debounced increments

## 4.3 collections Collection

```javascript
{
  id: string,
  name: string,  // Display name
  slug: string,  // URL slug (may have leading / for legacy)
  subtitle: string,  // "WIND ESSENTIALS"
  description: string,  // Short description
  bottomDescription: string,  // SEO long text
  image: string,  // Collection image URL
  seoTitle: string,
  seoDescription: string
}
```

**Query Patterns:**
- By slug: `where("slug", "==", slug)` OR `where("slug", "==", `/slug`)`

## 4.4 Reviews Collection

```javascript
{
  id: string,  // Auto-generated
  productHandle: string,  // Links to product
  reviewerName: string,
  rating: number,  // 1-5
  text: string,
  date: ISOString,
  status: "published" | "pending" | "rejected",
  imageUrls: string[],
  hasImages: boolean,
  source: "website"
}
```

**Query Patterns:**
- By product: `where("productHandle", "==", handle)` + `where("status", "==", "published")`
- By date: `orderBy("date", "desc")`
- With images: + `where("hasImages", "==", true)`
- 5-star only: + `where("rating", "==", 5)`
- Pagination: `limit(3)` + `startAfter(lastDoc)`

**Critical Note:**
- Dual-write with ProductStats (must stay in sync)
- `hasImages` boolean for efficient filtering

## 4.5 ProductStats Collection

```javascript
{
  id: string,  // = productHandle
  totalCount: number,  // Total reviews
  totalRatingSum: number,  // Sum of all ratings (for avg calculation)
  // Future: monthly aggregates, distribution histogram
}
```

**Query Patterns:**
- Single product: `doc(db, "ProductStats", handle)`
- Top rated: `orderBy("totalCount", "desc")` (proxy for popularity)

**Calculation:**
```javascript
const rating = totalCount > 0 ? totalRatingSum / totalCount : 5;
```

**Critical Note:**
- Cache key: `product_stats_${handle}`
- Must invalidate on new review
- First-time access calculates from all Reviews (one-time)

## 4.6 settings Collection

```javascript
{
  id: "siteSettings",
  // Counters (auto-incremented)
  counters: {
    visitors: number,
    orders: number,
    sales: number,  // Total revenue
    customers: number
  },
  
  // Site configuration
  siteName: string,
  contactEmail: string,
  phoneNumber: string,
  socialLinks: {
    facebook: string,
    instagram: string,
    whatsapp: string
  },
  
  // Feature flags
  maintenanceMode: boolean,
  enableReviews: boolean
}
```

**Update Patterns:**
- Visitors: `increment(1)` (with sessionStorage dedup)
- Orders: `increment(1)` (after payment confirmation)
- Sales: `increment(orderTotal)` (atomic with orders)
- Customers: `increment(1)` (first order only, with sessionStorage dedup)

## 4.7 Orders Collection

```javascript
{
  id: string,  // = orderId (WIND-${date}-${time})
  Name: string,  // Duplicate of ID for display
  
  // Customer info
  Email: string,
  Phone: string,
  "Billing Name": string,
  "Shipping Address1": string,
  "Shipping City": string,
  "Shipping Province": string,
  "Shipping Phone": string,
  "Shipping Zip": string,
  
  // Financial
  Subtotal: number,
  Shipping: number,
  Total: number,
  Currency: "EGP",
  "Discount Code": string,  // If applied
  
  // Status
  "Financial Status": "pending" | "pending_payment" | "paid" | "abandoned",
  "Payment Method": "card" | "cod" | "instapay",
  "Payment Reference": string,  // Transaction ID
  
  // Items
  lineItems: [
    {
      name: string,  // "Product Title - Size"
      price: number,
      quantity: number,
      image: string
    }
  ],
  
  // Metadata
  "Created at": string,  // Cairo timezone
  data_source: "WIND_Web",
  
  // Abandoned cart tracking
  abandonedAt: Timestamp,  // If status="abandoned"
  recoveredAt: Timestamp   // If recovered
}
```

**Status Flow:**
1. Abandoned: User entered info but didn't submit
2. Pending/Pending Payment: Order submitted, awaiting payment
3. Paid: Webhook confirmed payment

## 4.8 Customers Collection

```javascript
{
  id: string,  // Email (lowercase) OR cleaned phone number
  
  "First Name": string,
  "Last Name": string,
  Email: string,
  Phone: string,
  
  // Address
  "Default Address Address1": string,
  "Default Address City": string,
  "Default Address Province": string,
  
  // Metrics
  "Total Orders": number,
  "Total Spent": number,
  Last_Order_Status: "New" | "Paid",
  
  // Segmentation
  segments: ["Abandoned_Checkout"] | ["Purchased_Once"] | ["VIP_Customer"],
  hasAbandoned: boolean,
  
  // Metadata
  data_source: "WIND_Web",
  last_active: string  // Cairo timezone
}
```

**Segment Logic:**
- First order: "Purchased_Once"
- Second+ order: "VIP_Customer"
- Abandoned cart (no order): "Abandoned_Checkout"

## 4.9 Users Collection (Admin)

```javascript
{
  id: string,  // Firebase Auth UID
  role: "admin" | "user",
  email: string,
  displayName: string
}
```

**Access Control:**
- `ADMIN_UID` constant must match Auth UID
- `isAdmin` = `userData?.role === 'admin'`

## 4.10 homepage Collection (Layout)

```javascript
{
  id: "layout_config",
  sections: [
    {
      category: "HERO_SECTION",
      designId: "MODERN_SLIDER",
      data: { slides: [...], categories: [...] }
    },
    {
      category: "FEATURED_PRODUCTS",
      designId: "IMDB_STYLE",
      data: { 
        title: "وصل حديثاً",
        cards: [
          { productId: "product-1", title: "...", price: "..." }
        ]
      }
    }
    // ... more sections
  ]
}

{
  id: "main-hero",
  slides: [
    { image: "...", title: "...", subtitle: "...", cta: "...", link: "..." }
  ],
  categories: [
    { name: "...", link: "...", image: "..." }
  ]
}
```

---

# 5. API LAYER ANALYSIS

## 5.1 API Route Reference Table

| Route | Method | Cache Key | Input | Output | Cache Behavior |
|-------|--------|-----------|-------|--------|----------------|
| /api/homepage | GET | homepage_data_v1 | - | {layout, hero} | KV 1st, Firebase fallback |
| /api/homepage-reviews | GET | homepage_reviews_v1 | - | {reviews, products} | KV 1st, Firebase fallback |
| /api/product/[id] | GET | product_${id} | id | product | KV 1st, Firebase fallback |
| /api/product-stats | GET | product_stats_${handle} | ?handle | {count, rating} | KV 1st, Firebase fallback |
| /api/site-settings | GET | site_settings_v1 | ?fresh=true | settings | KV 1st unless fresh=true |
| /api/create-order | POST | - | {paymentMethod, orderId, ...} | iframeData or success | No cache |
| /api/webhooks/kashier | POST | - | Kashier payload | {success} | No cache |
| /api/kashier-callback | GET | - | query params | Redirect | No cache |
| /api/revalidate | POST | - | {type, id, handle, ...} | {revalidated, keys} | Deletes KV keys |
| /api/upload | GET | - | - | {token, expire, signature} | No cache (auth params) |
| /api/grant-access | POST | - | - | {granted: true} + cookie | No cache |
| /api/invalidate-* | POST | Various | Various | {invalidated: true} | Deletes specific keys |

## 5.2 Cache Invalidation Strategy

**Revalidation API Types:**

```javascript
// Homepage only
{ type: 'homepage' }
→ Delete: ['homepage_data_v1']
→ revalidatePath('/')

// Product update
{ type: 'product', id: 'product-1', handle: 'product-1' }
→ Delete: ['product_product-1', 'homepage_data_v1', 'product_stats_product-1']
→ revalidatePath(['/', '/products/product-1'])

// Review submitted
{ type: 'product_stats', handle: 'product-1', id: 'product-1' }
→ Delete: ['product_stats_product-1', 'homepage_data_v1', 'homepage_reviews_v1']
→ Delete optionally: ['product_product-1']
→ revalidatePath(['/', '/products/product-1'])

// Like update
{ type: 'likes', id: 'product-1', handle: 'product-1' }
→ Delete: ['product_product-1', 'homepage_data_v1']
→ Delete optionally: ['product_stats_product-1']
→ revalidatePath('/')

// Collection update
{ type: 'collection', slug: 'shawls' }
→ Delete: ['collection_shawls', 'homepage_data_v1']
→ revalidatePath(['/', '/collections/shawls'])

// Settings update
{ type: 'site_settings' }
→ Delete: ['site_settings_v1']
→ revalidatePath('/')

// Nuclear option
{ type: 'all' }
→ List all KV keys, delete all
→ revalidatePath('/', 'layout')
```

---

# 6. CACHING SYSTEM

## 6.1 KV Cache (Cloudflare KV)

**Characteristics:**
- Edge-distributed (fast globally)
- Eventually consistent
- No quota concerns (unlimited reads)

**Cache Keys:**
```
homepage_data_v1        →  Homepage layout + hero
homepage_reviews_v1     →  Latest 10 reviews + products
product_${id}           →  Single product data
product_stats_${handle} →  Review stats {count, rating}
collection_${slug}      →  Collection metadata
site_settings_v1        →  Global settings + counters
```

**Access Pattern:**
```javascript
// Always try KV first
const cached = await kvGet(key);
if (cached) return cached;

// Fallback to Firebase
const data = await fetchFromFirestore();
await kvSet(key, data);  // Store for next time
return data;
```

## 6.2 SWR Caching (Client-Side)

**Global Config (SWRProvider):**
```javascript
{
  revalidateOnFocus: false,      // Don't refetch on tab return
  dedupingInterval: 60000,       // 1 minute dedupe
  shouldRetryOnError: false,     // Don't retry on error
  keepPreviousData: true         // Show old while loading new
}
```

**Hook-Specific Configs:**

| Hook | dedupingInterval | Revalidate On Focus | Notes |
|------|------------------|---------------------|-------|
| useSiteSettings | 300000 (5min) | false | Manual mutate() refresh |
| useProductsList | default | default | List queries |
| useHomepageReviews | 300000 (5min) | false | Manual refresh only |
| useHomepageProductsSections | 5000 (5s) | true | Allows fresh data on return |
| usePaginatedProducts | 600000 (10min) | false | Deep pagination protected |
| useProduct | 60000 (1min) | false | Single product |
| useRelatedProducts | 600000 (10min) | false | Cross-sell data |
| usePaginatedReviews | 600000 (10min) | false | Review pagination |

**SWR Key Patterns:**
```javascript
'settings/siteSettings'
['products', limit, 'title', 'asc']
'homepage-reviews'
'homepage-products-sections'
`paginated-products-${slug}-${lastDoc?.id || 'start'}`
`product-${id}`
`related-${product.id}`
`reviews-${handle}-${filter}-${lastDoc?.id || 'start'}`
```

## 6.3 SessionStorage Caching (Client-Side)

**Purpose:** Persist review stats across navigation

**Pattern:**
```javascript
const cacheKey = `wind_stats_${handle}`;
const cached = sessionStorage.getItem(cacheKey);

if (cached) {
  const { count, rating, timestamp } = JSON.parse(cached);
  const cacheAge = Date.now() - timestamp;
  
  if (cacheAge < 60000) {
    // Use cached data
  } else if (cacheAge < 30000) {
    // Use cached but refresh in background
  }
}
```

**Keys:**
- `wind_stats_${handle}` - Product review stats
- `wind_v_counted` - Visitor counter dedup
- `wind_live_session` - Live tracking session ID
- `wind_cart` - Cart persistence
- `wind_wishlist` - Wishlist IDs
- `counted_${orderId}` - Order counter dedup
- `cust_counted_${customerId}` - Customer counter dedup

## 6.4 LocalStorage Caching (Long-Term)

**Keys:**
- `wind_cart` - Cart items (survives browser close)
- `wind_wishlist` - Liked product IDs
- `pendingOrder` - Pending card payment data

## 6.5 Cache Invalidation Flow

```
Admin updates product in Firebase
    ↓
Admin calls /api/revalidate (or automatic webhook)
    ↓
Server deletes KV key(s)
    ↓
Server calls revalidatePath()
    ↓
Next.js clears ISR cache
    ↓
Next request hits API
    ↓
API: KV miss → Fetch from Firebase → Store in KV → Return
    ↓
Client SWR: May still show old data until revalidate interval
    ↓
Client: mutate() call forces immediate refresh
```

---

# 7. ADMIN VS STOREFRONT RELATION

## 7.1 Admin Access Control

**Authentication:**
- Firebase Authentication (email/password or OAuth)
- `ADMIN_UID` constant defines super-admin
- `Users` collection stores role for additional admins

**Admin Detection:**
```javascript
// Middleware
const isAdmin = pathname?.startsWith('/admin');

// AuthContext
const isAdmin = userData?.role === 'admin';

// StoreLayout
const isAdmin = pathname?.startsWith('/admin');
// → Hides Navbar, CartDrawer, Footer, ScrollToTop
```

**Cache Behavior for Admin:**
```javascript
// SettingsContext
const url = isAdmin ? "/api/site-settings?fresh=true" : "/api/site-settings";

const swrConfig = {
  revalidateOnFocus: isAdmin,      // Admin: refresh on tab return
  dedupingInterval: isAdmin ? 5000 : 60000  // Admin: 5s vs 60s
};
```

## 7.2 Admin Actions Affecting Storefront

| Admin Action | Storefront Impact | Cache Invalidation |
|--------------|-------------------|-------------------|
| Update product | Price/display changes | /api/invalidate-product |
| Update collection | Category page changes | /api/invalidate-collection |
| New review approved | Rating/stars update | /api/invalidate-stats |
| Update site settings | Global config change | /api/invalidate-settings |
| Update homepage layout | Homepage restructure | /api/invalidate-homepage |
| Product likes (manual) | Popularity ranking | /api/revalidate (type: 'likes') |

## 7.3 Real-Time vs Cached Data

**Real-Time (Admin Only):**
- Site counters (visitors, orders, sales)
- Live sessions (via RTDB)
- Recent orders list

**Cached (Storefront):**
- Product data (1 minute SWR, KV-backed)
- Review stats (KV cache, revalidated on new review)
- Homepage layout (5 minute SWR)
- Site settings (5 minute SWR, admin sees fresh)

**Sync Strategy:**
- Admin edits trigger immediate revalidation
- Storefront sees updates within cache interval OR on next hard refresh
- Critical updates (prices) should trigger immediate revalidate

---

# 8. CRITICAL DEPENDENCY CHAINS

## 8.1 Product Display Chain

```
ProductCard
    ↓
useEffect [stats fetching]
    ↓
    ├─ Priority 1: props.reviewsCount (from parent/SWR)
    ├─ Priority 2: sessionStorage `wind_stats_${handle}`
    └─ Priority 3: /api/product-stats → KV → Firestore
    ↓
Star rating display
```

**Breakage Impact:**
- Missing stats → No star rating shown
- Wrong handle → Stats for wrong product
- Cache desync → Stale ratings

## 8.2 Like System Chain

```
User clicks heart
    ↓
LocalStorage update (immediate)
    ↓
Firebase increment (debounced 1.5s)
    ↓
On success: /api/revalidate (type: 'likes')
    ↓
KV delete: product, stats, homepage
    ↓
SWR mutate() on homepage keys
    ↓
UI updates across all instances
```

**Breakage Impact:**
- Debounce failure → Multiple Firebase writes (quota drain)
- Revalidation failure → Stale like counts
- mutate() failure → Other pages show old count

## 8.3 Review Submission Chain

```
Submit review form
    ↓
1. addDoc to Reviews
2. Update ProductStats (increment)
3. /api/revalidate (type: 'product_stats')
4. Clear sessionStorage
5. SWR mutate() on all homepage keys
6. Optimistic UI update
```

**Breakage Impact:**
- Step 1 fails → Review not saved
- Step 2 fails → Stats out of sync
- Steps 3-5 fail → Other users see stale data
- Step 6 fails → User sees wrong state temporarily

## 8.4 Order Creation Chain

```
Checkout submit
    ↓
Create Order document
    ↓
Update counters (if not card)
    ↓
Update Customer
    ↓
/api/create-order (send email)
    ↓
Clear cart
    ↓
Redirect to thank-you
```

**Breakage Impact:**
- Order not created → Lost sale data
- Counters not updated → Wrong analytics
- Email fails → Silent (order still created)
- Cart not cleared → Customer confusion

## 8.5 Payment Webhook Chain

```
Kashier sends webhook
    ↓
Rate limit check
    ↓
Signature verification
    ↓
Replay attack check (processedOrders Set)
    ↓
Update Order: status="paid"
    ↓
Update Customer: orders++, spent+=
    ↓
Update settings counters
```

**Breakage Impact:**
- Signature fail → Payment not recorded (customer charged, no order)
- Replay check fail → Duplicate order increment
- Order update fail → Order stuck "pending"
- Customer update fail → Wrong customer metrics

---

# 9. RISK & SENSITIVITY ANALYSIS

## 9.1 Critical Risk Areas

### 9.1.1 Firestore Quota Exhaustion

**Symptoms:**
- Reads spike to 50K+/day
- Costs increase dramatically
- Site slows down

**Root Causes:**
- SWR dedupingInterval too low
- Missing KV cache fallbacks
- Infinite loops in useEffect
- No limit on collection queries

**Protection:**
- KV cache on ALL frequent reads
- dedupingInterval minimum 60s (except admin)
- Hard limit 20 on all collection queries (see fetchCollection)
- Rate limiting on webhooks

**Files to Monitor:**
- `/hooks/useFirestore.js` (intervals)
- `/lib/kv-cache.js` (all reads should use this)

### 9.1.2 Cache Desynchronization

**Symptoms:**
- Admin sees new data, storefront sees old
- Prices different on list vs detail page
- Review counts wrong

**Root Causes:**
- Missing revalidation after edit
- KV cache not cleared
- SWR showing stale data

**Protection:**
- Invalidate APIs must clear ALL related keys
- Use mutate() to force SWR refresh
- Call revalidatePath() for Next.js ISR

**Files to Monitor:**
- `/api/revalidate/route.js`
- All invalidate-* routes

### 9.1.3 Double Order Creation

**Symptoms:**
- Duplicate orders in Firebase
- Double counter increments
- Customer charged twice (card)

**Root Causes:**
- User double-clicks submit
- Webhook received twice
- Refs lost on page refresh

**Protection:**
- Submit button disabled during processing
- processedOrders Set in webhook
- isOrderSubmittedRef in checkout
- sessionStorage flags for counters

**Files to Monitor:**
- `/app/checkout/page.js` (submit handler)
- `/api/webhooks/kashier/route.js`

### 9.1.4 Security Vulnerabilities

**Current Protections:**
- Middleware cookie check (maintenance mode)
- Firebase Auth for admin
- HMAC signature verification (payments)
- Rate limiting (webhooks)
- Input validation (checkout form)

**Potential Gaps:**
- No CSRF tokens (may not be needed with same-origin)
- No API rate limiting (except webhooks)
- Hardcoded password in page.js

**Files to Monitor:**
- `/middleware.js`
- `/api/webhooks/kashier/route.js`

### 9.1.5 SEO/Meta Data Failures

**Symptoms:**
- Social share shows wrong image/title
- Search results show "undefined"
- JSON-LD errors in console

**Root Causes:**
- Missing product data in SSR
- Timestamp serialization error
- Missing fallback values

**Protection:**
- Always provide fallback metadata
- serializeData() handles all Timestamp types
- JSON.parse(JSON.stringify()) for safety

**Files to Monitor:**
- `/app/products/[id]/page.js`
- `/app/collections/[slug]/page.js`

## 9.2 What Must NOT Be Changed Blindly

### High Sensitivity:
1. **KV cache key patterns** - Changing breaks all existing cache
2. **SWR key patterns** - Changing causes cache misses
3. **Firestore collection names** - Defined in constants, used everywhere
4. **Order status values** - Used in logic and queries
5. **Payment method strings** - Mapped to display names
6. **Counter increment logic** - Must stay idempotent

### Medium Sensitivity:
1. **Deduping intervals** - Affects quota usage
2. **Pagination batch sizes** - Affects quota and UX
3. **Color/size option names** - Affects filtering/display
4. **Image URL patterns** - Affects image loading

---

# 10. SAFE MODIFICATION RULES

## 10.1 Adding New Features

### New Product Field:
1. Add to Firestore schema (document structure)
2. Update serialization in `products/[id]/page.js` if Timestamp
3. Add to KV cache invalidation if affects display
4. Update ProductView to display new field

### New Homepage Section:
1. Create component in `/components/sections/`
2. Add to DESIGN_REGISTRY
3. Add to layout schema in Firestore homepage collection
4. Update `HomeSectionsMain.js` data injection if needed

### New API Route:
1. Create `route.js` with `dynamic = 'force-dynamic'`
2. Add KV caching if data is read-frequently
3. Document cache key in this file
4. Add to revalidation API if needs invalidation

## 10.2 Modifying Data Fetching

**Changing a Hook:**
- Keep same return shape (backward compatibility)
- Document new dependencies
- Adjust dedupingInterval if needed
- Test with both KV hit and miss scenarios

**Changing an API Route:**
- Maintain response structure
- Keep KV-first pattern
- Update cache key if data shape changes
- Test invalidation still works

## 10.3 Firestore Schema Changes

**Adding a Field:**
- Safe: Add optional field, code handles undefined
- Caution: Adding required field breaks old documents

**Changing a Field Name:**
- Must update ALL queries using that field
- Must update security rules if any
- Consider dual-write period for migration

**Changing Collection Name:**
- Update FIRESTORE_COLLECTIONS constant
- Update ALL references in code
- Plan data migration

## 10.4 Cache Invalidation Testing

**After Any Change:**
1. Verify data in Firebase
2. Check KV cache has old data
3. Trigger invalidation
4. Verify KV cache cleared
5. Request data → Should fetch fresh from Firebase
6. Verify KV cache has new data

**Command to Test:**
```bash
# Clear specific cache
curl -X POST /api/invalidate-product \
  -H "Content-Type: application/json" \
  -d '{"id": "test-product", "handle": "test-product"}'

# Clear all
curl -X POST /api/revalidate \
  -H "Content-Type: application/json" \
  -d '{"type": "all"}'
```

## 10.5 Deployment Checklist

**Before Deploying:**
- [ ] All new env vars added to production
- [ ] KV namespace bound (Cloudflare)
- [ ] Firebase config correct for prod project
- [ ] ImageKit credentials valid
- [ ] Kashier in live mode (not test)
- [ ] Admin UID matches production Firebase user

**After Deploying:**
- [ ] Homepage loads with all sections
- [ ] Product pages render correctly
- [ ] Cart add/remove works
- [ ] Checkout form submits
- [ ] Test payment (card) completes
- [ ] Webhook receives and processes
- [ ] Review submission works
- [ ] Like button updates count
- [ ] Admin panel accessible

---

# MENTAL MODEL OF THE SYSTEM

## How to Think About WIND Shopping

### 1. It's a Cache-First Architecture
**Primary Rule:** Always check KV before Firebase. The KV layer is not an optimization—it's a quota protection mechanism. Treat Firestore as the source of truth but the cache as the primary data path.

**Developer Habit:** When adding a new data fetch, ask:
- Does this need caching?
- What's my cache key?
- When does it invalidate?

### 2. Everything is Eventually Consistent
User A sees cached data. Admin updates product. User A may see old data for up to the cache TTL. This is by design for quota protection. Don't fight it—embrace it and design for it.

### 3. The Debounce Pattern is Everywhere
Likes, abandoned cart saves, form inputs—all use debouncing. This isn't just for UX; it's for quota protection. Never write to Firestore on every keystroke or click.

### 4. Dual Writes are Intentional
Reviews writes to both `Reviews` and `ProductStats`. This denormalization is for query performance. Accept that denormalization requires careful invalidation.

### 5. The Edge Runtime is a Different World
Server components and API routes run in a constrained environment. No Node.js crypto. No filesystem. Use Web Crypto API. Use `firebase/firestore/lite` (not regular).

### 6. SWR is Your Cache Orchestrator
Don't manually manage cache state. Let SWR handle it. Configure deduping intervals appropriately. Use `mutate()` to trigger updates across the app.

### 7. Firebase RTDB is for Live Data Only
Use it for LiveTracker sessions. Never use it for persistent data (no quota benefit there, and it's harder to query). The `onDisconnect` feature is magical—use it.

### 8. Security is Layered
- Middleware: Cookie check (basic access)
- AuthContext: Firebase Auth + role check
- Firestore: Security rules (last line of defense)
- API routes: Input validation

### 9. The Quota is Your Enemy
Every read costs money. Every write costs money. The entire caching strategy exists to minimize reads. Before optimizing for speed, optimize for read count.

### 10. Testing is Critical
You cannot see caching bugs in development (no KV). You cannot see Firebase quota issues until production. Test invalidation flows explicitly. Monitor the Firebase console for quota usage.

---

## Common Development Scenarios

**"I updated a product in Firebase but the site still shows old data"**
→ Cache invalidation didn't run. Check if admin panel calls invalidate API. Check if cache key matches.

**"The review stars are wrong"**
→ ProductStats out of sync with Reviews. Check if new reviews update both collections.

**"Checkout is slow"**
→ Expected. Checkout bypasses all loaders for security. The slowness is from Firebase writes (orders, customers, counters).

**"I see quota errors in console"**
→ You've exceeded 50K reads/day. Check SWR intervals. Check for infinite loops. Check for missing KV fallbacks.

**"The like button doesn't update"**
→ Check debounce logic. Check if Firebase update succeeded. Check if revalidate API was called. Check SWR mutate.

---

## Final Reminder

This system is optimized for:
1. **Quota protection** (KV caching, SWR deduping)
2. **Fast initial load** (SSR + edge caching)
3. **Real-time admin experience** (reduced cache for admin)
4. **E-commerce safety** (order deduplication, idempotent counters)

Any change that sacrifices #1 for #2 or #3 must be carefully considered. The current architecture balances all four—change it thoughtfully.

---

**End of System Architecture Documentation**

*Generated for WIND Shopping Development Team*
