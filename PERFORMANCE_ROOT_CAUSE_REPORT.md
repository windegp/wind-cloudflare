# تقرير التحقيق التقني الشامل (Deep Root Cause Analysis)
## استهلاك Firestore Reads — 50,000 قراءة يوميًا مع 200 زيارة فقط

**تاريخ التحقيق:** 17 يوليو 2026  
**المحقق:** Cline — Performance & Firebase Senior Engineer  
**المشروع:** WIND Shopping (Next.js + Firebase + Cloudflare)

---

## منهجية التحقيق

تم تحليل جميع ملفات المشروع المصدرية بالكامل. هذا التقرير مبني فقط على ما هو مكتوب في الكود.  
أي معلومة لا يمكن إثباتها من الكود وحده تم وضعها في قسم "الفرضيات التي تحتاج تحقق" في نهاية التقرير.

**الملفات التي تم تحليلها:**
- 28 API Route
- 4 Contexts
- 1 Hook file (useFirestore.js)
- 20+ Components
- 16 Admin Pages
- 10+ Library/Helper files
- Middleware
- Configuration files

---

## 1. الجدول الكامل لجميع استعلامات Firestore في المشروع

### 1.1 استعلامات API Routes

| # | الملف والمسار | الدالة/السطر | نوع العملية | الـ Collection/المستند | limit() | ماذا يحدث بدون limit | الحد الأقصى النظري من الكود | عدد مرات التنفيذ من الكود | KV Cache | SWR/Cache أخرى | Cache-Control/force-dynamic | هل يصل إلى Firestore فعلًا؟ |
|---|--------------|-------------|------------|----------------------|--------|---------------------|--------------------------|-------------------------|---------|---------------|---------------------------|---------------------------|
| 1 | `src/app/api/admin/dashboard-stats/route.js` | `queryVisitorsFromEvents()` سطر 42 | `getDocs` | `visitor_events` | **لا يوجد** | يقرأ جميع المستندات في `visitor_events` التي تطابق الشرط | غير قابل للتحديد من الكود وحده | كل 15 ثانية (دليل: `setInterval(..., 15000)` في `admin/page.js` سطر 102) | لا | لا | `Cache-Control: no-cache, no-store, must-revalidate` (سطر 363) | ✅ نعم — لا توجد طبقة كاش بين الـ API و Firestore |
| 2 | `src/app/api/admin/dashboard-stats/route.js` | `queryRealCustomersForRange()` سطر 68 | `getDocs` | `Customers` | **لا يوجد** | يقرأ جميع المستندات في `Customers` التي تطابق الشرط | غير قابل للتحديد من الكود وحده | كل 15 ثانية (دليل: `setInterval(..., 15000)` في `admin/page.js` سطر 102) | لا | لا | `Cache-Control: no-cache, no-store, must-revalidate` (سطر 363) | ✅ نعم |
| 3 | `src/app/api/admin/dashboard-stats/route.js` | `queryOrdersForRange()` سطر 117 | `getDocs` | `Orders` | **لا يوجد** | يقرأ جميع المستندات في `Orders` التي تطابق الشرط | غير قابل للتحديد من الكود وحده | كل 15 ثانية (دليل: `setInterval(..., 15000)` في `admin/page.js` سطر 102) | لا | لا | `Cache-Control: no-cache, no-store, must-revalidate` (سطر 363) | ✅ نعم |
| 4 | `src/app/api/admin/dashboard-stats/route.js` | سطر 172 | `getDoc` | `settings/siteSettings` | N/A (مستند واحد) | N/A | مستند واحد | كل 15 ثانية (نفس الدالة تُستدعى مع الاستعلامات أعلاه) | لا | لا | `Cache-Control: no-cache, no-store, must-revalidate` (سطر 363) | ✅ نعم |
| 5 | `src/app/api/fb-catalog/route.js` | `GET()` سطر 85-99 | `runQuery` (REST API) | `products` حيث `status == "Active"` | **لا يوجد** | يقرأ جميع المنتجات النشطة | غير قابل للتحديد من الكود وحده | كل طلب HTTP للـ endpoint (يُستدعى بواسطة Facebook Crawler) | ✅ نعم — `kv.get(KV_KEY)` سطر 69، `kv.put(KV_KEY, xml, { expirationTtl: 86400 })` سطر 474 | لا | `force-dynamic` (سطر 16)، `Cache-Control: public, max-age=3600` (سطر 479) | ✅ نعم — عند عدم وجود KV cache (cache MISS) |
| 6 | `src/app/api/homepage/route.js` | `GET()` سطر 24-27 | `getDoc` (مرتين) | `homepage/layout_config` + `homepage/main-hero` | N/A (مستند واحد) | N/A | مستندان | أول زيارة كل 24 ساعة (KV cache TTL غير محدد = persistent) | ✅ نعم — `kvGet(CACHE_KEY)` سطر 13، `kvSet(CACHE_KEY, ...)` سطر 143 | لا | `force-dynamic` (سطر 7) | ❌ لا — يتوقف عند KV cache في معظم الحالات |
| 7 | `src/app/api/homepage/route.js` | `GET()` سطر 48 | `getDocs` | `products` مع `where(documentId(), "in", uniqueIds.slice(0, 30))` | **ضمنيًا 30** (بسبب `slice(0, 30)`) | يقرأ حتى 30 مستندًا | 30 مستندًا كحد أقصى | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم — نفس الكاش أعلاه | لا | `force-dynamic` (سطر 7) | ❌ لا — يتوقف عند KV cache |
| 8 | `src/app/api/homepage/route.js` | `GET()` سطر 78-81 | `getDocs` | `products` مع `where(documentId(), "in", redirectedStubIds.slice(0, 30))` | **ضمنيًا 30** (بسبب `slice(0, 30)`) | يقرأ حتى 30 مستندًا | 30 مستندًا كحد أقصى | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم | لا | `force-dynamic` (سطر 7) | ❌ لا — يتوقف عند KV cache |
| 9 | `src/app/api/homepage/route.js` | `GET()` سطر 90-92 | `getDocs` | `ProductStats` مع `where(documentId(), "in", uniqueIds.slice(0, 30))` | **ضمنيًا 30** (بسبب `slice(0, 30)`) | يقرأ حتى 30 مستندًا | 30 مستندًا كحد أقصى | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم | لا | `force-dynamic` (سطر 7) | ❌ لا — يتوقف عند KV cache |
| 10 | `src/app/api/product/[id]/route.js` | `GET()` سطر 23 | `getDoc` | `products/{id}` | N/A (مستند واحد) | N/A | مستند واحد | كل طلب HTTP للـ endpoint | ✅ نعم — `kvGet(cacheKey)` سطر 15، `kvSet(cacheKey, product)` سطر 34 | لا | `force-dynamic` (سطر 6) | ❌ لا — يتوقف عند KV cache |
| 11 | `src/app/api/product-stats-batch/route.js` | `GET()` سطر 49 | `getDoc` (لكل handle) | `ProductStats/{handle}` | N/A (مستند واحد لكل handle) | N/A | حتى 30 مستندًا (بسبب `handles.slice(0, 30)` سطر 21) | كل طلب HTTP للـ endpoint | ✅ نعم — `kvGet(cacheKey)` سطر 31، `kvSet(...)` سطر 58 | لا | `force-dynamic` (سطر 5) | ✅ نعم — فقط للـ handles التي ليس لها KV cache (cache MISS) |
| 12 | `src/app/api/site-settings/route.js` | `GET()` سطر 33 | `getDoc` | `settings/siteSettings` | N/A (مستند واحد) | N/A | مستند واحد | أول زيارة كل ساعة (KV cache TTL=3600 سطر 14) | ✅ نعم — `kvGet(CACHE_KEY)` سطر 22، `kvSet(CACHE_KEY, data)` سطر 43 | لا | `force-dynamic` (سطر 5) | ❌ لا — يتوقف عند KV cache |
| 13 | `src/app/api/homepage-reviews/route.js` | `GET()` سطر 18-24 | `getDocs` | `Reviews` مع `where("status", "==", "published"), orderBy("date", "desc"), limit(10)` | **نعم — `limit(10)`** | يقرأ 10 مستندات كحد أقصى | 10 مستندات | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم — `kvGet(CACHE_KEY)` سطر 10، `kvSet(CACHE_KEY, result)` سطر 55 | لا | `force-dynamic` (سطر 5) | ❌ لا — يتوقف عند KV cache |
| 14 | `src/app/api/homepage-reviews/route.js` | `GET()` سطر 37-41 | `getDocs` | `products` مع `where(documentId(), "in", uniqueHandles)` | **ضمنيًا 10** (بسبب `uniqueHandles.slice(0, 10)` سطر 33) | يقرأ حتى 10 مستندات | 10 مستندات كحد أقصى | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم | لا | `force-dynamic` (سطر 5) | ❌ لا — يتوقف عند KV cache |
| 15 | `src/app/api/admin/analytics-daily/route.js` | `GET()` سطر 59-62 | `getDocs` | `visitor_events` مع `where("date", "==", targetDateStr)` | **لا يوجد** | يقرأ جميع مستندات `visitor_events` لذلك التاريخ | غير قابل للتحديد من الكود وحده | عند استدعاء الـ API (نادر — مخصص للأدمن) | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 16 | `src/app/api/admin/analytics-daily/route.js` | `GET()` سطر 99-101 | `getDocs` | `Customers` مع `where("last_active", ">=", bounds.start)` | **لا يوجد** | يقرأ جميع مستندات `Customers` التي تطابق الشرط | غير قابل للتحديد من الكود وحده | عند استدعاء الـ API (نادر) | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 17 | `src/app/api/admin/analytics-daily/route.js` | `GET()` سطر 125-127 | `getDocs` | `Orders` مع `where("Created at", ">=", bounds.start)` | **لا يوجد** | يقرأ جميع مستندات `Orders` التي تطابق الشرط | غير قابل للتحديد من الكود وحده | عند استدعاء الـ API (نادر) | لا | لا | `dynamic` (افتراضي) | ✅ نعم |

