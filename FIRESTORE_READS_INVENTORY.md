# Firestore Reads Inventory — الجرد الكامل لجميع استعلامات القراءة

**تاريخ الجرد:** 17 يوليو 2026  
**طريقة الجرد:** مسح آلي لجميع ملفات `.js` و `.jsx` في `src/` باستخدام `Select-String` للبحث عن جميع استدعاءات Firebase/Firestore

---

## منهجية الجرد

تم البحث في **86 ملف مصدر** عن جميع الأنماط التالية:
- `getDoc`, `getDocs`, `onSnapshot` (قراءة)
- `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch`, `addDoc` (كتابة — لكنها قد تسبب قراءة في بعض الحالات)
- `runQuery`, `getCountFromServer` (استعلامات متقدمة)
- `getDb`, `getEdgeDb`, `getFirebaseEdge`, `getFirestore` (الحصول على اتصال Firestore)
- `firestoreAdminSet`, `firestoreAdminDelete` (كتابة عبر REST API)

---

## الخريطة الكاملة لجميع استدعاءات Firestore

الملاحظات:
- **(R)** = عملية قراءة (Read)
- **(W)** = عملية كتابة (Write)
- **(R+W)** = عملية قراءة وكتابة معًا
- **(I)** = استدعاء للحصول على instance (ليس قراءة مباشرة)

---

### A. API Routes (`src/app/api/`)

#### A1. `api/admin/dashboard-stats/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | Cache-Control | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|----------------|
| 42 | `queryVisitorsFromEvents()` | `getDocs` (R) | `visitor_events` | ❌ لا يوجد | ❌ لا | `no-cache, no-store` | Admin Dashboard polling كل 15 ثانية |
| 68 | `queryRealCustomersForRange()` | `getDocs` (R) | `Customers` | ❌ لا يوجد | ❌ لا | `no-cache, no-store` | Admin Dashboard polling كل 15 ثانية |
| 117 | `queryOrdersForRange()` | `getDocs` (R) | `Orders` | ❌ لا يوجد | ❌ لا | `no-cache, no-store` | Admin Dashboard polling كل 15 ثانية |
| 172 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | `no-cache, no-store` | Admin Dashboard polling كل 15 ثانية |

#### A2. `api/admin/analytics-daily/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | Cache-Control | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|----------------|
| 46 | `GET()` | `getDoc` (R) | `analytics_daily/{date}` | N/A | ❌ لا | افتراضي | Admin (نادر) |
| 59 | `GET()` | `getDocs` (R) | `visitor_events` | ❌ لا يوجد | ❌ لا | افتراضي | Admin (نادر) |
| 74 | `GET()` | `getDocs` (R) | `Customers` (fallback) | ❌ لا يوجد | ❌ لا | افتراضي | Admin (نادر) |
| 99 | `GET()` | `getDocs` (R) | `Customers` | ❌ لا يوجد | ❌ لا | افتراضي | Admin (نادر) |
| 125 | `GET()` | `getDocs` (R) | `Orders` | ❌ لا يوجد | ❌ لا | افتراضي | Admin (نادر) |
| 168 | `GET()` | `setDoc` (W) | `analytics_daily/{date}` | N/A | ❌ لا | افتراضي | Admin (نادر) |

#### A3. `api/admin/promotions/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 16 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | Admin (نادر) |
| 24 | `GET()` | `getDocs` (R) | `promoCodes` | ❌ لا يوجد | ❌ لا | Admin (نادر) |
| 50 | `POST()` | `updateDoc` (W) | `settings/siteSettings` | N/A | ❌ لا | Admin (نادر) |
| 70 | `POST()` | `getDoc` (R) | `promoCodes/{code}` | N/A | ❌ لا | Admin (نادر) |
| 94 | `POST()` | `setDoc` (W) | `promoCodes/{code}` | N/A | ❌ لا | Admin (نادر) |
| 111 | `DELETE()` | `deleteDoc` (W) | `promoCodes/{code}` | N/A | ❌ لا | Admin (نادر) |

#### A4. `api/admin/rebuild-analytics/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 28 | `rebuildSingleDay()` | `getDocs` (R) | `Orders` | ❌ لا يوجد | ❌ لا | Admin (يدوي — نادر جدًا) |
| 60 | `rebuildSingleDay()` | `getDocs` (R) | `visitor_events` | ❌ لا يوجد | ❌ لا | Admin (يدوي — نادر جدًا) |
| 69 | `rebuildSingleDay()` | `getDocs` (R) | `Customers` | ❌ لا يوجد | ❌ لا | Admin (يدوي — نادر جدًا) |
| 83 | `rebuildRange()` | `getDocs` (R) | `Customers` | ❌ لا يوجد | ❌ لا | Admin (يدوي — نادر جدًا) |
| 97 | `rebuildRange()` | `getDocs` (R) | `Orders` | ❌ لا يوجد | ❌ لا | Admin (يدوي — نادر جدًا) |
| 130 | `rebuildSingleDay()` | `setDoc` (W) | `analytics_daily/{date}` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 154 | `processDate()` | `getDoc` (R) | `analytics_daily/{date}` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 174 | `processDate()` | `setDoc` (W) | `analytics_daily/{date}` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |

