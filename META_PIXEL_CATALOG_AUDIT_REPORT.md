# تقرير تدقيق شامل لمشروع Meta Pixel + Catalog
## WIND Shopping — Audit Date: June 28, 2026

---

# Executive Summary

تم فحص المشروع بالكامل من منظور Meta Pixel و Conversions API و Catalog. المشروع يستخدم **استراتيجية هجينة** متقدمة: يعتمد على **Server-Side Tracking فقط** (عبر `/api/fb-track`) لجميع الأحداث المحتوية على Arrays (ViewContent, AddToCart, InitiateCheckout, Purchase) لتجنب مشكلة Flattening في الوسطاء، بينما يبقى **PageView فقط** عبر Browser Pixel (fbq) لتوليد الكوكيز _fbp/_fbc.

**التقييم العام: جيد جداً من ناحية الهيكلة والممارسات المتقدمة، لكن توجد مشكلات حرجة في:**

1. **Deduplication غير مكتمل** — لا يوجد event_id مطابق بين Browser و Server
2. **بيانات المستخدم (EMQ) ناقصة** — state, zip, country, last_name غير مرسلة بشكل كامل
3. **Product Type غير دقيق** — يعتمد على أسماء الأقسام (Slugs) بدلاً من تصنيف هرمي حقيقي
4. **Match Rate منخفض محتمل** — اختلاف في Product IDs بين Pixel و Catalog
5. **Missing Fields في Catalog** — size, gender, age_group, material, pattern غير موجودة

---

# Critical Issues (مرتبة حسب الأولوية)

## 🔴 CRITICAL 1: Deduplication غير مكتمل بين Browser و Server Events

**السبب الجذري:** 
- Browser Pixel (fbq) يُرسل `PageView` تلقائياً من `layout.js` بدون `event_id` مخصص
- Server Events تُرسل عبر `/api/fb-track` مع `event_id` مولد (مثل `Purchase-1712345678-a1b2c3`)
- لا يوجد `event_id` متطابق بين Browser و Server لنفس الحدث
- Meta لا تستطيع ربط Browser Event مع Server Event لنفس الإجراء

**درجة الثقة: High** — الكود واضح، لا يوجد أي محاولة لمطابقة event_id بين المصدرين.

**التأثير:** 
- قد يتم احتساب بعض الأحداث مرتين (Double Counting)
- يقلل دقة التقارير في Ads Manager
- يؤثر سلباً على Attribution

**كيفية الإصلاح:**
- إرسال نفس `event_id` من Browser (fbq) و Server (CAPI) لكل حدث
- استخدام `eventID` parameter في `fbq('track', 'Purchase', { eventID: '...' })` ليتطابق مع CAPI

---

## 🔴 CRITICAL 2: Product IDs غير متطابقة بين Pixel و Catalog

**السبب الجذري:**
- في `ProductView.js`، `content_ids` تُرسل كـ `String(product.handle || id || product.id)` — أي تستخدم `handle` أو `id` الرقمي
- في `fb-catalog/route.js`، Product ID في XML هو `handle` للمنتج الرئيسي، و`handle-colorKey` للـ Variants
- في `checkout/page.js`، `content_ids` تُرسل كـ `String(it.handle || it.id || it.title)` — قد ترسل `title` كـ Fallback!
- في `thank-you/page.js`، نفس المشكلة: `String(it.handle || it.id || it.title)`

**درجة الثقة: High** — الاختلاف واضح في الكود.

**التأثير:**
- **انخفاض Match Rate** لأن Meta لا تستطيع مطابقة Pixel Events مع Catalog Products
- Dynamic Ads قد تعرض منتجات خاطئة أو لا تعرض أي منتج
- يضعف أداء حملات Product Catalog Sales

**كيفية الإصلاح:**
- توحيد Product ID المستخدم في Pixel ليطابق بالضبط `g:id` في Catalog XML
- إزالة Fallback إلى `it.title` لأنه سيفشل في المطابقة دائماً
- التأكد من أن Variant IDs في Pixel تطابق `handle-colorKey` في Catalog

---

## 🔴 CRITICAL 3: Event Match Quality منخفض — بيانات مستخدم ناقصة