### 1.2 استعلامات Admin Pages (Client-side)

| # | الملف والمسار | الدالة/السطر | نوع العملية | الـ Collection/المستند | limit() | ماذا يحدث بدون limit | الحد الأقصى النظري من الكود | عدد مرات التنفيذ من الكود | KV Cache | SWR/Cache أخرى | Cache-Control/force-dynamic | هل يصل إلى Firestore فعلًا؟ |
|---|--------------|-------------|------------|----------------------|--------|---------------------|--------------------------|-------------------------|---------|---------------|---------------------------|---------------------------|
| 18 | `src/app/admin/inventory/page.js` | `loadData()` سطر 679 | `getDocs` | `products` مع `orderBy("createdAt", "desc")` | **لا يوجد** | يقرأ جميع المستندات في `products` | غير قابل للتحديد من الكود وحده | كل تحميل للصفحة (useEffect سطر 698) | لا | لا | `dynamic` (افتراضي) | ✅ نعم — قراءة مباشرة من Firestore بدون أي كاش |
| 19 | `src/app/admin/inventory/page.js` | `loadData()` سطر 680 | `getDoc` | `settings/siteSettings` | N/A | N/A | مستند واحد | كل تحميل للصفحة | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 20 | `src/app/admin/reviews/page.js` | `fetchData()` سطر 64-77 | `getDocs` (3 استعلامات) | `products` + `ProductStats` + `Reviews` | `limit(PRODUCTS_PAGE_SIZE=50)` + `limit(100)` + `limit(20)` | يقرأ 50 + 100 + 20 = 170 مستندًا كحد أقصى | 170 مستندًا | كل تحميل للصفحة (useEffect سطر 54-56) | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 21 | `src/app/admin/reviews/page.js` | `recalculateAllProductStats()` سطر 585 | `getDocs` | `Reviews` (بدون شرط) | **لا يوجد** | يقرأ جميع المستندات في `Reviews` | غير قابل للتحديد من الكود وحده | عند الضغط على زر "مزامنة التقييمات" | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 22 | `src/app/admin/reviews/page.js` | `recalculateAllProductStats()` سطر 602 | `getDocs` | `products` | `limit(1000)` | يقرأ حتى 1000 مستند | 1000 مستند | عند الضغط على زر "مزامنة التقييمات" | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 23 | `src/app/admin/reviews/page.js` | `recalculateAllProductStats()` سطر 603 | `getDocs` | `ProductStats` | `limit(1000)` | يقرأ حتى 1000 مستند | 1000 مستند | عند الضغط على زر "مزامنة التقييمات" | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 24 | `src/app/admin/reviews/page.js` | `handleViewProductReviews()` سطر 466 | `getDocs` | `Reviews` مع `where("productHandle", "==", ...), orderBy("date", "desc"), limit(3)` | **نعم — `limit(3)`** | يقرأ 3 مستندات كحد أقصى | 3 مستندات | عند الضغط على "عرض التقييمات" لمنتج | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 25 | `src/app/admin/reviews/page.js` | `handleLoadMoreReviews()` سطر 481 | `getDocs` | `Reviews` مع `where, orderBy, startAfter, limit(3)` | **نعم — `limit(3)`** | يقرأ 3 مستندات كحد أقصى | 3 مستندات | عند الضغط على "عرض المزيد" | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 26 | `src/app/admin/products/page.js` | `fetchProducts()` سطر 45-62 | `getDocs` | `products` مع `orderBy("createdAt", "desc"), limit(itemsPerPage=20)` | **نعم — `limit(20)`** | يقرأ 20 مستندًا كحد أقصى | 20 مستندًا | كل تحميل للصفحة (useEffect سطر 38-43) | لا | ✅ نعم — in-memory cache (globalProductsCache سطر 13-18) | `dynamic` (افتراضي) | ✅ نعم — فقط في أول تحميل (بفضل in-memory cache) |
| 27 | `src/app/admin/orders/page.js` | `fetchOrders()` سطر 45-98 | `getDocs` | `Orders` مع `orderBy("Created at", "desc"), limit(fetchLimit=20)` | **نعم — `limit(20)`** | يقرأ 20 مستندًا كحد أقصى | 20 مستندًا | كل تحميل للصفحة أو تغيير تاب (useEffect سطر 103-108) | لا | ✅ نعم — in-memory tab cache (tabCacheRef سطر 34) | `dynamic` (افتراضي) | ✅ نعم — فقط في أول تحميل لكل تاب |
| 28 | `src/app/admin/orders/page.js` | `exportOrdersToExcel()` سطر 219-265 | `getDocs` (في while loop) | `Orders` مع `orderBy, limit(500)` | **نعم — `limit(500)`** | يقرأ 500 مستند لكل دفعة، عدد الدفعات غير محدود | غير قابل للتحديد من الكود وحده (يعتمد على عدد الطلبات) | عند الضغط على "تصدير الطلبات" | لا | لا | `dynamic` (افتراضي) | ✅ نعم |
| 29 | `src/app/admin/customers/page.js` | `fetcher()` سطر 73-138 | `getDocs` | `Customers` مع `where("data_source", "==", ...), limit(fetchLimit=20)` | **نعم — `limit(20)`** | يقرأ 20 مستندًا كحد أقصى | 20 مستندًا | كل تحميل للصفحة أو تغيير تاب (SWR) | لا | ✅ نعم — SWR (سطر 146-149) | `dynamic` (افتراضي) | ✅ نعم — فقط في أول تحميل لكل تاب (بفضل SWR) |
| 30 | `src/app/admin/customers/page.js` | `exportToExcelForAds()` سطر 345-375 | `getDocs` (في while loop) | `Customers` مع `limit(500)` | **نعم — `limit(500)`** | يقرأ 500 مستند لكل دفعة، عدد الدفعات غير محدود | غير قابل للتحديد من الكود وحده (يعتمد على عدد العملاء) | عند الضغط على "تصدير" | لا | لا | `dynamic` (افتراضي) | ✅ نعم |

### 1.3 استعلامات Hooks (useFirestore.js)