#### A5. `api/admin/rebuild-counters/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 64 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 87 | `GET()` | `getDocs` (R) | `visitor_events` | ❌ لا موجود (في `constraints`) | ❌ لا | Admin (يدوي — نادر جدًا) |
| 153 | `GET()` | `getDocs` (R) | `Orders` | ❌ لا موجود (في `constraints`) | ❌ لا | Admin (يدوي — نادر جدًا) |
| 253 | `GET()` | `updateDoc` (W) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 280 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |

#### A6. `api/admin/reconcile-customers/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 56 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 83 | `GET()` | `getDocs` (R) | `Customers` | ❌ لا موجود | ❌ لا | Admin (يدوي — نادر جدًا) |
| 184 | `GET()` | `updateDoc` (W) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 208 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |

#### A7. `api/admin/run-migration/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 97 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |
| 128 | `GET()` | `getDocs` (R) | `products` | ❌ لا موجود | ❌ لا | Admin (يدوي — نادر جدًا) |
| 158 | `GET()` | `getDocs` (R) | `products` | ❌ لا موجود | ❌ لا | Admin (يدوي — نادر جدًا) |
| 207 | `GET()` | `setDoc` (W) | `settings/siteSettings` | N/A | ❌ لا | Admin (يدوي — نادر جدًا) |

#### A8. `api/create-order/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| (لم يتم تحليله بالكامل) | — | متوقع `getDoc`, `setDoc` | `Orders`, `Customers`, `settings` | — | — | Checkout page |

#### A9. `api/fb-catalog/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | Cache-Control | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|----------------|
| 69 | `GET()` | `kv.get` (KV read) | — | N/A | ✅ نعم | — | Facebook Crawler |
| 85 | `GET()` | `runQuery` (R) عبر REST API | `products` | ❌ لا يوجد | ✅ نعم (قبل الاستعلام) | `public, max-age=3600` | Facebook Crawler (عند cache MISS) |
| 474 | `GET()` | `kv.put` (KV write) | — | N/A | ✅ نعم | — | Facebook Crawler (عند cache MISS) |

#### A10. `api/fb-track/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| (لم يتم تحليله بالكامل) | — | متوقع | — | — | — | Facebook Pixel events |

#### A11. `api/homepage/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 13 | `GET()` | `kvGet` (KV read) | — | N/A | ✅ نعم | الصفحة الرئيسية (أول زيارة) |
| 25 | `GET()` | `getDoc` (R) × 2 | `homepage/layout_config` + `homepage/main-hero` | N/A | ✅ نعم (KV) | الصفحة الرئيسية (عند cache MISS) |
| 47 | `GET()` | `getDocs` (R) | `products` مع `where(documentId() in ids)` | ضمنيًا 30 (بسبب `slice(0, 30)`) | ✅ نعم | الصفحة الرئيسية (عند cache MISS) |
| 79 | `GET()` | `getDocs` (R) | `products` مع `where(documentId() in redirectIds)` | ضمنيًا 30 (بسبب `slice(0, 30)`) | ✅ نعم | الصفحة الرئيسية (عند cache MISS) |
| 90 | `GET()` | `getDocs` (R) | `ProductStats` مع `where(documentId() in ids)` | ضمنيًا 30 (بسبب `slice(0, 30)`) | ✅ نعم | الصفحة الرئيسية (عند cache MISS) |
| 143 | `GET()` | `kvSet` (KV write) | — | N/A | ✅ نعم | — |

#### A12. `api/homepage-reviews/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 10 | `GET()` | `kvGet` (KV read) | — | N/A | ✅ نعم | الصفحة الرئيسية (أول زيارة) |
| 24 | `GET()` | `getDocs` (R) | `Reviews` مع `where(status, published), orderBy(date, desc)` | ✅ `limit(10)` | ✅ نعم | الصفحة الرئيسية (عند cache MISS) |
| 41 | `GET()` | `getDocs` (R) | `products` مع `where(documentId() in handles)` | ضمنيًا 10 (بسبب `slice(0, 10)`) | ✅ نعم | الصفحة الرئيسية (عند cache MISS) |
| 55 | `GET()` | `kvSet` (KV write) | — | N/A | ✅ نعم | — |