**السبب الجذري:**
- في `fb-track/route.js`، يتم إرسال: `em`, `ph`, `fn`, `ln`, `ct`, `external_id`, `fbp`, `fbc`, `client_ip_address`, `client_user_agent`
- **المفقود:** `state` (المحافظة), `zip` (الرمز البريدي), `country` (الدولة), `gender`, `date_of_birth`
- في `checkout/page.js`، عند إرسال Purchase، يتم إرسال `email, phone, first_name, last_name, city` فقط — **لا يتم إرسال `governorate` (المحافظة) كـ `state`**
- `country` غير مرسل نهائياً (مصر = EG)
- `zip` (postalCode) موجود في الفورم لكنه غير مرسل لـ fbTrack

**درجة الثقة: High** — الفحص المباشر للكود يؤكد النقص.

**التأثير:**
- EMQ Score أقل من الممكن
- يقلل جودة استهداف الجماهير المشابهة (Lookalike Audiences)
- يضعف أداء حملات إعادة الاستهداف (Retargeting)

**كيفية الإصلاح:**
- إضافة `state: formData.governorate` إلى Purchase event
- إضافة `zip: formData.postalCode` إلى Purchase event
- إضافة `country: "eg"` (hashed) إلى جميع الأحداث
- إرسال `ct` (city) بشكل متسق في جميع الأحداث

---

## 🔴 CRITICAL 4: Product Type غير دقيق — يعتمد على أسماء الأقسام (Slugs)

**السبب الجذري:**
- في `fb-catalog/route.js`، `productType` يُستخرج من `meaningfulCollections[0].replace(/-/g, " ")`
- هذا يعني أن Product Type هو مجرد اسم Slug (مثل "women-shawls" → "women shawls")
- لا يوجد تسلسل هرمي حقيقي (Hierarchy) مثل "Apparel & Accessories > Clothing > Outerwear"
- الأقسام العامة (shop-all, new-arrivals, best-sellers, sale) يتم استبعادها
- `google_product_category` يستخدم Fallback ثابت: `"Apparel & Accessories > Clothing"` لمعظم المنتجات

**درجة الثقة: High** — الكود يظهر بوضوح آلية استخراج Product Type.

**التأثير:**
- Meta لا تفهم تصنيف المنتجات بشكل صحيح
- يضعف أداء Dynamic Ads في عرض المنتجات المناسبة
- يقلل جودة الفلترة داخل Facebook Catalog
- يمنع Meta من فهم العلاقات بين المنتجات

**كيفية الإصلاح:**
- إنشاء خريطة (Mapping) بين أسماء الأقسام و Google Product Categories الصحيحة
- استخدام تصنيف هرمي حقيقي: `product_type = "الملابس > الشالات > شالات نسائية"`
- تعيين `google_product_category` دقيق لكل منتج بدلاً من القيمة الافتراضية

---

## 🔴 CRITICAL 5: Missing Fields في Catalog Feed

**السبب الجذري:**
- في `fb-catalog/route.js`، الحقول التالية غير موجودة في XML:
  - `g:size` — المقاسات
  - `g:gender` — الجنس (female/male/unisex)
  - `g:age_group` — الفئة العمرية (adult)
  - `g:material` — الخامة
  - `g:pattern` — النقش/التصميم
  - `g:condition` — موجود لكنه ثابت "new"
  - `g:item_group_id` — موجود فقط للـ Variants

**درجة الثقة: High** — الفحص المباشر لبناء XML.

**التأثير:**
- يقلل جودة الفلترة والبحث داخل Facebook Catalog
- يمنع Meta من فهم خصائص المنتجات
- يضعف أداء Dynamic Ads

**كيفية الإصلاح:**
- إضافة `g:size` للمنتجات التي لها مقاسات
- إضافة `g:gender` (يفضل "female" للمنتجات النسائية)
- إضافة `g:age_group` ("adult")
- إضافة `g:material` من بيانات المنتج في Firestore
- إضافة `g:pattern` إذا كانت متوفرة

---

# Pixel Findings

## 1. Pixel Installation ✅

| الفحص | النتيجة | الثقة |
|-------|---------|-------|
| Pixel مركب مرة واحدة فقط | ✅ نعم، في `layout.js` | High |
| Duplicate Pixel | ✅ لا يوجد | High |
| Pixel يُحمل أكثر من مرة | ✅ لا، `fbq` يتحقق `if(f.fbq)return` | High |
| تضارب بين GTM و Meta SDK | ✅ لا يوجد GTM | High |
| أحداث تُطلق مرتين | ⚠️ محتمل (انظر أدناه) | Medium |

## 2. Event Tracking