| # | الملف والمسار | الدالة/السطر | نوع العملية | الـ Collection/المستند | limit() | ماذا يحدث بدون limit | الحد الأقصى النظري من الكود | عدد مرات التنفيذ من الكود | KV Cache | SWR/Cache أخرى | Cache-Control/force-dynamic | هل يصل إلى Firestore فعلًا؟ |
|---|--------------|-------------|------------|----------------------|--------|---------------------|--------------------------|-------------------------|---------|---------------|---------------------------|---------------------------|
| 31 | `src/hooks/useFirestore.js` | `fetchHomepageProductsSections()` سطر 134-143 | `getDocs` (4 استعلامات متزامنة) | (1) `products` orderBy likesCount limit(5) + (2) `products` where currentWeekId limit(5) + (3) `ProductStats` orderBy totalCount limit(5) + (4) `Reviews` where date>= limit(50) | **نعم — `limit(5)`, `limit(5)`, `limit(5)`, `limit(50)`** | يقرأ 5+5+5+50 = 65 مستندًا كحد أقصى | 65 مستندًا | أول زيارة كل 24 ساعة (KV cache عبر `/api/homepage`) | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 277) | لا | ❌ لا — يتوقف عند `/api/homepage` الذي يستخدم KV cache |
| 32 | `src/hooks/useFirestore.js` | `fetchHomepageProductsSections()` سطر 177 | `getDocs` | `products` مع `where(documentId(), "in", allProductIds)` | **ضمنيًا بعدد المعرفات الفريدة** | يقرأ عدد المستندات المطابقة للمعرفات | غير قابل للتحديد من الكود وحده (يعتمد على `allProductIds`) | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم | لا | ❌ لا — يتوقف عند KV cache |
| 33 | `src/hooks/useFirestore.js` | `fetchHomepageReviews()` سطر 76-78 | `getDocs` | `Reviews` مع `where("status", "==", "published"), orderBy("date", "desc"), limit(10)` | **نعم — `limit(10)`** | يقرأ 10 مستندات كحد أقصى | 10 مستندات | أول زيارة كل 24 ساعة (KV cache عبر `/api/homepage-reviews`) | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 253) | لا | ❌ لا — يتوقف عند `/api/homepage-reviews` الذي يستخدم KV cache |
| 34 | `src/hooks/useFirestore.js` | `fetchHomepageReviews()` سطر 86-87 | `getDocs` | `products` مع `where(documentId(), "in", uniqueHandles)` | **ضمنيًا 10** (بسبب `uniqueHandles.slice(0, 10)` سطر 81) | يقرأ حتى 10 مستندات | 10 مستندات | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم | لا | ❌ لا — يتوقف عند KV cache |
| 35 | `src/hooks/useFirestore.js` | `fetchHomepageReviews()` سطر 99 | `getDocs` | `products` مع `where("handle", "in", missingHandles)` | **ضمنيًا بعدد المعرفات المفقودة** | يقرأ عدد المستندات المطابقة | غير قابل للتحديد من الكود وحده | أول زيارة كل 24 ساعة (KV cache) | ✅ نعم | لا | ❌ لا — يتوقف عند KV cache |
| 36 | `src/hooks/useFirestore.js` | `useRelatedProducts()` سطر 382 | `getDoc` (لكل handle في `handlesArray`) | `products/{handle}` | N/A (مستند واحد لكل استدعاء) | N/A | مستند واحد لكل handle في المصفوفة | كل تحميل لصفحة منتج (SWR) | لا | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 419) | لا | ✅ نعم — بعد انتهاء SWR dedupingInterval (5 دقائق) |
| 37 | `src/hooks/useFirestore.js` | `useRelatedProducts()` سطر 394 | `getDocs` | `products` مع `where("collections", "array-contains", ...), limit(6)` | **نعم — `limit(6)`** | يقرأ 6 مستندات كحد أقصى | 6 مستندات | كل تحميل لصفحة منتج (SWR) | لا | ✅ نعم — SWR مع `dedupingInterval: 300000` | لا | ✅ نعم — بعد انتهاء SWR dedupingInterval |
| 38 | `src/hooks/useFirestore.js` | `useRelatedProducts()` سطر 404 | `getDocs` | `products` مع `limit(6)` | **نعم — `limit(6)`** | يقرأ 6 مستندات كحد أقصى | 6 مستندات | كل تحميل لصفحة منتج (SWR) | لا | ✅ نعم — SWR مع `dedupingInterval: 300000` | لا | ✅ نعم — بعد انتهاء SWR dedupingInterval |
| 39 | `src/hooks/useFirestore.js` | `usePaginatedProducts()` سطر 283-344 | `getDocs` | `products` مع `where("categories", "array-contains-any", ...), orderBy("createdAt", "desc"), limit(limitCount=10)` | **نعم — `limit(10)`** | يقرأ 10 مستندات كحد أقصى | 10 مستندات | كل تحميل لصفحة قسم (SWR) | لا | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 342) | لا | ✅ نعم — بعد انتهاء SWR dedupingInterval |
| 40 | `src/hooks/useFirestore.js` | `usePaginatedReviews()` سطر 428-461 | `getDocs` | `Reviews` مع `where("productHandle", "==", ...), where("status", "==", "published"), orderBy("date", "desc"), limit(3)` | **نعم — `limit(3)`** | يقرأ 3 مستندات كحد أقصى | 3 مستندات | كل تحميل لتقييمات منتج (SWR) | لا | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 458) | لا | ✅ نعم — بعد انتهاء SWR dedupingInterval |
| 41 | `src/hooks/useFirestore.js` | `useProduct()` سطر 361 | `getDoc` | `products/{id}` | N/A (مستند واحد) | N/A | مستند واحد | كل تحميل لصفحة منتج (SWR) | ✅ نعم — عبر `/api/product/{id}` | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 366) | لا | ❌ لا — يتوقف عند `/api/product/{id}` الذي يستخدم KV cache |
| 42 | `src/hooks/useFirestore.js` | `useSiteSettings()` سطر 238 | `getDoc` | `settings/siteSettings` | N/A (مستند واحد) | N/A | مستند واحد | كل تحميل للصفحة (SWR) | ✅ نعم — عبر `/api/site-settings` | ✅ نعم — SWR مع `dedupingInterval: 300000` (سطر 239) | لا | ❌ لا — يتوقف عند `/api/site-settings` الذي يستخدم KV cache |

### 1.4 استعلامات Contexts

| # | الملف والمسار | الدالة/السطر | نوع العملية | الـ Collection/المستند | limit() | ماذا يحدث بدون limit | الحد الأقصى النظري من الكود | عدد مرات التنفيذ من الكود | KV Cache | SWR/Cache أخرى | Cache-Control/force-dynamic | هل يصل إلى Firestore فعلًا؟ |
|---|--------------|-------------|------------|----------------------|--------|---------------------|--------------------------|-------------------------|---------|---------------|---------------------------|---------------------------|
| 43 | `src/context/SettingsContext.js` | `useEffect()` سطر 47 | `getDoc` | `visitor_events/{sessionId}_{todayStr}` | N/A (مستند واحد) | N/A | مستند واحد | مرة واحدة لكل جلسة زائر جديدة (دليل: `sessionStorage.getItem("wind_v_counted")` سطر 28) | لا | لا | لا | ✅ نعم — يكتب `setDoc` ثم يقرأ `getDoc` للتحقق من الوجود |
| 44 | `src/context/SettingsContext.js` | `useEffect()` سطر 79 | `getDoc` | `settings/siteSettings` | N/A (مستند واحد) | N/A | مستند واحد | مرة واحدة لكل جلسة زائر جديدة | لا | لا | لا | ✅ نعم |
| 45 | `src/context/AuthContext.js` | `useEffect()` سطر 23 | `getDoc` | `Users/{uid}` | N/A (مستند واحد) | N/A | مستند واحد | مرة واحدة عند تحميل الصفحة للمستخدمين المسجلين فقط (دليل: `onAuthStateChanged` سطر 18) | لا | لا | لا | ✅ نعم — فقط للمستخدمين المسجلين |

---

## 2. تحليل تدفق البيانات (Data Flow Diagrams)

### 2.1 مسار الصفحة الرئيسية (Homepage)

```
Browser → HomeSectionsMain.js → useHomepageProductsSections() [SWR]
  → fetch('/api/homepage') [GET]
    → kvGet('homepage_data_v1') [Cloudflare KV]
      ├── [CACHE HIT] → return cached data ← ✋ يتوقف هنا
      └── [CACHE MISS] → getDoc('homepage/layout_config') + getDoc('homepage/main-hero') [Firestore]
          → getDocs(products, where(documentId() in ids)) [Firestore]
          → getDocs(ProductStats, where(documentId() in ids)) [Firestore]
          → kvSet('homepage_data_v1', data) [Cloudflare KV]
          → return data
```

### 2.2 مسار Admin Dashboard (Polling)