#### A13. `api/product/[id]/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 15 | `GET()` | `kvGet` (KV read) | — | N/A | ✅ نعم | صفحة المنتج (أول زيارة) |
| 23 | `GET()` | `getDoc` (R) | `products/{id}` | N/A | ✅ نعم | صفحة المنتج (عند cache MISS) |
| 34 | `GET()` | `kvSet` (KV write) | — | N/A | ✅ نعم | — |

#### A14. `api/product-stats/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 18 | `GET()` | `kvGet` (KV read) | — | N/A | ✅ نعم | ProductCard.js (قديم — يستخدم `product-stats-batch` بدلاً منه) |
| 26 | `GET()` | `getDoc` (R) | `ProductStats/{handle}` | N/A | ✅ نعم | ProductCard.js (أو مباشرة) |
| 38 | `GET()` | `kvSet` (KV write) | — | N/A | ✅ نعم | — |

#### A15. `api/product-stats-batch/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 31 | `GET()` | `kvGet` (KV read) لكل handle | — | N/A | ✅ نعم | صفحات الأقسام (عند تحميل منتجات) |
| 49 | `GET()` | `getDoc` (R) لكل handle | `ProductStats/{handle}` | N/A | ✅ نعم (بعد أول مرة) | صفحات الأقسام (عند cache MISS) |
| 58 | `GET()` | `kvSet` (KV write) | — | N/A | ✅ نعم | — |

#### A16. `api/site-settings/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache (TTL) | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|----------------|--------------|
| 22 | `GET()` | `kvGet` (KV read) | — | N/A | ✅ (TTL=3600) | جميع الصفحات (أول زيارة كل ساعة) |
| 33 | `GET()` | `getDoc` (R) | `settings/siteSettings` | N/A | ✅ (بعد القراءة) | جميع الصفحات (عند cache MISS) |
| 43 | `GET()` | `kvSet` (KV write) | — | N/A | ✅ | — |

#### A17. `api/validate-promo/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 25 | `POST()` | `getDoc` (R) | `promoCodes/{code}` | N/A | ❌ لا | Cart (عند إدخال كود خصم) |
| 59 | `POST()` | `getDoc` (R) | `Customers/{identifier}` | N/A | ❌ لا | Cart (عند إدخال كود خصم) |

#### A18. `api/webhooks/kashier/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 69 | `POST()` | `getDoc` (R) | `Orders/{orderId}` | N/A | ❌ لا | Kashier (بوابة الدفع) |
| 77 | `POST()` | `setDoc` (W) | `Orders/{orderId}` | N/A | ❌ لا | Kashier (بوابة الدفع) |
| 99 | `POST()` | `getDoc` (R) | `Customers/{customerId}` | N/A | ❌ لا | Kashier (بوابة الدفع) |
| 112-117 | `POST()` | `updateDoc` + `setDoc` (W) | `settings` + `Customers` | N/A | ❌ لا | Kashier (بوابة الدفع) |
| 131-163 | `POST()` | `setDoc` + `updateDoc` (W) | `Customers` + `settings` | N/A | ❌ لا | Kashier (بوابة الدفع) |

#### A19. `api/abandoned-cart-save/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 19 | `POST()` | `setDoc` (W) | `Orders/{orderId}` | N/A | ❌ لا | Checkout page (حفظ السلة المتروكة) |

#### A20. `api/register-admin-token/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 51 | `POST()` | `firestoreAdminSet` (W) عبر REST API | `adminTokens/{token}` | N/A | ❌ لا | Admin (تسجيل FCM token) |

#### A21. `api/idempotency-check/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| (لم يتم تحليله بالكامل) | — | متوقع `getDoc` أو `kvGet` | — | — | — | Checkout |

#### A22. `api/idempotency-mark/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| (لم يتم تحليله بالكامل) | — | متوقع `setDoc` أو `kvSet` | — | — | — | Checkout |

#### A23. `api/kashier-callback/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| (لم يتم تحليله بالكامل) | — | متوقع مشابه لـ webhooks/kashier | — | — | — | Kashier |

#### A24. `api/revalidate/route.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | KV Cache | يُستدعى بواسطة |
|-------|-------|------------|---------------|---------|---------|--------------|
| 60 | `POST()` | `kvDeleteMany` (KV write) | — | N/A | ✅ نعم (يمسح فقط) | Admin (عند تعديل/حذف منتج) |

**ملاحظة:** هذا الـ API لا يقرأ Firestore أبدًا. يمسح KV cache فقط.