### PageView
- **أين:** `layout.js` — سطر 59: `fbq('track', 'PageView')`
- **متى:** بعد تحميل الصفحة مباشرة (strategy: afterInteractive)
- **التوقيت:** ✅ صحيح
- **إطلاق متكرر:** ✅ لا، مرة واحدة فقط في Root Layout
- **Race Conditions:** ✅ لا يوجد

### ViewContent
- **أين:** `ProductView.js` — سطر 166-172
- **متى:** بعد تحميل المنتج و signalPageReady
- **التوقيت:** ✅ صحيح (بعد توفر بيانات المنتج)
- **إطلاق متكرر:** ⚠️ محتمل — `useEffect` يعتمد على `[loading, product, pathname, signalPageReady]`، تغيير `pathname` قد يسبب إعادة إطلاق
- **Race Conditions:** ✅ لا يوجد (يستخدم useRef للتحقق)

### AddToCart
- **أين:** `ProductView.js` — 3 مرات (سطور 576, 648, 894)
- **متى:** عند الضغط على زر "أضف إلى السلة"
- **التوقيت:** ✅ صحيح
- **إطلاق متكرر:** ⚠️ **محتمل** — يوجد 3 أزرار منفصلة (Mobile original, Mobile sticky, Desktop) وكلها ترسل الحدث بشكل مستقل. إذا ضغط المستخدم على زر ثم على الآخر، سيتم إرسال AddToCart مرتين
- **Race Conditions:** ✅ لا يوجد

### InitiateCheckout
- **أين:** `checkout/page.js` — سطر 209-215
- **متى:** عند تحميل صفحة الدفع
- **التوقيت:** ✅ صحيح (بعد cartItems)
- **إطلاق متكرر:** ✅ لا (يستخدم `checkoutEventSentRef`)
- **Race Conditions:** ✅ لا يوجد

### Purchase
- **أين:** 
  - `checkout/page.js` — سطر 618-629 (COD/InstaPay)
  - `thank-you/page.js` — سطر 42-53 (Card payments)
- **متى:** بعد تأكيد الطلب
- **التوقيت:** ✅ صحيح
- **إطلاق متكرر:** ⚠️ **محتمل** — إذا أعاد المستخدم تحميل thank-you page، قد يُرسل Purchase مرة أخرى (pendingOrder لا يزال في localStorage)
- **Race Conditions:** ✅ لا يوجد

### Search
- **غير موجود** — لا يوجد Search event في أي ملف

### Lead
- **غير موجود** — لا يوجد Lead event

### CompleteRegistration
- **غير موجود** — لا يوجد CompleteRegistration event

## 3. Parameters Analysis

| المعامل | ViewContent | AddToCart | InitiateCheckout | Purchase | المشكلة |
|---------|-------------|-----------|------------------|----------|---------|
| content_ids | ✅ `[handle/id]` | ✅ `[handle/id]` | ✅ `[handle/id]` | ⚠️ `handle/id/title` | Fallback إلى title يسبب فشل مطابقة |
| content_type | ✅ "product" | ✅ "product" | ❌ غير مرسل | ❌ غير مرسل | Missing |
| value | ✅ price | ✅ price | ✅ finalTotal | ✅ finalTotal | صحيح |
| currency | ✅ "EGP" | ✅ "EGP" | ✅ "EGP" | ✅ "EGP" | صحيح |
| contents | ❌ غير مرسل | ❌ غير مرسل | ❌ غير مرسل | ❌ غير مرسل | Missing |
| num_items | ✅ quantity | ✅ quantity | ✅ total qty | ✅ total qty | صحيح |
| search_string | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A | N/A |
| order_id | ❌ N/A | ❌ N/A | ❌ N/A | ✅ orderId | صحيح |
| transaction_id | ❌ N/A | ❌ N/A | ❌ N/A | ❌ غير مرسل | Missing |

## 4. Event Match Quality (EMQ)

### ما يتم إرساله حالياً:
- `em` (email) — ✅ في Purchase فقط
- `ph` (phone) — ✅ في Purchase فقط
- `fn` (first_name) — ✅ في Purchase فقط
- `ln` (last_name) — ✅ في Purchase فقط
- `ct` (city) — ✅ في Purchase فقط
- `external_id` — ✅ في جميع الأحداث (من localStorage)
- `fbp` — ✅ في جميع الأحداث
- `fbc` — ✅ في جميع الأحداث
- `client_ip_address` — ✅ في جميع الأحداث (من CF-Connecting-IP)
- `client_user_agent` — ✅ في جميع الأحداث