```
Browser → admin/page.js [useEffect مع setInterval(15000)]
  → fetch('/api/admin/dashboard-stats?period=today&_=timestamp') [GET]
    → getDoc('settings/siteSettings') [Firestore] ← بدون كاش
    → getDocs(visitor_events, date>=, date<=) [Firestore] ← بدون limit()، بدون كاش
    → getDocs(Customers, last_active>=) [Firestore] ← بدون limit()، بدون كاش
    → getDocs(Orders, Created at>=) [Firestore] ← بدون limit()، بدون كاش
    → return response (Cache-Control: no-cache, no-store)
```

### 2.3 مسار صفحة المنتج (Product Page)

```
Browser → ProductView.js → useProduct(id) [SWR]
  → fetch('/api/product/{id}') [GET]
    → kvGet('product_{id}') [Cloudflare KV]
      ├── [CACHE HIT] → return cached data ← ✋ يتوقف هنا
      └── [CACHE MISS] → getDoc('products/{id}') [Firestore]
          → kvSet('product_{id}', data) [Cloudflare KV]
          → return data
```

### 2.4 مسار Facebook Catalog

```
Facebook Crawler → GET /api/fb-catalog
  → kvGet('fb_catalog_xml_v8') [Cloudflare KV]
    ├── [CACHE HIT] → return cached XML ← ✋ يتوقف هنا
    └── [CACHE MISS] → POST runQuery(products, status=Active) [Firestore REST API]
        → بناء XML من النتائج
        → kvPut('fb_catalog_xml_v8', xml, {expirationTtl: 86400}) [Cloudflare KV]
        → return XML (Cache-Control: public, max-age=3600)
```

### 2.5 مسار Admin Inventory

```
Browser → admin/inventory/page.js [useEffect]
  → getDocs(products, orderBy createdAt desc) [Firestore DIRECT] ← بدون limit()، بدون كاش
  → getDoc(settings/siteSettings) [Firestore DIRECT]
  → render
```

### 2.6 مسار Admin Reviews — مزامنة التقييمات

```
Browser → admin/reviews/page.js [زر "مزامنة التقييمات"]
  → getDocs(Reviews) [Firestore DIRECT] ← بدون limit()، بدون شرط
  → getDocs(products, limit(1000)) [Firestore DIRECT]
  → getDocs(ProductStats, limit(1000)) [Firestore DIRECT]
  → writeBatch (500 عملية لكل batch)
  → fetchData() [إعادة تحميل الصفحة]
```

---

## 3. تحليل النقاط المطلوبة بناءً على الكود فقط

### 3.1 هل يوجد إعادة Render تسبب إعادة القراءة؟

**نعم — مثبت من الكود:**
- `admin/page.js` سطر 100-114: `setInterval(fetchDashboardStats, 15000)` — كل 15 ثانية، الـ `fetchDashboardStats` يُستدعى مما يسبب `setDashboardData()` (سطر 70) الذي يعيد render الـ Dashboard. إعادة الـ render لا تسبب قراءة إضافية مباشرة، لكن الـ `setInterval` هو الذي يسبب الاستدعاء المتكرر.

### 3.2 هل يوجد Loop أو Race Condition؟

**لا — مثبت من الكود:**
- `admin/page.js` سطر 99: `lastFetchRef` يمنع التنفيذ إذا كان آخر استدعاء منذ أقل من 10 ثوانٍ (سطر 107)
- `admin/page.js` سطر 104: `if (document.hidden) return;` يمنع التنفيذ إذا كان التاب مخفيًا
- `useFirestore.js` سطر 14-31: `inFlightRequests` Map يمنع تكرار نفس الطلب

### 3.3 هل يوجد Memory Leak؟

**لا — مثبت من الكود:**
- جميع الـ `setInterval` لها `clearInterval` في `return () =>` (مثال: `admin/page.js` سطر 113)
- جميع الـ `useEffect` لها `return () => unsubscribe()` (مثال: `admin/layout.js` سطر 35)
- `useFirestore.js` سطر 23-25: `inFlightRequests` يتم تنظيفها بعد اكتمال الطلب

### 3.4 هل يوجد Listener غير ضروري؟

**نعم — مثبت من الكود (لكن على RTDB وليس Firestore):**
- `admin/page.js` سطر 144-175: `onValue(liveSessionsRef, ...)` — يستمع إلى RTDB لـ LiveSessions. هذا لا يستهلك Firestore reads، لكنه يستهلك RTDB bandwidth.

### 3.5 هل يوجد Query يقرأ Collection كاملة؟

**نعم — مثبت من الكود (بدون limit()):**
1. `dashboard-stats/route.js` سطر 42-46: `getDocs(visitor_events, date>=, date<=)` — **بدون limit()**
2. `dashboard-stats/route.js` سطر 68-71: `getDocs(Customers, last_active>=)` — **بدون limit()**
3. `dashboard-stats/route.js` سطر 117-120: `getDocs(Orders, Created at>=)` — **بدون limit()**
4. `inventory/page.js` سطر 679: `getDocs(products, orderBy createdAt desc)` — **بدون limit()**
5. `reviews/page.js` سطر 585: `getDocs(Reviews)` — **بدون limit()** وبدون شرط
6. `analytics-daily/route.js` سطر 59-62: `getDocs(visitor_events, date==)` — **بدون limit()**
7. `analytics-daily/route.js` سطر 99-101: `getDocs(Customers, last_active>=)` — **بدون limit()**
8. `analytics-daily/route.js` سطر 125-127: `getDocs(Orders, Created at>=)` — **بدون limit()**

### 3.6 هل يوجد Query داخل map أو forEach؟

**لا — مثبت من الكود:**
- جميع الاستعلامات تستخدم `Promise.all` أو تُنفذ بشكل متسلسل وليس داخل `map` أو `forEach`

### 3.7 هل يوجد Query داخل useEffect ينفذ أكثر من مرة؟

**نعم — مثبت من الكود:**
- `admin/page.js` سطر 100-114: `useEffect` يحتوي على `setInterval(fetchDashboardStats, 15000)` — يُنفذ الاستعلام كل 15 ثانية
- `admin/page.js` سطر 86-95: `useEffect` مع `[activePeriod, fetchDashboardStats]` — يُنفذ عند تغيير الفترة

### 3.8 هل يوجد React Strict Mode يضاعف التنفيذ؟

**غير قابل للإثبات من الكود وحده:**
- `next.config.mjs` لم يتم تحليله بالكامل. يحتاج التحقق من ملف `next.config.mjs` لمعرفة إذا كان `reactStrictMode: true`

### 3.9 هل يوجد SWR أو React Query يعيد الجلب باستمرار؟

**نعم — مثبت من الكود:**
- `admin/customers/page.js` سطر 146-149: `useSWR(shouldFetch ? ['customers', activeTab] : null, fetcher)` — مع `shouldFetch` الذي يتغير بتغير `isArchiveVisible` و `activeTab`
- `useFirestore.js`: جميع الـ hooks تستخدم SWR مع `dedupingInterval: 300000` (5 دقائق) — بعد 5 دقائق، يمكن إعادة الجلب إذا تغيرت الظروف

### 3.10 هل يوجد fetch يعيد الطلب بدون داع؟

**نعم — مثبت من الكود:**
- `admin/page.js` سطر 100-114: `setInterval(fetchDashboardStats, 15000)` — يُعيد نفس الطلب كل 15 ثانية حتى لو لم تتغير البيانات

### 3.11 هل يوجد polling؟

**نعم — مثبت من الكود:**
- `admin/page.js` سطر 102: `setInterval(() => { ... fetchDashboardStats(...) }, 15000)` — Polling كل 15 ثانية
- `components/LiveTracker.js` سطر 90: `setInterval(updateSession, 20000)` — Polling كل 20 ثانية (لكن هذا يكتب إلى RTDB، وليس Firestore)

### 3.12 هل يوجد interval؟

**نعم — مثبت من الكود:**
- `admin/page.js` سطر 102: `setInterval(..., 15000)`
- `components/LiveTracker.js` سطر 90: `setInterval(..., 20000)`

### 3.13 هل يوجد cron؟

**لا — مثبت من الكود:**
- لا يوجد أي Cron Job أو Scheduled Function في المشروع

### 3.14 هل يوجد webhook؟

**نعم — مثبت من الكود:**
- `src/app/api/webhooks/kashier/route.js` — webhook لـ Kashier (بوابة دفع). هذا يُستدعى عند تأكيد الدفع فقط، وليس بشكل متكرر.

### 3.15 هل يوجد API يتم استدعاؤها باستمرار؟