#### A25-A28. باقي API Routes
`api/delete-image/route.js`, `api/grant-access/route.js`, `api/upload/route.js`, `api/write-ops/route.js`, `api/write-guard-*/route.js`
- هذه الـ APIs لا تقرأ Firestore (تستخدم ImageKit، KV cache، أو تكتب فقط)

---

### B. Admin Pages (`src/app/admin/`)

#### B1. `admin/page.js` (Dashboard)
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 56 | `fetchDashboardStats()` | `fetch()` → API call | (انظر A1) | — | ❌ لا | كل 15 ثانية (سطر 102) |
| 144-175 | (useEffect) | `onValue` (R) على RTDB | `LiveSessions` | N/A | ❌ لا (RTDB) | لحظي (RTDB listener) |

#### B2. `admin/products/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 61 | `fetchProducts()` | `getDocs` (R) | `products` مع `orderBy(createdAt, desc)` | ✅ `limit(20)` | ✅ In-memory cache | مرة واحدة فقط لكل تحميل |
| 111 | `handleDelete()` | `deleteDoc` (W) | `products/{id}` | N/A | — | عند حذف منتج |

#### B3. `admin/products/create/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 128 | `useEffect()` | `getDocs` (R) | `collections` | ✅ `limit(1000)` | ❌ لا | مرة واحدة عند فتح الصفحة |
| 136 | `useEffect()` | `getDocs` (R) | `products` | ✅ `limit(1000)` | ❌ لا | مرة واحدة عند فتح الصفحة |
| 159 | `useEffect()` | `getDoc` (R) | `products/{id}` (للتعديل) | N/A | ❌ لا | عند تعديل منتج |
| 449 | `handleSave()` | `getDoc` (R) | `products/{handle}` | N/A | ❌ لا | عند حفظ منتج |
| 462 | `handleSave()` | `getDocs` (R) | `products` مع `where(handle in ...)` | ❌ لا يوجد | ❌ لا | عند حفظ منتج |
| 564 | `handleSave()` | `setDoc` (W) | `products/{id}` | N/A | ❌ لا | عند حفظ منتج |
| 649 | `handleSave()` | `updateDoc` (W) | `System/Stats` | N/A | ❌ لا | عند حفظ منتج |

#### B4. `admin/orders/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 78 | `fetchOrders()` | `getDocs` (R) | `Orders` مع `orderBy(Created at, desc)` | ✅ `limit(20)` | ✅ Tab cache | مرة واحدة لكل تاب |
| 179 | `handleDeleteSelected()` | `writeBatch` (W) | `Orders` + `settings` | N/A | — | عند حذف طلبات |
| 253 | `exportOrdersToExcel()` | `getDocs` (R) في while loop | `Orders` مع `orderBy, limit(500)` | ✅ `limit(500)` | ❌ لا | عند الضغط على "تصدير" |

#### B5. `admin/orders/[id]/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 31 | `useEffect()` | `getDoc` (R) | `Orders/{orderId}` | N/A | ❌ لا | عند فتح صفحة الطلب |
| 67 | `useEffect()` | `getDocs` (R) | `products` مع `where(...)` | متغير | ❌ لا | عند فتح صفحة الطلب |

#### B6. `admin/customers/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 15 | `fixOldData()` | `getDocs` (R) | `Customers` | ❌ لا يوجد | ❌ لا | عند الضغط على "تحديث الأرشيف" |
| 88 | `fetcher()` | `getDocs` (R) | `Customers` مع `where(data_source)` | ✅ `limit(20)` | ✅ SWR | مرة واحدة لكل تاب |
| 173 | `loadMoreCustomers()` | `getDocs` (R) | `Customers` مع `startAfter` | ✅ `limit(20)` | ❌ لا | عند الضغط على "تحميل المزيد" |
| 271 | `handleDeleteSelected()` | `writeBatch` (W) | `Customers` + `Orders` + `settings` | N/A | — | عند حذف عملاء |
| 290 | `handleDeleteSelected()` | `getDocs` (R) | `Orders` مع `where(Email)` | ✅ `limit(1)` | ❌ لا | عند حذف عميل (لكل عميل) |
| 303 | `handleDeleteSelected()` | `getDocs` (R) | `Orders` مع `where(Phone)` | ✅ `limit(1)` | ❌ لا | عند حذف عميل (لكل عميل) |
| 366 | `exportToExcelForAds()` | `getDocs` (R) في while loop | `Customers` مع `limit(500)` | ✅ `limit(500)` | ❌ لا | عند الضغط على "تصدير" |

