# ADMIN DASHBOARD AUDIT - QUICK REFERENCE
**قائمة مرجعية سريعة للمراجع**

---

## 📁 Important Files Map

### Admin Pages
```
src/app/admin/
├── page.js                          🏠 Dashboard (Stats + Live Visitors)
├── orders/
│   ├── page.js                      📋 Orders List + Filtering
│   └── [id]/page.js                 📄 Order Details (N+1 Issue)
├── customers/
│   ├── page.js                      👥 Customers List + Segmentation
│   └── [email]/page.js              👤 Customer Details
├── products/
│   ├── page.js                      📦 Products List
│   └── create/page.js               ➕ Create Product
├── reviews/page.js                  ⭐ Reviews Admin (70+ reads)
├── collections/page.js              🏷️  Collections (Unlimited picker)
├── home-manager/page.js             🎨 Homepage Config (1000+ picker)
├── menu/page.js                     📍 Menu Editor (Recursive tree)
├── live/page.js                     👀 Live Sessions View (RTDB)
├── settings/page.js                 ⚙️  Settings Hub
├── login/page.js                    🔐 Login
└── layout.js                        🎯 MASTER LAYOUT (SWR + Auth)
```

### Library Files
```
src/lib/
├── firebase.js                      🔥 Firebase Init (Firestore + RTDB)
├── firebase-edge.js                 🌐 Edge Runtime Firebase
├── constants.js                     📌 Constants & Collections Names
├── kv-cache.js                      💾 Cloudflare KV Cache
├── writeOptimizer.js                ✍️ Write Optimization
├── firestoreQuota.js                🛡️ Quota Protection
├── cartCalculations.js              🧮 Cart Math
└── rateLimit.js                     ⏱️ Rate Limiting
```

### Context & Hooks
```
src/context/
├── SettingsContext.js               ⚙️ Site Settings + Counters
├── AuthContext.js                   🔑 User Authentication
├── CartContext.js                   🛒 Shopping Cart
└── GlobalLoaderContext.js           ⏳ Loading States

src/hooks/
├── useFirestore.js                  🔥 Firestore Hook (if exists)
└── useLocalLoading.js               ⌛ Local Loading Hook
```

### API Routes
```
src/app/api/
├── site-settings/route.js           📊 Get Site Settings (cached)
├── homepage/route.js                🏠 Homepage Data (cached)
├── homepage-reviews/route.js        ⭐ Homepage Reviews (cached)
├── product/route.js                 📦 Single Product
├── product-stats/route.js           📈 Product Statistics
├── product-stats-batch/route.js     📈 Batch Product Stats
├── create-order/route.js            ✏️ Create Order
├── write-ops/route.js               ✍️ Write Operations
├── revalidate/route.js              🔄 Cache Invalidation
├── idempotency-check/route.js       🛡️ Idempotency Control
├── idempotency-mark/route.js        ✅ Mark Idempotent Operation
├── write-guard-acquire/route.js     🔒 Acquire Write Lock
├── write-guard-check/route.js       👀 Check Write Lock
├── write-guard-release/route.js     🔓 Release Write Lock
├── grant-access/route.js            🔐 Access Control
├── abandoned-cart-save/route.js     🛒 Save Abandoned Cart
├── kashier-callback/route.js        💳 Payment Callback
└── upload/route.js                  📸 Image Upload
```

---

## 🗄️ Firebase Collections Reference

### Firestore Collections (14 Total)

```
┌─────────────────────────────────────┐
│  CORE COLLECTIONS (ADMIN USES)      │
└─────────────────────────────────────┘

1. Orders
   └── [Order ID] → Order document
   
2. Customers
   └── [Email/ID] → Customer document
   
3. Reviews
   └── [Review ID] → Review document
   
4. products
   └── [Product ID] → Product document
   
5. collections
   └── [Collection ID] → Collection document
   
6. settings
   ├── siteSettings → Global settings
   └── [Other settings]
   
7. ProductStats
   └── [Product ID] → Statistics

┌─────────────────────────────────────┐
│  SECONDARY COLLECTIONS              │
└─────────────────────────────────────┘

8. homepage
   ├── layout_config → Homepage layout
   └── main-hero → Hero configuration
   
9. pages
   └── [Page ID] → Static pages
   
10. Users
    └── [User UID] → User profile

11. navigationLinks
    └── [Link ID] → Navigation items

12. heroSlides
    └── [Slide ID] → Hero slides

13. marqueeProducts / bestSellers / etc.
    └── [Product references]

14. masterpieceCollections
    └── [Collection ID] → Special collections

┌─────────────────────────────────────┐
│  REALTIME DATABASE (1 PATH)         │
└─────────────────────────────────────┘

LiveSessions (RTDB)
└── [Session ID] → Session info
```