### ما هو مفقود:
| الحقل | الحالة | التأثير | الثقة |
|-------|--------|---------|-------|
| `state` (المحافظة) | ❌ غير مرسل | يخفض EMQ | High |
| `zip` (الرمز البريدي) | ❌ غير مرسل | يخفض EMQ | High |
| `country` (الدولة) | ❌ غير مرسل | يخفض EMQ | High |
| `gender` | ❌ غير متوفر | يخفض EMQ | Medium |
| `date_of_birth` | ❌ غير متوفر | يخفض EMQ | Medium |

### ملاحظات هامة:
- **بيانات المستخدم تُرسل فقط في Purchase** — ViewContent, AddToCart, InitiateCheckout لا تحتوي على أي بيانات مستخدم (em, ph, fn, ln, ct)
- هذا يخفض EMQ بشكل كبير لمعظم الأحداث
- **درجة الثقة: High**

## 5. Deduplication

### الوضع الحالي:
- Browser Pixel (fbq) يُرسل `PageView` فقط
- جميع الأحداث الأخرى تُرسل عبر Server (CAPI) فقط
- لا يوجد `event_id` مطابق بين Browser و Server

### المشكلة:
- حتى مع إرسال الأحداث من Server فقط، **PageView من Browser لا يزال نشطاً**
- إذا تم تفعيل Browser Pixel لأحداث أخرى في المستقبل، سيكون هناك Double Counting
- **event_id** مولد عشوائياً ولا يتبع نمطاً ثابتاً يمكن لـ Meta استخدامه للربط

### التقييم:
- **درجة الخطورة: Critical**
- **درجة الثقة: High**

## 6. Browser vs Server

| الجانب | Browser (fbq) | Server (CAPI) |
|--------|---------------|---------------|
| PageView | ✅ يُرسل | ❌ لا يُرسل |
| ViewContent | ❌ لا يُرسل | ✅ يُرسل عبر /api/fb-track |
| AddToCart | ❌ لا يُرسل | ✅ يُرسل عبر /api/fb-track |
| InitiateCheckout | ❌ لا يُرسل | ✅ يُرسل عبر /api/fb-track |
| Purchase | ❌ لا يُرسل | ✅ يُرسل عبر /api/fb-track |
| User Data | ❌ لا يوجد | ✅ جزئي (فقط في Purchase) |
| Product IDs | ❌ لا يوجد | ✅ موجود |

**الاستنتاج:** الاستراتيجية الحالية (Server-only للأحداث الغنية) صحيحة من الناحية التقنية، لكنها تفقد فائدة Browser Pixel في تحسين EMQ عبر إشارات المتصفح.

## 7. Purchase Accuracy

| العنصر | القيمة | ملاحظة |
|--------|--------|--------|
| قيمة الطلب | `finalTotal` | ✅ صحيح (subtotal - discount + shipping) |
| الضرائب | غير محسوبة | ⚠️ لا توجد ضريبة في مصر للمتاجر الإلكترونية الصغيرة |
| الشحن | `shipping` | ✅ صحيح |
| العملة | "EGP" | ✅ صحيح |
| الخصومات | `discount` | ✅ مطروحة من الإجمالي |

**درجة الثقة: High** — الحسابات صحيحة.

## 8. Dynamic Events

| الحدث | Product ID يطابق Catalog؟ | ملاحظة |
|-------|--------------------------|--------|
| ViewContent | ⚠️ جزئياً | يستخدم `handle` أو `id` الرقمي — Catalog يستخدم `handle` للمنتجات الرئيسية و`handle-colorKey` للـ Variants |
| AddToCart | ⚠️ جزئياً | نفس المشكلة |
| InitiateCheckout | ⚠️ جزئياً | يستخدم `handle` أو `id` أو `title` (Fallback خطير) |
| Purchase | ⚠️ جزئياً | نفس مشكلة Fallback إلى `title` |

**درجة الثقة: High**

---

# Catalog Findings

## 1. Product IDs