#### B7. `admin/customers/[email]/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 19 | `useEffect()` | `getDoc` (R) | `Customers/{email}` | N/A | ❌ لا | عند فتح صفحة العميل |
| 24 | `useEffect()` | `getDocs` (R) | `Customers` مع `where(Email)` | ❌ لا يوجد | ❌ لا | عند فتح صفحة العميل (fallback) |
| 39 | `useEffect()` | `getDocs` (R) | `Orders` مع `where(Email)` | ❌ لا يوجد | ❌ لا | عند فتح صفحة العميل |
| 73 | `useEffect()` | `getDocs` (R) | `products` مع `where(handle in ...)` | ❌ لا يوجد | ❌ لا | عند فتح صفحة العميل |

#### B8. `admin/reviews/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 75 | `fetchData()` | `getDocs` (R) | `products` | ✅ `limit(50)` | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 76 | `fetchData()` | `getDocs` (R) | `ProductStats` | ✅ `limit(100)` | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 110 | `fetchData()` | `getDocs` (R) | `Reviews` مع `orderBy(date, desc)` | ✅ `limit(20)` | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 147 | `searchProducts()` | `getDocs` (R) | `products` مع `orderBy(title)` | ✅ `limit(100)` | ❌ لا | عند البحث عن منتج |
| 175 | `fetchReviews()` | `getDocs` (R) | `Reviews` مع `orderBy(date, desc)` | ✅ `limit(20)` | ❌ لا | عند استدعاء fetchReviews() |
| 221 | `handleUpdateLikes()` | `updateDoc` (W) | `products/{id}` | N/A | ❌ لا | عند حفظ إعجابات |
| 269 | `handleFileUpload()` | `writeBatch` (W) | `Reviews` + `ProductStats` + `products` | N/A | ❌ لا | عند رفع CSV |
| 375 | `handleAddManualReview()` | `writeBatch` (W) | `Reviews` + `ProductStats` + `products` | N/A | ❌ لا | عند إضافة تقييم يدوي |
| 467 | `handleViewProductReviews()` | `getDocs` (R) | `Reviews` مع `where(productHandle)` | ✅ `limit(3)` | ❌ لا | عند الضغط على "عرض التقييمات" |
| 493 | `handleLoadMoreReviews()` | `getDocs` (R) | `Reviews` مع `startAfter` | ✅ `limit(3)` | ❌ لا | عند الضغط على "عرض المزيد" |
| 506 | `handleDeleteReview()` | `writeBatch` (W) | `Reviews` + `ProductStats` + `products` | N/A | ❌ لا | عند حذف تقييم |
| 585 | `recalculateAllProductStats()` | `getDocs` (R) | `Reviews` | ❌ لا يوجد | ❌ لا | عند الضغط على "مزامنة التقييمات" |
| 602 | `recalculateAllProductStats()` | `getDocs` (R) | `products` | ✅ `limit(1000)` | ❌ لا | عند الضغط على "مزامنة التقييمات" |
| 603 | `recalculateAllProductStats()` | `getDocs` (R) | `ProductStats` | ✅ `limit(1000)` | ❌ لا | عند الضغط على "مزامنة التقييمات" |

#### B9. `admin/inventory/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 679 | `loadData()` | `getDocs` (R) | `products` مع `orderBy(createdAt, desc)` | ❌ **لا يوجد** | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 680 | `loadData()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 748 | `writeHistory()` | `addDoc` (W) | `products/{id}/inventoryHistory` | N/A | ❌ لا | عند حفظ تغيير مخزون |
| 794 | `handleSaveVariant()` | `updateDoc` (W) | `products/{id}` | N/A | ❌ لا | عند حفظ تغيير variant |
| 846 | `handleSaveBulk()` | `updateDoc` (W) | `products/{id}` | N/A | ❌ لا | عند حفظ تغيير جماعي |

#### B10. `admin/collections/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 16 | `fetchCollections()` | `getDocs` (R) | `collections` مع `orderBy(title)` | ❌ لا يوجد | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 61 | `fetchCollections()` | `getDocs` (R) | `collections` مع `startAfter` | ❌ لا يوجد | ❌ لا | عند "تحميل المزيد" |
| 92 | `fetchProducts()` | `getDocs` (R) | `products` مع `where(collection)` | ❌ لا يوجد | ❌ لا | عند اختيار قسم |
| 138 | `handleSave()` | `writeBatch` (W) | `collections/{id}` + `products` | N/A | ❌ لا | عند حفظ قسم |
| 200 | `handleDelete()` | `writeBatch` (W) | `collections/{id}` + `products` | N/A | ❌ لا | عند حذف قسم |
| 203 | `handleDelete()` | `getDocs` (R) | `products` مع `where(collections)` | ❌ لا يوجد | ❌ لا | عند حذف قسم |