---

## 🔍 Query Patterns Cheat Sheet

### Pattern 1: WHERE + ORDER BY + LIMIT
```javascript
// Orders page
query(
  collection(db, "Orders"),
  where("data_source", "==", "WIND_Web"),
  orderBy("Created at", "desc"),
  limit(20)
)

// Cost: 20 reads
// Cache: None
// Issue: Doesn't cache, repeats on tab switch
```

### Pattern 2: WHERE + LIMIT
```javascript
// Customers page
query(
  collection(db, "Customers"),
  where("data_source", "==", "WIND_Web"),
  limit(20)
)

// Cost: 20 reads
// Cache: SWR ['customers', 'wind']
// Good: Per-tab cache
```

### Pattern 3: PAGINATION (startAfter)
```javascript
// Load more orders
query(
  collection(db, "Orders"),
  where("data_source", "==", "WIND_Web"),
  orderBy("Created at", "desc"),
  limit(20),
  startAfter(lastVisible)
)

// Cost: 20 reads
// Cache: None
// Issue: No cache on pagination
```

### Pattern 4: DUAL FETCH (Promise.all)
```javascript
// Home manager
const [layoutSnap, heroSnap] = await Promise.all([
  getDoc(doc(db, "homepage", "layout_config")),
  getDoc(doc(db, "homepage", "main-hero"))
])

// Cost: 2 reads
// Cache: SWR 'home-config'
// Good: Parallel + cached
```

### Pattern 5: UNLIMITED QUERY (🔴 PROBLEM)
```javascript
// Collections picker
query(collection(db, "products"))

// Cost: ALL products (1000+)
// Cache: None
// Issue: CRITICAL - No limit!
```

---

## 🚀 Performance Metrics

### Page Load Times (Estimated)

| Page | Reads | Time | Notes |
|------|-------|------|-------|
| Dashboard | 2 | 200ms | Fast (SWR) |
| Orders | 20 | 800ms | Medium |
| Customers | 20 | 800ms | Medium (SWR per tab) |
| Reviews | 70 | 2.5s | Slow (many reads) |
| Collections | 1 | 300ms | Fast until picker |
| Collections (Picker) | 1000+ | 15s+ | 🔴 CRITICAL |
| Home Manager | 2 | 400ms | Medium |
| Home Manager (Pickers) | 1000+ | 15s+ | 🔴 CRITICAL |
| Live | 0 | 500ms | Good (RTDB) |

---

## 🔐 Admin Authentication

```javascript
// Location: src/app/admin/layout.js

ADMIN_UID = "jGb9wBMHZfRIQgR9yfbb3rkvzRw2"

Check:
├── getAuth().onAuthStateChanged(user)
├── if (user.uid === ADMIN_UID)
│   └── Allow access
├── else
│   └── Show "منطقة محظورة" message
└── Redirect to /admin/login
```

---

## 💾 SWR Cache Configuration

### Global Config (AdminLayout)
```javascript
<SWRConfig value={{
  revalidateOnFocus: false,        // Don't revalidate on tab focus
  revalidateOnReconnect: false,    // Don't revalidate on reconnect
  dedupingInterval: 300000,        // 5 minutes deduping
  revalidateIfStale: false         // Don't revalidate if stale
}}
/>
```

### Per-Page SWR Keys

| Page | Key | Scope | TTL |
|------|-----|-------|-----|
| Dashboard | `'site-settings'` | Global | 5s (admin) |
| Customers | `['customers', activeTab]` | Per-tab | 300s |
| Collections | `'collections-data'` | Global | 300s |
| Home Manager | `'home-config'` | Global | 300s |
| Menu | `'menu-data'` | Global | 300s |
| Customer Details | `['customer-details', email]` | Per-customer | 300s |

