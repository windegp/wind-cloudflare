# Firestore Security Rules — كتلة `admins` (للتطبيق اليدوي)

> 🛑 **تحذير: لا تلصق ملفًا كاملًا في الكونسول.**
> الكونسول بيستبدل **كل** القواعد الحيّة بما تلصقه. لو لصقت ملفًا فيه
> `rules_version` و`service cloud.firestore` بس كتلة `admins`، هتتمسح قواعد
> الطلبات والعملاء والشيك آوت وغيرها فورًا ويقف الشيك آوت.
> المطلوب **إضافة الكتلة الداخلية فقط** جوه `match /databases/{database}/documents { ... }`
> الموجودة، بجانب القواعد الحيّة، ثم Publish. لا تحذف ولا تستبدل أي سطر موجود.

## أين تطبَّق

Firebase Console ← مشروع **wind-reviews** ← Firestore Database ← Rules ←
افتح القواعد الحالية، وأضف الكتلة التالية **كما هي** قبل القوس الأخير لـ
`match /databases/{database}/documents`، ثم Publish.

## الكتلة (أضفها فقط)

```javascript
    // --- Staff records for the admin RBAC ---
    match /admins/{uid} {
      // الموظف يقرأ مستنده الخاص فقط — بهذا يحلّ الـ layout دوره.
      allow get: if request.auth != null && request.auth.uid == uid;

      // القائمة والكتابة والحذف للمالك فقط.
      // يجب أن يطابق الـ UID التالي ADMIN_UID في src/lib/constants.js.
      allow list, create, update, delete: if request.auth != null
        && request.auth.uid == "jGb9wBMHZfRIQgR9yfbb3rkvzRw2";
    }
```

## ملاحظات

- الكتلة تضيف ولا تستبدل: القاعدة الشاملة الحالية للمالك
  (`match /{document=**}`) وباقي القواعد تفضل كما هي.
- دخول المالك لا يعتمد على هذه الكتلة إطلاقًا (fallback في الكود).
- الـ APIs المحمية (members, write-ops, media, …) تتحقق عبر Service Account
  وتتخطى الـ Rules، فهي تعمل حتى قبل تطبيق هذه الكتلة.
- **هذه الكتلة تغطي كولكشن `admins` فقط.** كتابات الموظفين في باقي
  الكولكشنات (products, Orders, …) عبر الـ Client SDK ما زالت محكومة
  بقواعدك الحيّة (الكتابة للمالك فقط) — يعني الموظف **لن يستطيع الحفظ**
  من واجهة الأدمن حتى لو دوره يسمح. انظر "حدود صريحة" في `docs/admin-rbac.md`.
- بعد النشر، جرّب: دخول موظف بدور viewer يرى لوحة التحكم والأقسام المسموحة
  فقط، ومحاولة فتح `/admin/settings/members` تظهر له "لا تملك صلاحية".
- بعد أي نشر للقواعد: اختبر فورًا شيك آوت COD كامل (مسودة + طلب).