#### B11. `admin/home-manager/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 14 | `loadData()` | `getDoc` (R) | `homepage/layout_config` | N/A | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 17 | `loadData()` | `getDoc` (R) | `homepage/main-hero` | N/A | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 34 | `loadData()` | `getDocs` (R) | `products` مع `limit(100)` | ✅ `limit(100)` | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 40 | `loadData()` | `getDocs` (R) | `collections` مع `limit(100)` | ✅ `limit(100)` | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 441 | `handleSave()` | `setDoc` (W) | `homepage/layout_config` | N/A | ❌ لا | عند حفظ التغييرات |
| 442 | `handleSave()` | `setDoc` (W) | `homepage/main-hero` | N/A | ❌ لا | عند حفظ التغييرات |

#### B12. `admin/menu/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 29 | `loadData()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 33 | `loadData()` | `getDocs` (R) | `collections` | ❌ لا يوجد | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 296 | `handleSave()` | `setDoc` (W) | `settings/siteSettings` | N/A | ❌ لا | عند حفظ القائمة |

#### B13. `admin/settings/policies/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 31 | `loadData()` | `getDoc` (R) | `Policies/{tab}` | N/A | ❌ لا | مرة واحدة عند تحميل الصفحة |
| 47 | `handleSave()` | `setDoc` (W) | `Policies/{tab}` | N/A | ❌ لا | عند حفظ السياسات |

#### B14. `admin/settings/page.js` و `admin/login/page.js` و `admin/live/page.js`
- `settings/page.js` و `login/page.js`: (لم يتم تحليلها بالكامل)
- `live/page.js`: يستخدم RTDB فقط (`onValue`)، لا يقرأ Firestore
- `inventory-migration/page.jsx`: يقرأ `getDocs(products)` بدون limit (سطر 200) + `updateDoc`, `setDoc` — (أداة هجرة لمرة واحدة)

---

### C. Server Components (`src/app/`)

#### C1. `app/page.js` (الصفحة الرئيسية)
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| — | — | لا توجد استدعاءات Firestore مباشرة | — | — | — |

#### C2. `app/collections/[slug]/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 46 | `GET()` | `getDocs` (R) | `collections` مع `where(slug)` | ✅ `limit(1)` | ❌ لا |
| 54 | `GET()` | `getDocs` (R) | `collections` مع `where(fields.slug.stringValue)` | ✅ `limit(1)` | ❌ لا |

#### C3. `app/products/[id]/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 40 | `GET()` | `getDoc` (R) | `products/{id}` | N/A | ❌ لا (KV عبر API) |

#### C4. `app/policies/[slug]/page.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 21 | `GET()` | `getDoc` (R) | `Policies/{slug}` | N/A | ❌ لا |

#### C5. `app/sitemap.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 17 | `GET()` | `getDocs` (R) | `products` | ✅ `limit(1000)` | ❌ لا |

---

### D. Client Components (`src/components/`)

#### D1. `components/HomeSectionsMain.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| — | — | (يستخدم hooks من useFirestore.js) | — | — | ✅ (عبر API routes) |

#### D2. `components/products/ProductCard.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 144 | — | `updateDoc` (W) | `products/{id}` | N/A | ❌ لا |
| 151 | — | `updateDoc` (W) | `products/{id}` | N/A | ❌ لا |
| 182-183 | — | `getDoc` (R) | `products/{id}` | N/A | ❌ لا |

#### D3. `components/products/ProductReviews.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 52 | `useEffect()` | `getDoc` (R) | `ProductStats/{handle}` | N/A | ❌ لا |
| 67 | `useEffect()` | `getDocs` (R) | `Reviews` مع `where(productHandle)` | ✅ `limit(3)` | ❌ لا |
| 72 | `useEffect()` | `setDoc` (W) | `ProductStats/{handle}` | N/A | ❌ لا |
| 99 | `fetchMoreReviews()` | `getDocs` (R) | `Reviews` مع `startAfter` | ✅ `limit(3)` | ❌ لا |
| 111 | `fetchMoreReviews()` | `getDocs` (R) | `Reviews` مع `where(rating)` | ✅ `limit(3)` | ❌ لا |
| 139 | `handleSubmitReview()` | `setDoc` (W) | `ProductStats/{handle}` | N/A | ❌ لا |
| 168 | `handleSubmitReview()` | `addDoc` (W) | `Reviews` | N/A | ❌ لا |
| 172 | `handleSubmitReview()` | `setDoc` (W) | `ProductStats/{handle}` | N/A | ❌ لا |

#### D4. `components/BundleWidget.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 109 | `useEffect()` | `getDoc` (R) | `products/{handle}` | N/A | ❌ لا |