---

## 🔄 Data Flow Patterns

### Pattern A: Direct Firebase (No Cache)
```
Component → Firebase → State → Render
(Cost: Full read every time)
Example: Orders list
```

### Pattern B: SWR Cache Pattern
```
Component → SWR → Cache Hit? → Firebase → State → Render
(Cost: 1 read per 5 minutes)
Example: Customers list
```

### Pattern C: Context + SWR Pattern
```
Component → Context → SWR → Firebase → Context → Render
(Cost: 0 reads if already in context)
Example: Dashboard settings
```

### Pattern D: KV + SWR Pattern
```
Component → SWR → KV Cache → Firestore → SWR → Component
(Cost: 0 reads if KV hit, else Firestore + KV update)
Example: Homepage data
```

---

## ⚠️ Known Issues Reference

| Issue ID | Title | Location | Severity | Fix Time |
|----------|-------|----------|----------|----------|
| ADM-001 | Unlimited Products Picker | Collections/Home | 🔴 | 1-2h |
| ADM-002 | N+1 Product Lookups | Order Details | 🔴 | 30m |
| ADM-003 | Export Without Pagination | Orders Export | 🔴 | 1-2h |
| ADM-004 | No Real-time Stats | Dashboard | 🟠 | 2-3h |
| ADM-005 | Client-Heavy Filtering | All Pages | 🟠 | 4-6h |
| ADM-006 | Inconsistent Cache Keys | Multiple | 🟠 | 1-2h |
| ADM-007 | Stale Segments | Customers | 🟡 | 1-2h |
| ADM-008 | Memory Pressure Live | Live Page | 🟡 | 1h |
| ADM-009 | No Virtual Scrolling | Products/Orders | 🟡 | 2-3h |
| ADM-010 | Unlimited Menu Depth | Menu Page | 🟡 | 1h |

---

## 🎯 Quick Actions

### To Fix Products Picker (ADM-001)
```javascript
// File: src/app/admin/collections/page.js
// Line: ~85

// Change:
const q = query(collection(db, "products"));

// To:
const q = query(collection(db, "products"), limit(50));

// Add pagination if needed
```

### To Fix Order N+1 (ADM-002)
```javascript
// File: src/app/admin/orders/[id]/page.js
// Line: ~42

// Change:
// FOR EACH ITEM: lookup product details

// To:
// Use embedded product images from order lineItems
productImage: order.lineItems?.[0]?.image || null
```

### To Add Real-time Dashboard (ADM-004)
```javascript
// File: src/app/admin/page.js
// Line: ~15

// Add:
useEffect(() => {
  const rtdb = getRtdb();
  const countersRef = ref(rtdb, 'counters');
  onValue(countersRef, (snap) => {
    setStats(snap.val());
  });
}, []);
```

---

## 📊 Quota Calculator

```
Formula:
Total Monthly Reads = (Daily Reads × 30) + Spike Reads

Current (Without Fixes):
├── Daily: 555 reads
├── Spikes: 7500 (from pickers)
├── Spike Days: 5
└── Total: (555 × 30) + (7500 × 5) = 54,150 reads/month

With Fixes:
├── Daily: 555 reads
├── Spikes: 0 (pickers limited)
└── Total: 555 × 30 = 16,650 reads/month

Savings: 67% reduction!
```

---

## 📞 Debug Commands

### Check Firebase Usage
```javascript
// In browser console on /admin

// Get all SWR cache keys
Object.keys(localStorage).filter(k => k.includes('$SWR$'))

// Monitor Firebase calls
db._delegate._settings = { experimentalAutoDetectLongPolling: true }
```

### Monitor KV Cache
```javascript
// Check if KV cache is being used
fetch('/api/site-settings').then(r => r.json().then(d => {
  console.log(d.source) // 'cache' or 'firebase'
}))
```

---

## 🔗 Related Documentation

- [Full Audit Report](./ADMIN_DASHBOARD_AUDIT.md)
- [Architecture Document](./WIND_ARCHITECTURE.md)
- [Firebase Config](./src/lib/firebase.js)
- [Admin Layout](./src/app/admin/layout.js)

---

**Quick Reference Generated:** 19 May 2026  
**Scope:** Admin Dashboard Audit  
**Format:** Quick lookup guide
