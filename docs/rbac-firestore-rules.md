# Firestore Security Rules — كولكشن `admins` (للتطبيق اليدوي)

> ⚠️ هذه القواعد **ليست في الريبو ولا يطبّقها هذا الـ PR**.
> يجب تطبيقها يدويًا في Firebase Console قبل أن يعتمد أي موظف غير المالك
> على الكتابة من واجهة الأدمن.

## أين تطبَّق

Firebase Console ← مشروع **wind-reviews** ← Firestore Database ← Rules ←
أضف القاعدة التالية داخل `match /databases/{database}/documents { ... }`
إلى جانب قواعدك الحالية (لا تستبدل باقي القواعد)، ثم **Publish**.

## القاعدة

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // --- Staff records for the admin RBAC (feature/admin-rbac) ---
    match /admins/{uid} {
      // الموظف يقرأ مستنده الخاص فقط — بهذا يحلّ الـ layout دوره.
      // (بدونها يفشل دخول الموظفين من الواجهة بـ permission-denied.)
      allow get: if request.auth != null && request.auth.uid == uid;

      // القائمة والكتابة والحذف للمالك فقط.
      // يجب أن يطابق الـ UID التالي ADMIN_UID في src/lib/constants.js.
      allow list, create, update, delete: if request.auth != null
        && request.auth.uid == "jGb9wBMHZfRIQgR9yfbb3rkvzRw2";
    }

    // ... باقي قواعدك الحالية تبقى كما هي ...
  }
}
```

## ملاحظات

- دخول المالك لا يعتمد على هذه القاعدة إطلاقًا (fallback في الكود).
- الـ APIs المحمية (members, write-ops, media, …) تتحقق عبر Service Account
  وتتخطى الـ Rules، فهي تعمل حتى قبل تطبيق هذه القاعدة.
- **هذه القاعدة تغطي كولكشن `admins` فقط.** كتابات الموظفين في باقي
  الكولكشنات (products, Orders, …) عبر الـ Client SDK ما زالت محكومة
  بقواعدك الحيّة الحالية — راجعها في الكونسول قبل منح أي موظف دور كتابة،
  لأن RBAC وحده لا يقيّد تلك الكتابات.
- بعد النشر، جرّب: دخول موظف بدور viewer يرى لوحة التحكم والأقسام المسموحة
  فقط، ومحاولة فتح `/admin/settings/members` تظهر له "لا تملك صلاحية".