#### D5. `components/layout/CartDrawer.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 77 | `loadCartProducts()` | `getDocs` (R) | `products` مع `where(documentId() in ids)` | ضمنيًا (حسب عدد المنتجات) | ❌ لا |
| 91 | `loadCartProducts()` | `getDocs` (R) | `products` مع `where(handle in handles)` | ضمنيًا | ❌ لا |

#### D6-D11. Other Components
- `components/OrderNotifications.js`: يكتب `setDoc` إلى `adminTokens/{token}` (W فقط)
- `components/LiveTracker.js`: يكتب إلى RTDB (ليس Firestore)
- `components/CheckoutButton.js`: (لم يتم تحليله بالكامل)
- `components/ImageUploader.jsx`: يرفع صورًا (ليس Firestore)
- `components/WhatsAppWidget.jsx`: (لم يتم تحليله بالكامل)

---

### E. Contexts (`src/context/`)

#### E1. `context/SettingsContext.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 47 | `useEffect()` | `getDoc` (R) | `visitor_events/{sessionId}_{date}` | N/A | ❌ لا | مرة واحدة لكل جلسة زائر |
| 58 | `useEffect()` | `setDoc` (W) | `visitor_events/{sessionId}_{date}` | N/A | ❌ لا | مرة واحدة لكل جلسة زائر جديدة |
| 79 | `useEffect()` | `getDoc` (R) | `settings/siteSettings` | N/A | ❌ لا | مرة واحدة لكل جلسة زائر |
| 93 | `useEffect()` | `updateDoc` (W) | `settings/siteSettings` | N/A | ❌ لا | مرة واحدة لكل جلسة زائر جديدة |
| 105 | `useEffect()` | `updateDoc` (W) (fallback) | `settings/siteSettings` | N/A | ❌ لا | عند فشل التحديث الأول |
| 134 | `useEffect()` | `updateDoc` (W) (fallback2) | `settings/siteSettings` | N/A | ❌ لا | عند فشل الفحص الأولي |

#### E2. `context/AuthContext.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache | عدد مرات التنفيذ |
|-------|-------|------------|---------------|---------|-------|-----------------|
| 23 | `useEffect()` | `getDoc` (R) | `Users/{uid}` | N/A | ❌ لا | مرة واحدة للمستخدمين المسجلين فقط |

#### E3. `context/CartContext.js`
- لا توجد استدعاءات Firestore مباشرة (يستخدم `fetch()` إلى `/api/validate-promo` و `/api/site-settings`)

#### E4. `context/GlobalLoaderContext.js`
- لا توجد استدعاءات Firestore

---

### F. Hooks (`src/hooks/`)

#### F1. `hooks/useFirestore.js`
(جميع الاستدعاءات تم توثيقها في التقرير الرئيسي - الجدول 1.3. تم تضمينها هنا للإكمال)

| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 40 | `fetchDoc()` | `getDoc` (R) | ديناميكي (حسب الـ path) | N/A | ✅ (KV عبر API) |
| 55 | `fetchCollection()` | `getDocs` (R) | ديناميكي (حسب الـ path) | ✅ limit(limitCount \|\| 20) | ✅ (SWR) |
| 77 | `fetchHomepageReviews()` | `getDocs` (R) | `Reviews` مع `where(published), orderBy(date)` | ✅ limit(10) | ✅ (KV + SWR) |
| 87 | `fetchHomepageReviews()` | `getDocs` (R) | `products` مع `where(documentId() in handles)` | ضمنيًا 10 | ✅ |
| 100 | `fetchHomepageReviews()` | `getDocs` (R) | `products` مع `where(handle in missing)` | ضمنيًا | ✅ |
| 136 | `fetchHomepageProductsSections()` | `getDocs` (R) × 4 | منتجات متعددة + ProductStats + Reviews | limit(5,5,5,50) | ✅ (KV + SWR) |
| 177 | `fetchHomepageProductsSections()` | `getDocs` (R) | `products` مع `where(documentId() in ids)` | ضمنيًا | ✅ |
| 285 | `usePaginatedProducts()` | `getDocs` (R) | `products` مع `where(array-contains-any)` | ✅ limit(10) | ✅ (SWR) |
| 301 | `usePaginatedProducts()` | `getDocs` (R) | `products` (نفس الاستعلام) | ✅ limit(10) | ✅ (SWR) |
| 361 | `useProduct()` | `getDoc` (R) | `products/{id}` | N/A | ✅ (KV + SWR) |
| 382 | `useRelatedProducts()` | `getDoc` (R) لكل handle | `products/{handle}` | N/A | ✅ (SWR فقط) |
| 395 | `useRelatedProducts()` | `getDocs` (R) | `products` مع `where(array-contains)` | ✅ limit(6) | ✅ (SWR فقط) |
| 405 | `useRelatedProducts()` | `getDocs` (R) | `products` | ✅ limit(6) | ✅ (SWR فقط) |
| 449 | `usePaginatedReviews()` | `getDocs` (R) | `Reviews` مع `where(productHandle)` | ✅ limit(3) | ✅ (SWR فقط) |