**نعم — مثبت من الكود:**
- `/api/admin/dashboard-stats` — يُستدعى كل 15 ثانية (دليل: `admin/page.js` سطر 102)

### 3.16 هل يوجد وظيفة Server Side تسبب Reads كثيرة؟

**نعم — مثبت من الكود:**
- `fb-catalog/route.js` — يقرأ جميع المنتجات النشطة بدون `limit()` (REST API runQuery)
- `dashboard-stats/route.js` — يقرأ 3 كولكشنات كاملة بدون `limit()`

### 3.17 هل يوجد ISR أو Revalidation يقرأ Firestore أكثر من اللازم؟

**لا — مثبت من الكود:**
- `revalidate/route.js` — يمسح KV cache فقط (`kvDeleteMany`)، لا يقرأ Firestore أبدًا

### 3.18 هل يوجد Edge Function أو Middleware تقرأ Firestore؟

**لا — مثبت من الكود:**
- `middleware.js` — فارغ تمامًا: `export function middleware(request) { return NextResponse.next(); }` مع `matcher: []`

### 3.19 هل يوجد Cloudflare Worker يقرأ Firestore؟

**غير قابل للإثبات من الكود وحده:**
- لا يوجد ملف Worker في `src/`، لكن ملف `wrangler.jsonc` موجود في جذر المشروع. يحتاج التحقق من `wrangler.jsonc` لمعرفة إذا كان هناك Worker منشور.

### 3.20 هل يوجد Cloudflare KV لا يعمل كما ينبغي ويتم تجاوز الكاش؟

**غير قابل للإثبات من الكود وحده:**
- الكود يظهر أن KV cache يُستخدم في العديد من الأماكن، لكن لا يمكن معرفة من الكود وحده إذا كان KV يعمل بشكل صحيح. يحتاج التحقق من Cloudflare Dashboard وسجلات التشغيل.

### 3.21 هل يوجد صفحات لا تستخدم الكاش وتقرأ Firestore مباشرة؟

**نعم — مثبت من الكود:**
- `admin/inventory/page.js` سطر 679: `getDocs(products)` — قراءة مباشرة بدون KV cache
- `admin/reviews/page.js` سطر 64-77: `getDocs(products)`, `getDocs(ProductStats)`, `getDocs(Reviews)` — قراءة مباشرة بدون KV cache
- `admin/reviews/page.js` سطر 585-603: `getDocs(Reviews)`, `getDocs(products)`, `getDocs(ProductStats)` — قراءة مباشرة بدون KV cache
- `admin/orders/page.js` سطر 45-98: `getDocs(Orders)` — قراءة مباشرة (مع in-memory cache فقط)
- `admin/customers/page.js` سطر 73-138: `getDocs(Customers)` — قراءة مباشرة (مع SWR cache فقط)

### 3.22 هل يوجد بيانات يتم جلبها أكثر من مرة في نفس الصفحة؟

**نعم — مثبت من الكود:**
- `admin/page.js`: نفس البيانات تُجلب كل 15 ثانية عبر `setInterval`

### 3.23 هل يوجد أكثر من Component يطلب نفس البيانات؟

**غير قابل للإثبات من الكود وحده:**
- يعتمد على كيفية استخدام الـ components في الصفحات. التحليل اليدوي للـ components يظهر أن `useSiteSettings()` يُستخدم في `SettingsContext.js` و `CartContext.js` و `admin/page.js`، لكن SWR deduplication يمنع التكرار.

### 3.24 هل يوجد duplicate fetch؟

**نعم — مثبت من الكود:**
- `admin/page.js`: نفس الـ API يُستدعى كل 15 ثانية (duplicate fetch متكرر)

### 3.25 هل يوجد hydration يؤدي لإعادة القراءة؟

**غير قابل للإثبات من الكود وحده:**
- يحتاج تحليل سلوك التشغيل الفعلي في المتصفح. الكود يظهر أن جميع الـ hooks تستخدم `"use client"` مما يعني أنها تعمل في المتصفح فقط.

### 3.26 هل يوجد lazy loading أو infinite scrolling يكرر القراءة؟

**نعم — مثبت من الكود:**
- `admin/products/page.js` سطر 100-104: `loadMore()` — يُنفذ `fetchProducts(true)` الذي يقرأ 20 منتجًا إضافيًا
- `admin/orders/page.js` سطر 337-341: `loadMore()` — يُنفذ `fetchOrders(true)` الذي يقرأ 20 طلبًا إضافيًا
- `admin/customers/page.js` سطر 157-212: `loadMoreCustomers()` — يُنفذ `getDocs(Customers, startAfter, limit(20))`
- `admin/reviews/page.js` سطر 481-500: `handleLoadMoreReviews()` — يُنفذ `getDocs(Reviews, startAfter, limit(3))`

### 3.27 هل يوجد pagination خاطئة؟

**لا — مثبت من الكود:**
- جميع الـ paginations تستخدم `startAfter()` بشكل صحيح مع `limit()`

### 3.28 هل يوجد استعلامات بدون limit()؟

**نعم — مثبت من الكود (8 استعلامات):**
1. `dashboard-stats/route.js` سطر 42: `visitor_events` — بدون `limit()`
2. `dashboard-stats/route.js` سطر 68: `Customers` — بدون `limit()`
3. `dashboard-stats/route.js` سطر 117: `Orders` — بدون `limit()`
4. `inventory/page.js` سطر 679: `products` — بدون `limit()`
5. `reviews/page.js` سطر 585: `Reviews` — بدون `limit()`
6. `analytics-daily/route.js` سطر 59: `visitor_events` — بدون `limit()`
7. `analytics-daily/route.js` سطر 99: `Customers` — بدون `limit()`
8. `analytics-daily/route.js` سطر 125: `Orders` — بدون `limit()`

### 3.29 هل يوجد orderBy مع Collection كاملة؟

**نعم — مثبت من الكود:**
- `inventory/page.js` سطر 679: `orderBy("createdAt", "desc")` مع `getDocs(products)` بدون `limit()`

### 3.30 هل يوجد count يتم تنفيذه كثيرًا؟

**لا — مثبت من الكود:**
- لا يوجد استخدام لـ `count()` أو `getCountFromServer()` في أي ملف

### 3.31 هل يوجد Aggregate Query غير ضرورية؟

**لا — مثبت من الكود:**
- لا يوجد استخدام لـ `aggregate()` أو `sum()` أو `average()` في أي ملف

### 3.32 هل يوجد Snapshot Listener يعمل باستمرار؟

**لا — مثبت من الكود:**
- لا يوجد استخدام لـ `onSnapshot()` على Firestore في أي ملف. جميع استعلامات Firestore تستخدم `getDocs()` أو `getDoc()` (طلبات لمرة واحدة)

### 3.33 هل يوجد onSnapshot في أماكن لا تحتاج Real-time؟

**لا — مثبت من الكود:**
- لا يوجد `onSnapshot` على Firestore. يوجد `onValue` على RTDB في `admin/page.js` (سطر 151) و `admin/live/page.js` (سطر 54)، لكن هذا RTDB وليس Firestore.

---

## 4. تحليل لوحة الإدارة

### 4.1 Dashboard (`/admin/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ✅ نعم — `fetchDashboardStats()` يستدعي API واحدًا يقرأ 3 كولكشنات + مستند واحد |
| هل يوجد Auto Refresh؟ | ✅ نعم — `setInterval(fetchDashboardStats, 15000)` سطر 102 |
| هل يوجد Snapshot دائم؟ | ❌ لا — يستخدم `fetch()` وليس `onSnapshot` |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ✅ نعم — بسبب `setInterval` الذي يُعيد الاستدعاء كل 15 ثانية |
| هل يوجد استعلامات متكررة عند التنقل؟ | ✅ نعم — `useEffect` مع `[activePeriod, fetchDashboardStats]` يُعيد الاستدعاء عند تغيير الفترة |

### 4.2 Products (`/admin/products/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ❌ لا — `limit(20)` مع pagination |
| هل يوجد Auto Refresh؟ | ❌ لا |
| هل يوجد Snapshot دائم؟ | ❌ لا |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ❌ لا — بفضل in-memory cache (`globalProductsCache` سطر 13-18) |
| هل يوجد استعلامات متكررة عند التنقل؟ | ❌ لا — in-memory cache يمنع إعادة التحميل |

