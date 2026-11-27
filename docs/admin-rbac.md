# إدارة أعضاء لوحة التحكم — صلاحيات مفصّلة (RBAC)

> Branch: `feature/admin-rbac` — للمراجعة فقط، لم يُدمج ولم يُنشر.
> الملف المركزي للصلاحيات: `src/lib/rbac.js`

## الأدوار والصلاحيات

| الدور (role) | الصلاحيات | ما يراه في القائمة |
|---|---|---|
| `owner` — المالك | كل الصلاحيات، بما فيها `members.manage` | كل الأقسام + إدارة الأعضاء |
| `admin` — أدمن | كل الصلاحيات ما عدا `members.manage` | كل الأقسام ما عدا إدارة الأعضاء |
| `orders` — موظف طلبات | `dashboard.view`, `orders.view`, `orders.edit`, `customers.view` | الرئيسية، الطلبات، العملاء |
| `products` — موظف منتجات | `dashboard.view`, `products.view`, `products.edit`, `collections.edit`, `inventory.view`, `inventory.edit`, `media.upload` | الرئيسية، المنتجات، إضافة منتج، الأقسام، المخزون |
| `content` — موظف محتوى | `dashboard.view`, `content.view`, `content.edit`, `reviews.view`, `reviews.edit`, `offers.edit`, `promotions.edit` | الرئيسية، إدارة الواجهة، المنيو، الصفحات، الإعدادات، التقييمات، العروض، أكواد الخصم |
| `viewer` — مشاهدة فقط | `dashboard.view`, `orders.view`, `products.view`, `customers.view`, `inventory.view` | الرئيسية، الطلبات، المنتجات، العملاء، المخزون — قراءة فقط |

### قواعد ثابتة

- المالك الوحيد هو `ADMIN_UID` في `src/lib/constants.js`. لا يمكن إنشاء مالك آخر
  من الواجهة أو من الـ API، ولا يمكن تعديل المالك أو إلغاء تفعيله أو تخفيض دوره.
- المالك يعمل حتى لو لا يوجد له مستند في كولكشن `admins` (fallback في الكود،
  عميلًا وسيرفرًا) — فلا يمكن أن يُقفل على نفسه خارج اللوحة.
- الموظف المُعطَّل (`active: false`) يُسجَّل خروجه فورًا وتُرفض كل نداءاته (403).
- بيانات الموظف: مستند في Firestore كولكشن `admins`، معرّفه = Firebase UID،
  وحقوله: `uid`, `email`, `name`, `role`, `active`, `createdAt`, `createdBy`.

## كيف تضيف موظفًا

1. يسجّل الموظف دخوله مرة واحدة بحساب Google على `/admin/login`
   (سيظهر له "غير مصرح لك" — متوقَّع). بهذا يُنشأ حساب Firebase Auth الخاص به.
2. انسخ الـ UID من Firebase Console ← Authentication ← Users.
3. المالك يفتح `/admin/settings/members` ← "إضافة عضو جديد"، ويلصق الـ UID
   والبريد والاسم ويختار الدور ← إضافة.
4. الموظف يدخل بعدها مباشرة بحساب Google نفسه.

## كيف تلغي موظفًا

- من `/admin/settings/members`: "إلغاء التفعيل" — يمنع الدخول فورًا،
  لكن السجل يبقى ويمكن إعادة تفعيله في أي وقت.
- للإزالة النهائية: احذف المستخدم من Firebase Console ← Authentication.

## كيف يُفرض النظام

- **الواجهة:** `admin/layout.js` يخفي عناصر القائمة التي لا يملكها الدور،
  ويحجب القسم كاملًا (بطاقة "لا تملك صلاحية") لو فُتح برابط مباشر.
  `admin/login/page.js` يرفض غير الموظفين ويسجّل خروجهم.
- **السيرفر:** `verifyAdminIdToken` يحلّ الدور من `admins/{uid}` عبر
  Service Account (لا يثق بأي دور يأتي من العميل)، و`verifyAdminPermission`
  يفرض صلاحية معينة. الـ APIs المحمية:
  - `POST /api/write-ops` — أي صلاحية كتابة (viewer مرفوض).
  - `POST /api/media` (purpose=product) — `products.edit`. رفع صور التقييمات دون تغيير.
  - `POST /api/delete-image` — `products.edit`.
  - `POST /api/revalidate` (غير العام) — `content.edit` أو `products.edit`.
    الطلبات العامة (likes / product_stats) دون تغيير.
  - `GET /api/admin/dashboard-stats` — أي دور موظف. **كانت بلا أي تحقق من قبل.**
  - `GET/POST/DELETE /api/admin/members` — `members.manage` (المالك فقط).
- الأكواد: 401 = غير موثّق (لا توكن / توكن غير صالح)، 403 = موثّق لكن بلا الصلاحية.

## حدود صريحة — اقرأ قبل الدمج

1. **هذا الـ PR لا يصلح مسارات الكتابة العامة غير الموثّقة** التي وُجدت في
   التدقيق الهندسي (مثل `/api/create-order` وغيرها). نطاقه فقط: دخول الأدمن
   والـ APIs الخمسة المذكورة أعلاه + members.
2. **لا يغيّر Firestore Security Rules** — وهي ليست في هذا الريبو أصلًا.
   صفحات الأدمن تكتب في Firestore عبر الـ Client SDK مباشرة، وهذه الكتابات
   يحكمها الـ Rules الحيّة في Firebase Console، وليس RBAC هنا.
   **قبل أن يعتمد أي موظف غير المالك على الكتابة من الواجهة، طبّق يدويًا
   القواعد في `docs/rbac-firestore-rules.md`** (على الأقل لكولكشن `admins`،
   حتى يستطيع الموظف قراءة مستنده الخاص وتُحلّ صلاحياته).
   بدونها: دخول الموظفين من الواجهة سيفشل بـ permission-denied،
   بينما الـ APIs المحمية ستعمل (لأنها تتحقق عبر Service Account).
   دخول المالك لا يتأثر إطلاقًا لأنه لا يقرأ Firestore لحلّ دوره.
3. إخفاء القائمة وحده ليس أمانًا — لذلك فُرضت الصلاحيات أيضًا في الـ APIs.
   لكن أي مسار كتابة آخر لم يُذكر هنا ما زال خارج نطاق هذا الـ PR.
4. إشعارات الطلبات الفورية (FCM عبر `adminTokens`) ما زالت مرتبطة بالمالك
   فقط — الموظفون لا تصلهم تلك الإشعارات في هذا الـ PR.

## ملفات هذا الـ PR

- جديد: `src/lib/rbac.js`, `src/lib/adminAccess.js`,
  `src/app/api/admin/members/route.js`, `src/app/admin/settings/members/page.js`,
  `docs/admin-rbac.md`, `docs/rbac-firestore-rules.md`
- معدّل: `src/lib/verifyAdminIdToken.js`, `src/lib/firestoreAdmin.js`
  (أُضيف `parseFirestoreDoc` فقط)، `src/app/admin/login/page.js`,
  `src/app/admin/layout.js`, `src/app/admin/page.js` (يستخدم `adminFetch`
  لإحصائيات لوحة التحكم)، `src/app/api/write-ops/route.js`,
  `src/app/api/media/route.js`, `src/app/api/delete-image/route.js`,
  `src/app/api/revalidate/route.js`, `src/app/api/admin/dashboard-stats/route.js`
- إصلاح جانبي: `src/app/admin/layout.js` كان يستدعي `signOut(auth)` دون
  استيراده — كان سيرمي ReferenceError عند دخول مستخدم غير موظف. تم الاستيراد.