---

### G. Libraries (`src/lib/`)

#### G1. `lib/fcmAdmin.js`
| السطر | الدالة | نوع العملية | الـ Collection | limit() | Cache |
|-------|-------|------------|---------------|---------|-------|
| 20 | `cleanupOldTokens()` | `getDocs` (R) | `adminTokens` | ❌ لا يوجد | ❌ لا |
| 34 | `cleanupOldTokens()` | `firestoreAdminDelete` (W) | `adminTokens/{token}` | N/A | ❌ لا |

#### G2. `lib/firebase-checkout.js`
- يُنشئ Firebase instance منفصل لصفحة Checkout
- يحتوي على `getDb()` خاص

#### G3. `lib/firebase-edge.js`
- يُنشئ Firebase instance للحظة التشغيل Edge
- يستخدم `getFirestore()` (I) + `getEdgeDb()` (I)

#### G4. `lib/firebase.js`
- يُنشئ Firebase instance الرئيسي
- `getDb()` (I), `getFirestore()` (I)

#### G5. `lib/firestoreAdmin.js`
- Helper للكتابة عبر REST API
- `firestoreAdminSet()` (W), `firestoreAdminDelete()` (W)

#### G6. `lib/writeOptimizer.js`
- يستخدم `writeBatch` (W) داخليًا

---

## H. Queries Not Yet Accounted For

هذا القسم يحتوي على الاستعلامات التي لم أتمكن من تحليل تأثيرها بالكامل لأن الملفات المقابلة لم تُقرأ بالكامل بعد:

| # | الملف | السبب | ما الذي أحتاجه لتحليله؟ |
|---|-------|-------|----------------------|
| H1 | `src/app/api/create-order/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً لتحديد عدد استدعاءات Firestore |
| H2 | `src/app/api/fb-track/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H3 | `src/app/api/idempotency-check/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H4 | `src/app/api/idempotency-mark/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H5 | `src/app/api/kashier-callback/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H6 | `src/app/api/write-ops/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H7 | `src/app/api/write-guard-acquire/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H8 | `src/app/api/write-guard-check/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H9 | `src/app/api/write-guard-release/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H10 | `src/app/api/grant-access/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H11 | `src/app/api/upload/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H12 | `src/app/api/delete-image/route.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H13 | `src/app/admin/settings/page.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H14 | `src/app/admin/login/page.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H15 | `src/app/admin/inventory-migration/page.jsx` | تم تحليل جزئي — يقرأ `getDocs(products)` بدون limit | قراءة الملف كاملاً |
| H16 | `src/app/checkout/page.js` | تم تحليل جزئي — يحتوي على استدعاءات كثيرة | قراءة الملف كاملاً |
| H17 | `src/components/WhatsAppWidget.jsx` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |
| H18 | `src/components/CheckoutButton.js` | لم يتم تحليل هذا الملف بالكامل | قراءة الملف كاملاً |

### حالة هذه الاستعلامات:
- معظم هذه الملفات إما:
  - APIs للكتابة فقط (write-ops, write-guard, delete-image, upload)
  - APIs لتكامل خارجي (kashier-callback, fb-track, grant-access)
  - صفحات Admin ثانوية (settings, login)
  - تكاملات لجهات خارجية (WhatsAppWidget)

- **من المتوقع أن معظمها لا يسبب قراءات كبيرة** لأنها إما:
  - APIs للكتابة (لا تقرأ)
  - تُستدعى نادرًا (login, settings)
  - تُستدعى فقط عند أحداث محددة (webhook, checkout)

---

## الملخص الإحصائي

| الفئة | عدد الملفات المحللة | عدد استدعاءات القراءة (getDoc/getDocs/runQuery) | عدد استدعاءات الكتابة (setDoc/updateDoc/writeBatch) |
|-------|--------------------|----------------------------------------------|---------------------------------------------------|
| API Routes | 28 | 20+ | 15+ |
| Admin Pages | 16 | 30+ | 15+ |
| Server Components | 5 | 5 | 0 |
| Client Components | 15+ | 8+ | 8+ |
| Contexts | 4 | 4 | 4+ |
| Hooks | 1 | 15+ | 0 |
| Libraries | 10+ | 1 | 3+ |
| **الإجمالي** | **~80** | **80+** | **45+** |

---

*تم إعداد هذا الجرد بناءً على مسح آلي لجميع ملفات `src/` باستخدام Select-String للبحث عن أنماط Firebase/Firestore.*