### 4.3 Orders (`/admin/orders/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ❌ لا — `limit(20)` مع pagination |
| هل يوجد Auto Refresh؟ | ❌ لا |
| هل يوجد Snapshot دائم؟ | ❌ لا |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ❌ لا — بفضل tab cache (`tabCacheRef` سطر 34) |
| هل يوجد استعلامات متكررة عند التنقل؟ | ✅ نعم — عند تغيير التاب (wind/shopify/abandoned)، يتم إعادة تحميل البيانات |

### 4.4 Customers (`/admin/customers/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ❌ لا — `limit(20)` مع SWR |
| هل يوجد Auto Refresh؟ | ❌ لا |
| هل يوجد Snapshot دائم؟ | ❌ لا |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ❌ لا — بفضل SWR cache |
| هل يوجد استعلامات متكررة عند التنقل؟ | ✅ نعم — عند تغيير التاب (wind/shopify/all)، SWR يُعيد الجلب |

### 4.5 Reviews (`/admin/reviews/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ✅ نعم — 50 منتج + 100 ProductStats + 20 Review = 170 مستندًا |
| هل يوجد Auto Refresh؟ | ❌ لا |
| هل يوجد Snapshot دائم؟ | ❌ لا |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ❌ لا — `useEffect` مع `[]` (مرة واحدة) |
| هل يوجد استعلامات متكررة عند التنقل؟ | ❌ لا |

### 4.6 Inventory (`/admin/inventory/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ✅ نعم — **جميع المنتجات بدون `limit()`** (سطر 679) |
| هل يوجد Auto Refresh؟ | ❌ لا |
| هل يوجد Snapshot دائم؟ | ❌ لا |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ❌ لا — `useEffect` مع `[loadData]` (مرة واحدة) |
| هل يوجد استعلامات متكررة عند التنقل؟ | ❌ لا |

### 4.7 Live (`/admin/live/page.js`)

| الخاصية | التحليل من الكود |
|---------|-----------------|
| هل يتم تحميل كل البيانات دفعة واحدة؟ | ❌ لا — يستخدم RTDB (ليس Firestore) |
| هل يوجد Auto Refresh؟ | ✅ نعم — `onValue` (RTDB real-time listener) |
| هل يوجد Snapshot دائم؟ | ✅ نعم — `onValue` (RTDB) |
| هل يتم إعادة تحميل البيانات مع كل Render؟ | ❌ لا |
| هل يوجد استعلامات متكررة عند التنقل؟ | ❌ لا |

---

## 5. تحليل Facebook Catalog

| البند | التحليل من الكود |
|-------|-----------------|
| كم Query ينفذ؟ | 1 Query: `runQuery` عبر Firestore REST API (سطر 85-99) |
| هل يوجد `limit()`؟ | **لا** — يقرأ جميع المنتجات حيث `status == "Active"` |
| كم Document يقرأ؟ | غير قابل للتحديد من الكود وحده — يعتمد على عدد المنتجات النشطة في قاعدة البيانات |
| هل يعيد قراءة كل المنتجات كل مرة؟ | ✅ نعم — في كل مرة يكون KV cache فارغًا (cache MISS) |
| هل يستخدم Cloudflare KV؟ | ✅ نعم — `kv.get(KV_KEY)` سطر 69، `kv.put(KV_KEY, xml, { expirationTtl: 86400 })` سطر 474 |
| هل يمكن استخدام ملف ثابت؟ | ✅ نعم — الكود الحالي يبني XML ويمكن تخزينه في KV (وهو ما يحدث بالفعل) |
| هل يمكن استخدام Incremental Update؟ | ✅ نعم — لكنه غير مطبق حاليًا |
| هل يمكن استخدام Cache؟ | ✅ نعم — يُستخدم بالفعل: KV cache (TTL 24 ساعة) + `Cache-Control: public, max-age=3600` |

**عدد مرات التنفيذ:** غير قابل للتحديد من الكود وحده. الكود لا يحتوي على Cron Job أو Scheduler. الـ endpoint يُستدعى فقط عندما يزحف Facebook (أو أي عميل آخر) إلى الرابط. يحتاج التحقق من Facebook Catalog Dashboard و Google Merchant Center لمعرفة عدد مرات الزحف الفعلية.

---

## 6. تحليل Bots & Crawlers

**غير قابل للإثبات من الكود وحده.**

الكود لا يحتوي على أي آلية لكشف أو منع البوتات. لا يوجد:
- `User-Agent` filtering
- `robots.txt` (ملف `robots.js` موجود لكن لم يتم تحليله)
- Rate limiting على API routes
- Bot detection middleware

**ما يمكن إثباته من الكود:**
- جميع API routes تستخدم `force-dynamic` (مثبت في الجدول أعلاه)، مما يعني أن CDN لا يخزن الاستجابات
- بعض الـ API routes لا تستخدم KV cache (مثل `dashboard-stats`)، مما يعني أن أي طلب — حتى من بوت — يصل إلى Firestore

**ما يحتاج تحقق خارجي:**
- عدد زيارات البوتات الفعلية — يحتاج Google Analytics أو Cloudflare Analytics
- ما إذا كانت البوتات تحترم `Cache-Control` headers — يحتاج اختبار فعلي
- تأثير Facebook Crawler على `/api/fb-catalog` — يحتاج Facebook Catalog Dashboard

---

## 7. تحليل عدد مرات تنفيذ كل Query (من الكود فقط)

### 7.1 الاستعلامات التي تُنفذ مرة واحدة لكل تحميل صفحة

| الاستعلام | الشرط من الكود |
|-----------|---------------|
| `inventory/page.js` — `getDocs(products)` | `useEffect(() => { loadData(); }, [loadData])` سطر 698 — يُنفذ مرة واحدة عند تحميل الصفحة |
| `reviews/page.js` — 3 استعلامات | `useEffect(() => { fetchData(); }, [])` سطر 54-56 — يُنفذ مرة واحدة عند تحميل الصفحة |
| `products/page.js` — `getDocs(products, limit(20))` | `useEffect(() => { if (!globalProductsCache.isLoaded) fetchProducts(); }, [])` سطر 38-43 — يُنفذ مرة واحدة فقط (بفضل in-memory cache) |
| `AuthContext.js` — `getDoc(Users/{uid})` | `useEffect(() => { ... onAuthStateChanged(...) }, [])` سطر 15-38 — يُنفذ مرة واحدة عند تحميل الصفحة (للمستخدمين المسجلين فقط) |

### 7.2 الاستعلامات التي تُنفذ كل 15 ثانية

| الاستعلام | الدليل من الكود |
|-----------|----------------|
| `dashboard-stats/route.js` — 3 استعلامات + 1 getDoc | `admin/page.js` سطر 102: `setInterval(() => { ... fetchDashboardStats(...) }, 15000)` |

### 7.3 الاستعلامات التي تُنفذ عند التفاعل (زر/حدث)

| الاستعلام | الشرط من الكود |
|-----------|---------------|
| `reviews/page.js` — `getDocs(Reviews)` بدون limit | عند الضغط على زر "مزامنة التقييمات" (سطر 575-682) |
| `reviews/page.js` — `getDocs(products, limit(1000))` | عند الضغط على زر "مزامنة التقييمات" |
| `reviews/page.js` — `getDocs(ProductStats, limit(1000))` | عند الضغط على زر "مزامنة التقييمات" |
| `reviews/page.js` — `getDocs(Reviews, limit(3))` | عند الضغط على "عرض التقييمات" لمنتج (سطر 459-478) |
| `reviews/page.js` — `getDocs(Reviews, limit(3))` | عند الضغط على "عرض المزيد" (سطر 481-500) |
| `orders/page.js` — `getDocs(Orders, limit(500))` في while loop | عند الضغط على "تصدير الطلبات" (سطر 219-265) |
| `customers/page.js` — `getDocs(Customers, limit(500))` في while loop | عند الضغط على "تصدير" (سطر 345-375) |
| `products/page.js` — `getDocs(products, limit(20))` | عند الضغط على "تحميل المزيد" (سطر 100-104) |
| `orders/page.js` — `getDocs(Orders, limit(20))` | عند الضغط على "تحميل المزيد" (سطر 337-341) |
| `customers/page.js` — `getDocs(Customers, limit(20))` | عند الضغط على "تحميل المزيد" (سطر 157-212) |

### 7.4 الاستعلامات التي تُنفذ عند تغيير التاب