| الفحص | النتيجة | الثقة |
|-------|---------|-------|
| IDs فريدة | ✅ نعم | High |
| Duplicate IDs | ✅ لا يوجد | High |
| نفس IDs في Pixel | ⚠️ جزئياً (انظر Critical #2) | High |
| اختلاف Capitalization | ✅ لا يوجد | High |
| اختلاف بين Feed و Pixel | ⚠️ موجود (handle vs id vs title) | High |

## 2. Product Feed Quality

### الحقول الموجودة في XML:
- `g:id` ✅
- `g:item_group_id` ✅ (لـ Variants فقط)
- `g:title` ✅
- `g:description` ✅
- `g:link` ✅
- `g:image_link` ✅
- `g:additional_image_link` ✅
- `g:availability` ✅
- `g:price` / `g:sale_price` ✅
- `g:brand` ✅ ("WIND Shopping")
- `g:condition` ✅ ("new")
- `g:color` ✅ (لـ Variants فقط)
- `g:google_product_category` ⚠️ (معظمها "Apparel & Accessories > Clothing")
- `g:product_type` ⚠️ (من Slug)
- `g:custom_label_0` إلى `g:custom_label_4` ✅

### الحقول المفقودة:
| الحقل | التأثير | الثقة |
|-------|---------|-------|
| `g:size` | يمنع الفلترة بالمقاس | High |
| `g:gender` | يمنع تحديد الجمهور المستهدف | High |
| `g:age_group` | يمنع تحديد الفئة العمرية | High |
| `g:material` | يمنع الفلترة بالخامة | High |
| `g:pattern` | يمنع الفلترة بالتصميم | Medium |
| `g:shipping` | معلومات الشحن | Medium |
| `g:shipping_weight` | وزن الشحن | Low |

## 3. Product Type Analysis

### آلية العمل الحالية:
1. تجلب `categories` من Firestore (أو `selectedCollections` كـ Fallback)
2. تستبعد الأقسام العامة (shop-all, new-arrivals, best-sellers, sale)
3. تأخذ أول قسم متبقي كـ `product_type` بعد تحويل `-` إلى مسافات
4. الأقسام المتبقية تذهب إلى `custom_label_0..4`

### المشاكل:
1. **لا يوجد تسلسل هرمي** — `product_type` هو مجرد كلمة واحدة (مثل "women shawls")
2. **Meta تتوقع تسلسلاً هرمياً** مثل "الملابس > الشالات > شالات نسائية"
3. **الأقسام غير دقيقة** — تعتمد على أسماء الـ Slugs الإنجليزية
4. **Google Product Category غير دقيق** — معظم المنتجات تستخدم Fallback واحد

### الجذر:
- المشكلة ليست في الكود نفسه، بل في **بيانات التصنيف في Firestore**
- الـ `categories` array يحتوي على Slugs (مثل "women-shawls") بدلاً من تصنيف هرمي
- لا يوجد حقل `googleProductCategory` محدد لكل منتج

**درجة الثقة: High**

## 4. Match Rate Analysis

### الأسباب المحتملة لانخفاض Match Rate:

| السبب | موجود؟ | التفاصيل | الثقة |
|-------|--------|---------|-------|
| اختلاف Product IDs | ✅ نعم | Pixel يرسل `handle`/`id`/`title`، Catalog يستخدم `handle` و`handle-colorKey` | High |
| اختلاف المحتوى | ⚠️ محتمل | بيانات المنتج قد تختلف بين Pixel و Catalog | Medium |
| Missing Variants | ✅ نعم | Pixel لا يرسل Variant IDs محددة (لون/مقاس) | High |
| Wrong content_ids | ✅ نعم | Fallback إلى `title` في بعض الحالات | High |
| Wrong content_type | ⚠️ جزئياً | يُرسل "product" دائماً، لكن قد يحتاج "product_group" | Medium |
| SKU Problems | ⚠️ محتمل | لا يوجد SKU منفصل في Catalog | Medium |
| Variant Problems | ✅ نعم | Variant IDs في Catalog (handle-colorKey) لا تطابق Pixel | High |
| Feed Delay | ⚠️ محتمل | KV Cache لمدة ساعة قد يسبب تأخير | Medium |
| Catalog Sync Delay | ⚠️ محتمل | يعتمد على توقيت تحديث KV | Medium |
| Duplicate Products | ✅ لا يوجد | — | High |
| Hidden/Archived | ✅ لا يوجد | — | High |
| Missing item_group_id | ✅ موجود للـ Variants | — | High |

## 5. Feed Structure

### آلية العمل:
1. API Route (`/api/fb-catalog`) يُستدعى عند الطلب
2. يتحقق من KV Cache أولاً (مفتاح `fb_catalog_xml_v8`)
3. إذا لم يكن في Cache، يجلب المنتجات من Firestore REST API
4. يبني XML يدوياً
5. يخزن في KV Cache لمدة ساعة
6. يُعاد كـ XML Response

### التقييم:
- **Cache Strategy:** ✅ جيدة (KV Cache + Cache-Control header)
- **Firestore Query:** ✅ تستخدم `status == "Active"` فقط
- **XML Building:** ✅ جيد مع تعامل مع Variants
- **Image Handling:** ✅ جيد مع colorSwatches

### المشاكل:
- **KV Cache لمدة ساعة** — قد يسبب تأخير في تحديث المنتجات الجديدة
- **لا يوجد Incremental Update** — كل تحديث يعيد بناء الـ XML بالكامل
- **Error Handling:** ⚠️ إذا فشل KV، لا يوجد Fallback

## 6. Category Structure

### الوضع الحالي:
- `categories` array في Firestore يحتوي على Slugs
- `google_product_category` يستخدم Fallback ثابت لمعظم المنتجات
- `product_type` يُستخرج من أول Slug

### التقييم:
- **لا يساعد Meta على فهم المنتجات** بشكل جيد
- **يفتقر إلى التسلسل الهرمي** المطلوب لـ Facebook Catalog
- **Google Product Category غير دقيق** — معظم المنتجات مصنفة كـ "Apparel & Accessories > Clothing"

## 7. Variants

### الوضع الحالي:
- Variants تُبنى من `variants` array في Firestore
- `item_group_id` = `handle` (المنتج الأب)
- `g:id` = `handle` (للأول) أو `handle-colorKey` (للباقي)
- `g:color` يُضاف للـ Variants
- `g:size` **غير موجود** في XML

### التقييم:
- **item_group_id:** ✅ صحيح
- **Variant IDs:** ✅ صحيح (handle-colorKey)
- **Missing size:** ❌ المقاسات غير موجودة في Catalog
- **Missing additional attributes:** ❌ لا يوجد `g:size`, `g:gender`

## 8. Images

| الفحص | النتيجة | الثقة |
|-------|---------|-------|
| جودة الصور | ✅ جيدة (من ImageKit/CDN) | High |
| أبعادها | ⚠️ غير محددة في Catalog | Medium |
| نسبة العرض | ⚠️ غير محددة | Medium |
| أسماء الملفات | ✅ مقبولة | High |
| إمكانية الزحف | ✅ URLs قابلة للوصول | High |
| سرعة التحميل | ✅ عبر CDN (ImageKit) | High |
| الروابط | ✅ صحيحة | High |
| Broken Images | ⚠️ محتمل (لا يوجد تحقق) | Medium |

## 9. Feed Refresh

| الفحص | النتيجة | الثقة |
|-------|---------|-------|
| طريقة التحديث | عند الطلب (On-demand) | High |
| زمن التحديث | ساعة واحدة (KV Cache) | High |
| تأخر البيانات | محتمل (Cache) | Medium |
| Cache | ✅ KV + Cache-Control | High |
| CDN | ✅ عبر Cloudflare | High |

---

# Data Quality Findings

| المشكلة | موجودة؟ | الموقع | الثقة |
|---------|---------|--------|-------|
| Missing Fields | ✅ نعم | Catalog (size, gender, age_group, material) | High |
| Null Values | ⚠️ محتمل | في Firestore لبعض الحقول | Medium |
| Empty Strings | ⚠️ محتمل | في `custom_label` إذا الأقسام أقل من 5 | High |
| Wrong Types | ⚠️ محتمل | `price` قد يكون string في Firestore | Medium |
| Invalid URLs | ⚠️ محتمل | لا يوجد تحقق من صحة URLs | Medium |
| Invalid Prices | ⚠️ محتمل | `parseFloat(basePrice).toFixed(2)` قد يفشل | Medium |
| Invalid Currency | ✅ لا يوجد | EGP ثابت | High |
| Broken Images | ⚠️ محتمل | لا يوجد تحقق من 404 | Medium |
| Duplicate Products | ✅ لا يوجد | — | High |
| Duplicate Variants | ✅ لا يوجد (بفضل `seenColors`) | — | High |
| Invalid Availability | ⚠️ محتمل | `sellOutOfStock === "Yes"` يتجاوز الـ quantity | Medium |
| Encoding Problems | ✅ لا يوجد (UTF-8) | — | High |
| Unicode Issues | ✅ لا يوجد | — | High |
| HTML في الوصف | ✅ يتم تنظيفه (`stripHtml`) | — | High |
| أحرف غير مدعومة | ✅ يتم التعامل معها (`escapeXml`) | — | High |

---

# Performance Findings

## ما يمنع تحسين Learning Phase:
1. **EMQ منخفض** — بسبب نقص بيانات المستخدم في ViewContent, AddToCart, InitiateCheckout
2. **Match Rate منخفض** — بسبب اختلاف Product IDs
3. **قلة الأحداث** — لا يوجد Search, Lead, CompleteRegistration

## ما يؤثر على ROAS:
1. **Double Counting محتمل** — بسبب عدم اكتمال Deduplication
2. **Product Type غير دقيق** — يمنع Meta من تحسين العرض
3. **Missing Variant Attributes** — يمنع الفلترة الدقيقة

## ما يقلل جودة Dynamic Ads:
1. **Product IDs غير متطابقة** — السبب الرئيسي
2. **Missing Fields في Catalog** — size, gender, age_group
3. **Google Product Category غير دقيق**

## ما يقلل جودة الاستهداف:
1. **EMQ منخفض** — نقص بيانات المستخدم
2. **Missing User Data في معظم الأحداث**

## ما قد يخفض جودة تقارير Ads Manager:
1. **Double Counting** — بسبب عدم اكتمال Deduplication
2. **بيانات غير متسقة** — اختلاف Product IDs

## ما قد يؤثر على Attribution:
1. **عدم وجود event_id مطابق** بين Browser و Server
2. **Purchase يُرسل من Server فقط** — قد يفقد بعض إشارات الإحالة

---

# Best Practice Violations (Meta 2026)

| الممارسة | الحالة | التفاصيل |
|----------|--------|---------|
| إرسال event_id متطابق | ❌ مخالف | لا يوجد تطابق بين Browser و Server |
| إرسال بيانات المستخدم في كل الأحداث | ❌ مخالف | تُرسل فقط في Purchase |
| استخدام content_ids صحيح | ❌ مخالف | Fallback إلى title |
| إرسال contents array | ❌ مخالف | غير مرسل في أي حدث |
| إرسال country في user_data | ❌ مخالف | غير مرسل |
| إرسال state في user_data | ❌ مخالف | غير مرسل |
| إرسال zip في user_data | ❌ مخالف | غير مرسل |
| Product Type هرمي | ❌ مخالف | يعتمد على Slugs |
| Google Product Category دقيق | ❌ مخالف | يستخدم Fallback |
| وجود Search event | ❌ مخالف | غير موجود |
| وجود Lead event | ❌ مخالف | غير موجود |
| وجود CompleteRegistration | ❌ مخالف | غير موجود |
| Variants تحتوي على size | ❌ مخالف | size غير موجود في Catalog |
| استخدام SKU | ❌ مخالف | لا يوجد SKU في Catalog |
| Feed يحتوي على gender | ❌ مخالف | غير موجود |
| Feed يحتوي على age_group | ❌ مخالف | غير موجود |
| Feed يحتوي على material | ❌ مخالف | غير موجود |

---

# Recommended Fixes Summary

| # | المشكلة | الخطورة | Root Cause | التأثير | الإصلاح المقترح |
|---|---------|---------|------------|---------|-----------------|
| 1 | Deduplication غير مكتمل | Critical | لا يوجد event_id مطابق | Double Counting, Attribution | إرسال نفس event_id من Browser و Server |
| 2 | Product IDs غير متطابقة | Critical | Pixel يرسل handle/id/title, Catalog يستخدم handle | Match Rate منخفض | توحيد IDs وإزالة Fallback إلى title |
| 3 | EMQ منخفض | Critical | بيانات المستخدم ناقصة (state, zip, country) | استهداف ضعيف | إضافة الحقول المفقودة إلى جميع الأحداث |
| 4 | Product Type غير دقيق | Critical | يعتمد على Slugs بدلاً من تصنيف هرمي | تصنيف ضعيف | إنشاء خريطة تصنيف هرمية |
| 5 | Missing Catalog Fields | Critical | size, gender, age_group, material غير موجودة | فلترة ضعيفة | إضافة الحقول المفقودة إلى XML |
| 6 | بيانات المستخدم فقط في Purchase | High | ViewContent, AddToCart, InitiateCheckout بدون User Data | EMQ منخفض لمعظم الأحداث | إرسال User Data في جميع الأحداث |
| 7 | Fallback إلى title في content_ids | High | `it.title` يستخدم كـ Fallback | Match Rate = 0% لهذه الحالات | إزالة Fallback إلى title |
| 8 | Missing Search event | Medium | لا يوجد Search tracking | تحسين Learning | إضافة Search event |
| 9 | Missing Lead event | Medium | لا يوجد Lead tracking | تحسين Learning | إضافة Lead event |
| 10 | Missing CompleteRegistration | Medium | لا يوجد CompleteRegistration | تحسين Learning | إضافة CompleteRegistration |
| 11 | Missing contents array | Medium | contents غير مرسل في أي حدث | تحسين Dynamic Ads | إضافة contents array |
| 12 | Google Product Category غير دقيق | Medium | Fallback ثابت لمعظم المنتجات | تصنيف ضعيف | تعيين GPC دقيق لكل منتج |
| 13 | KV Cache لمدة ساعة | Low | Cache قديم لمدة ساعة | تأخير التحديث | تقليل مدة Cache أو استخدام Webhook |
| 14 | No Incremental Feed Update | Low | إعادة بناء XML بالكامل كل مرة | استهلاك موارد | تنفيذ تحديث تدريجي |

---

# Confidence Level Table

| الاستنتاج | مستوى الثقة | السبب |
|-----------|------------|-------|
| Deduplication غير مكتمل | High | الكود واضح، لا يوجد event_id مطابق |
| Product IDs غير متطابقة | High | مقارنة مباشرة بين Pixel و Catalog |
| EMQ منخفض | High | الفحص المباشر للحقول المرسلة |
| Product Type غير دقيق | High | تحليل آلية استخراج Product Type |
| Missing Catalog Fields | High | الفحص المباشر لبناء XML |
| بيانات المستخدم فقط في Purchase | High | الكود يظهر أن User Data تُرسل فقط مع Purchase |
| Fallback إلى title | High | الكود يظهر `it.title` كـ Fallback |
| Missing Search/Lead/CompleteRegistration | High | لا يوجد أي كود لهذه الأحداث |
| Missing contents array | High | لا يوجد contents في أي حدث |
| Google Product Category غير دقيق | High | Fallback ثابت في الكود |
| Double Counting محتمل | Medium | يعتمد على سلوك المستخدم (إعادة تحميل الصفحة) |
| Broken Images محتمل | Medium | لا يوجد تحقق من صحة URLs |
| تأخير Feed | Medium | يعتمد على توقيت تحديث KV Cache |
| Invalid Prices محتمل | Medium | يعتمد على جودة البيانات في Firestore |

---

# Final Summary Table

| # | المشكلة | الخطورة | التأثير | Root Cause | الثقة |
|---|---------|---------|---------|------------|-------|
| 1 | Deduplication | 🔴 Critical | Double Counting, Attribution | No matching event_id | High |
| 2 | Product ID Mismatch | 🔴 Critical | Low Match Rate, Broken Dynamic Ads | Different IDs in Pixel vs Catalog | High |
| 3 | Low EMQ | 🔴 Critical | Poor Targeting, Low Lookalike Quality | Missing state, zip, country | High |
| 4 | Product Type | 🔴 Critical | Poor Catalog Classification | Slug-based instead of hierarchical | High |
| 5 | Missing Catalog Fields | 🔴 Critical | Poor Filtering, Low Ad Performance | size, gender, age_group, material missing | High |
| 6 | User Data Only in Purchase | 🟠 High | Low EMQ for 75% of events | User data not sent to ViewContent, AddToCart, InitiateCheckout | High |
| 7 | Fallback to title | 🟠 High | Match Rate = 0% for fallback cases | `it.title` used as content_id fallback | High |
| 8 | Missing Search Event | 🟡 Medium | Missed Learning Signal | No search tracking implemented | High |
| 9 | Missing Lead Event | 🟡 Medium | Missed Learning Signal | No lead tracking implemented | High |
| 10 | Missing CompleteRegistration | 🟡 Medium | Missed Learning Signal | No registration tracking | High |
| 11 | Missing contents Array | 🟡 Medium | Poor Dynamic Ad Optimization | contents not sent in any event | High |
| 12 | Imprecise Google Product Category | 🟡 Medium | Poor Catalog Classification | Static fallback for most products | High |
| 13 | 1-Hour Cache Delay | 🟢 Low | Slight Feed Update Delay | KV Cache TTL = 3600s | Medium |
| 14 | No Incremental Feed Update | 🟢 Low | Full Rebuild on Every Request | No incremental update mechanism | Medium |

---

*تقرير تم إعداده بواسطة Cline — AI Audit Specialist*
*تاريخ التقرير: 28 يونيو 2026*
*ملاحظة: هذا تقرير تدقيق فقط، لم يتم تعديل أي ملف أو كود.*