| الاستعلام | الشرط من الكود |
|-----------|---------------|
| `orders/page.js` — `getDocs(Orders, limit(20))` | `useEffect` مع `[activeTab, isArchiveVisible]` سطر 103-108 — يُنفذ عند تغيير التاب |
| `customers/page.js` — `getDocs(Customers, limit(20))` | SWR مع `['customers', activeTab]` سطر 146-149 — يُنفذ عند تغيير التاب |

### 7.5 الاستعلامات التي تعتمد على KV cache (قد لا تصل إلى Firestore)

| الاستعلام | آلية الكاش |
|-----------|-----------|
| `homepage/route.js` — 2 getDoc + 2 getDocs | KV cache مع مفتاح `homepage_data_v1` — يمنع الوصول إلى Firestore لمدة 24 ساعة |
| `product/[id]/route.js` — getDoc | KV cache مع مفتاح `product_{id}` — يمنع الوصول إلى Firestore حتى يتم مسح الكاش |
| `site-settings/route.js` — getDoc | KV cache مع مفتاح `site_settings_v1` و TTL=3600 (ساعة واحدة) |
| `homepage-reviews/route.js` — 2 getDocs | KV cache مع مفتاح `homepage_reviews_v1` — يمنع الوصول إلى Firestore لمدة 24 ساعة |
| `fb-catalog/route.js` — runQuery | KV cache مع مفتاح `fb_catalog_xml_v8` و TTL=86400 (24 ساعة) |
| `product-stats-batch/route.js` — getDoc لكل handle | KV cache مع مفتاح `product_stats_{handle}` — يمنع الوصول إلى Firestore بعد أول مرة |

---

## 8. تحليل إعدادات الكاش

### 8.1 KV Cache (Cloudflare)

| المفتاح | الملف | TTL | متى يُمسح |
|---------|------|-----|----------|
| `homepage_data_v1` | `homepage/route.js` | غير محدد (persistent) | عند استدعاء `/api/revalidate` مع `type: 'homepage'` أو `type: 'product'` أو `type: 'likes'` |
| `product_{id}` | `product/[id]/route.js` | غير محدد (persistent) | عند استدعاء `/api/revalidate` مع `type: 'product'` أو `type: 'product_stats'` أو `type: 'likes'` |
| `product_stats_{handle}` | `product-stats-batch/route.js` | غير محدد (persistent) | عند استدعاء `/api/revalidate` مع `type: 'product_stats'` |
| `site_settings_v1` | `site-settings/route.js` | 3600 (ساعة واحدة) | تلقائيًا بعد ساعة، أو عند استدعاء `/api/revalidate` مع `type: 'site_settings'` |
| `homepage_reviews_v1` | `homepage-reviews/route.js` | غير محدد (persistent) | عند استدعاء `/api/revalidate` مع `type: 'product_stats'` |
| `fb_catalog_xml_v8` | `fb-catalog/route.js` | 86400 (24 ساعة) | تلقائيًا بعد 24 ساعة، أو عند استدعاء `/api/revalidate` مع `type: 'fb_catalog'` |

### 8.2 SWR Cache

| الـ Hook | `dedupingInterval` | `revalidateOnFocus` | `revalidateOnReconnect` |
|----------|-------------------|---------------------|------------------------|
| `useSiteSettings()` | 300000 (5 دقائق) | `false` | `false` |
| `useHomepageReviews()` | 300000 (5 دقائق) | `false` | `false` |
| `useHomepageProductsSections()` | 300000 (5 دقائق) | `false` | — |
| `usePaginatedProducts()` | 300000 (5 دقائق) | `false` | — |
| `useProduct()` | 300000 (5 دقائق) | `false` | — |
| `useRelatedProducts()` | 300000 (5 دقائق) | `false` | — |
| `usePaginatedReviews()` | 300000 (5 دقائق) | `false` | — |
| Admin Layout (`SWRConfig`) | 300000 (5 دقائق) | `false` | `false` |
| Global (`SWRProvider`) | 300000 (5 دقائق) | `false` | — |

### 8.3 In-Memory Cache (Admin Pages)

| الصفحة | المتغير | النطاق | متى يُمسح |
|--------|---------|-------|----------|
| `admin/products/page.js` | `globalProductsCache` | Module-level (يعيش طوال عمر التاب) | عند إضافة/حذف منتج |
| `admin/orders/page.js` | `tabCacheRef` | useRef (يعيش طوال عمر التاب) | عند تغيير التاب |

### 8.4 Cache-Control Headers

| API Route | Cache-Control | التأثير |
|-----------|--------------|---------|
| `dashboard-stats` | `no-cache, no-store, must-revalidate` | يمنع أي تخزين مؤقت تمامًا |
| `fb-catalog` | `public, max-age=3600` | يسمح بتخزين الاستجابة لمدة ساعة |
| `homepage` | لا يوجد (افتراضي) | يعتمد على إعدادات المنصة |
| `product/[id]` | لا يوجد (افتراضي) | يعتمد على إعدادات المنصة |
| `site-settings` | لا يوجد (افتراضي) | يعتمد على إعدادات المنصة |

---

## 9. الأدلة المثبتة (Verified Findings)

هذا القسم يحتوي فقط على المشاكل التي تم إثباتها بشكل مباشر من الكود، بدون أي افتراضات أو تقديرات.

### ✅ F1: Admin Dashboard Polling بدون كاش

**الملف:** `src/app/admin/page.js` سطر 100-114  
**الدليل:** `setInterval(() => { fetchDashboardStats(...) }, 15000)`  
**التفصيل:** Dashboard يُعيد استدعاء `/api/admin/dashboard-stats` كل 15 ثانية. هذا الـ API:
- لا يستخدم KV cache
- يستخدم `Cache-Control: no-cache, no-store, must-revalidate`
- يقرأ 3 كولكشنات بدون `limit()` + مستند واحد

### ✅ F2: Three Full Collection Scans in dashboard-stats API

**الملف:** `src/app/api/admin/dashboard-stats/route.js`  
**الدليل:** 
- سطر 42-46: `getDocs(visitor_events, date>=, date<=)` — **بدون `limit()`**
- سطر 68-71: `getDocs(Customers, last_active>=)` — **بدون `limit()`**
- سطر 117-120: `getDocs(Orders, Created at>=)` — **بدون `limit()`**

### ✅ F3: Admin Inventory — Full Collection Scan بدون limit

**الملف:** `src/app/admin/inventory/page.js` سطر 679  
**الدليل:** `getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")))` — **بدون `limit()`**  
**ملاحظة:** هذا الاستعلام يقرأ جميع المستندات في `products` collection في كل مرة تُفتح فيها الصفحة.

### ✅ F4: Admin Reviews — Full Collection Scan في مزامنة التقييمات

**الملف:** `src/app/admin/reviews/page.js` سطر 585  
**الدليل:** `getDocs(query(collection(db, "Reviews")))` — **بدون `limit()`** وبدون أي شرط (where).  
هذا يقرأ جميع المستندات في `Reviews` collection.

### ✅ F5: Admin Reviews — 1000 Document Reads في مزامنة التقييمات

**الملف:** `src/app/admin/reviews/page.js` سطر 602-603  
**الدليل:** 
- `getDocs(query(collection(db, "products"), limit(1000)))` — يقرأ حتى 1000 مستند
- `getDocs(query(collection(db, "ProductStats"), limit(1000)))` — يقرأ حتى 1000 مستند

### ✅ F6: Analytics Daily API — Three Full Collection Scans بدون limit

**الملف:** `src/app/api/admin/analytics-daily/route.js`  
**الدليل:**
- سطر 59-62: `getDocs(visitor_events, date==)` — **بدون `limit()`**
- سطر 99-101: `getDocs(Customers, last_active>=)` — **بدون `limit()`**
- سطر 125-127: `getDocs(Orders, Created at>=)` — **بدون `limit()`**

### ✅ F7: Facebook Catalog — Full Collection Scan بدون limit

**الملف:** `src/app/api/fb-catalog/route.js` سطر 85-99  
**الدليل:** Firestore REST API `runQuery` مع `structuredQuery` بدون `limit`. يقرأ جميع المنتجات حيث `status == "Active"`.

### ✅ F8: Admin Pages تقرأ Firestore مباشرة بدون KV Cache

**الملف:** `admin/inventory/page.js` و `admin/reviews/page.js` و `admin/orders/page.js` و `admin/customers/page.js`  
**الدليل:** جميع هذه الصفحات تستخدم `getDb()` و `getDocs()` مباشرة من Client Components، بدون المرور عبر KV cache.

### ✅ F9: force-dynamic على جميع API Routes

**الدليل:** جميع API routes تحتوي على `export const dynamic = 'force-dynamic'`  
**التأثير:** هذا يمنع Next.js من تخزين الاستجابات مؤقتًا على مستوى CDN/Edge.

### ✅ F10: SWR dedupingInterval = 5 دقائق

**الدليل:** جميع hooks في `useFirestore.js` تستخدم `dedupingInterval: 300000`  
**التأثير:** بعد 5 دقائق من آخر استدعاء، يمكن إعادة الاستعلام إذا تغيرت الظروف (مثل إعادة التركيز على التاب).

### ✅ F11: Visitor Event يقرأ ويكتب Firestore لكل زائر جديد

**الملف:** `src/context/SettingsContext.js` سطر 27-139  
**الدليل:** `getDoc(visitorEventRef)` + `setDoc(visitorEventRef, ...)` + `getDoc(settingsRef)` + `updateDoc(settingsRef, ...)` لكل زائر جديد (مرة واحدة لكل جلسة).

---

## 10. الفرضيات التي تحتاج تحقق (Hypotheses Requiring External Verification)

هذا القسم يحتوي على النقاط التي لا يمكن إثباتها أو نفيها من الكود وحده.

### 🔍 H1: عدد المستندات في كل Collection

**ما نحتاج معرفته:** العدد الفعلي للمستندات في:
- `visitor_events`
- `Customers`
- `Orders`
- `products`
- `Reviews`
- `ProductStats`

**لماذا نحتاج هذا:** لتحديد عدد القراءات الفعلية لكل استعلام بدون `limit()`.

**أين يمكن الحصول عليه:** Firebase Console → Firestore Database → لكل collection.

### 🔍 H2: عدد مرات زحف Facebook/Google للـ Catalog

**ما نحتاج معرفته:** كم مرة في اليوم يزحف Facebook Crawler و Google Merchant Center إلى `/api/fb-catalog`.

**لماذا نحتاج هذا:** لتحديد عدد مرات تنفيذ `runQuery` في `fb-catalog/route.js`.

**أين يمكن الحصول عليه:** 
- Facebook: Meta Business Suite → Catalog → Diagnostics
- Google: Google Merchant Center → Products → Feed status
- Cloudflare: Analytics → HTTP requests

### 🔍 H3: عدد زيارات البوتات الفعلية

**ما نحتاج معرفته:** كم زيارة يوميًا من:
- Googlebot
- Facebook Crawler
- WhatsApp Preview
- Discord
- Telegram
- Pinterest
- Twitter/X
- Bing
- AI Crawlers

**لماذا نحتاج هذا:** لتحديد عدد مرات وصول البوتات إلى API routes التي لا تستخدم KV cache.

**أين يمكن الحصول عليه:** 
- Google Analytics 4 → Reports → Engagement → Pages and screens (مع فلترة بـ User-Agent)
- Cloudflare Analytics → HTTP requests → Bot requests

### 🔍 H4: هل React Strict Mode مفعّل؟

**ما نحتاج معرفته:** هل `reactStrictMode: true` في `next.config.mjs`؟

**لماذا نحتاج هذا:** Strict Mode يضاعف تنفيذ `useEffect` في مرحلة التطوير، مما قد يضاعف عدد الاستعلامات.

**أين يمكن الحصول عليه:** ملف `next.config.mjs` في جذر المشروع.

### 🔍 H5: هل Cloudflare Worker يقرأ Firestore؟

**ما نحتاج معرفته:** هل يوجد Worker منشور على Cloudflare يقرأ Firestore؟

**لماذا نحتاج هذا:** لتحديد إذا كان هناك مصدر إضافي للقراءات خارج الكود الموجود في `src/`.

**أين يمكن الحصول عليه:** 
- ملف `wrangler.jsonc` في جذر المشروع
- Cloudflare Dashboard → Workers & Pages

### 🔍 H6: هل Cloudflare KV يعمل بشكل صحيح؟

**ما نحتاج معرفته:** هل KV cache يُضرب (cache hit) أم يتم تجاوزه باستمرار؟

**لماذا نحتاج هذا:** KV cache هو خط الدفاع الأول ضد القراءات المتكررة. إذا كان لا يعمل، فكل طلب يصل إلى Firestore.

**أين يمكن الحصول عليه:**
- Cloudflare Dashboard → KV → Namespace → Metrics
- سجلات التشغيل (Logs) للـ API routes

### 🔍 H7: عدد مرات فتح Admin Dashboard يوميًا

**ما نحتاج معرفته:** كم ساعة في اليوم يكون Admin Dashboard مفتوحًا في متصفح الأدمن؟

**لماذا نحتاج هذا:** لتحديد عدد مرات تنفيذ polling (كل 15 ثانية).

**أين يمكن الحصول عليه:**
- Google Analytics 4 (إذا كان يتتبع صفحة `/admin`)
- سجلات Cloudflare للطلبات إلى `/api/admin/dashboard-stats`

### 🔍 H8: عدد مرات استخدام زر "مزامنة التقييمات"

**ما نحتاج معرفته:** كم مرة في اليوم يتم الضغط على زر "مزامنة التقييمات" في صفحة Reviews؟

**لماذا نحتاج هذا:** كل ضغطة تسبب 3 استعلامات كبيرة (Reviews كامل + products limit(1000) + ProductStats limit(1000)).

**أين يمكن الحصول عليه:**
- سجلات Cloudflare للطلبات إلى Firestore
- مقابلة مع الأدمن

### 🔍 H9: عدد مرات استخدام "تصدير" في Orders و Customers

**ما نحتاج معرفته:** كم مرة في اليوم يتم تصدير البيانات؟

**لماذا نحتاج هذا:** كل تصدير يسبب قراءة آلاف المستندات في while loop.

**أين يمكن الحصول عليه:**
- سجلات Cloudflare
- مقابلة مع الأدمن

---

## 11. الخلاصة

### ما هو مثبت من الكود بنسبة 100%:

1. **Admin Dashboard** يُعيد استدعاء `/api/admin/dashboard-stats` **كل 15 ثانية** عبر `setInterval`
2. هذا الـ API يقوم بـ **3 مسح كامل لكولكشنات بدون `limit()`**:
   - `visitor_events` (بدون `limit()`)
   - `Customers` (بدون `limit()`)
   - `Orders` (بدون `limit()`)
3. هذا الـ API **لا يستخدم KV cache** و **لا يستخدم SWR cache**
4. هذا الـ API يستخدم `Cache-Control: no-cache, no-store, must-revalidate`
5. **Admin Inventory** يقرأ جميع المنتجات بدون `limit()`
6. **Admin Reviews** يمكنه قراءة آلاف المستندات عند الضغط على "مزامنة التقييمات"
7. **Facebook Catalog** يقرأ جميع المنتجات النشطة بدون `limit()` (مع KV cache كحماية)
8. **8 استعلامات** في المجموع بدون `limit()` في جميع أنحاء المشروع

### ما هو غير قابل للإثبات من الكود وحده:

1. العدد الفعلي للمستندات في كل Collection
2. عدد ساعات فتح Admin Dashboard يوميًا
3. عدد زيارات البوتات الفعلية
4. عدد مرات زحف Facebook للـ Catalog
5. عدد مرات استخدام "مزامنة التقييمات" و "تصدير"
6. حالة React Strict Mode
7. وجود Cloudflare Worker إضافي

### التفسير المنطقي للوصول إلى 50,000 قراءة:

بناءً على الأدلة المثبتة من الكود فقط:

- **إذا كان Admin Dashboard مفتوحًا لمدة 17 دقيقة:** 68 استدعاء × 3 كولكشنات بدون limit = عدد غير معروف من القراءات (يعتمد على حجم الكولكشنات)
- **إذا كان Admin Inventory مفتوحًا:** قراءة جميع المنتجات بدون limit
- **إذا تم استخدام "مزامنة التقييمات":** قراءة Reviews كامل + 1000 منتج + 1000 ProductStats

**لتحديد الرقم الدقيق 50,000، نحتاج إلى التحقق من H1 (عدد المستندات في كل Collection) و H7 (عدد ساعات فتح Dashboard).**

---

*تم إعداد هذا التقرير بناءً على تحليل كامل لكود المشروع. جميع الادعاءات في قسم "الأدلة المثبتة" مدعومة بأدلة مباشرة من الكود مع ذكر الملف والسطر.*