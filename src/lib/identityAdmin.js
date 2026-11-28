// ============================================
// 🔐 IDENTITY ADMIN — إدارة مستخدمي Firebase Auth من السيرفر
// ============================================
//
// إنشاء/بحث مستخدمي Firebase Authentication عبر Identity Toolkit
// REST API، بنفس نمط الريبو (Service Account + OAuth2 access token
// من lib/googleServiceAccount.js، زي fcmAdmin.js وfirestoreAdmin.js).
// لا يوجد firebase-admin SDK مستخدم في الريبو رغم وجوده في
// package.json — فلا ندخل مسار تهيئة جديد هنا.
//
// الغرض: التسجيل المسبق (pre-provisioning) لموظف قبل أول دخول له.
// يُنشأ حساب Auth بالبريد فقط — بدون باسورد وبدون مزوّد — فيرتبط
// به تلقائيًا أول تسجيل دخول بـ Google لنفس البريد المُتحقَّق منه،
// فيحصل على نفس الـ UID، ويدخل لوحة التحكم من أول مرة دون شاشة
// "غير مصرح لك".
//
// ⚠️ هذا السلوك (ربط Google بحساب بلا باسورد) لم يُختبر حيًا بعد —
// انظر docs/admin-invite-preprovision.md قبل الاعتماد عليه مع
// موظفين حقيقيين.
//
// ملاحظة أمنية: لا تُسجَّل أي توكنات أو بيانات اعتماد في السجلات،
// ورسائل الخطأ هنا لا تتضمن أي سر.

import { getGoogleAccessToken } from "./googleServiceAccount";

const IDENTITY_TOOLKIT_SCOPE =
  "https://www.googleapis.com/auth/identitytoolkit";

function projectId() {
  const id = process.env.FIREBASE_PROJECT_ID;
  if (!id) throw new Error("FIREBASE_PROJECT_ID env var missing");
  return id;
}

function safeErrorText(body) {
  // رسالة خطأ آمنة للسجلات: كود الخطأ فقط، بلا تفاصيل حساسة.
  const message = typeof body?.error?.message === "string"
    ? body.error.message
    : "";
  return /^[A-Z0-9_: -]{1,80}$/.test(message) ? message : "UNKNOWN";
}

// البحث عن مستخدم Auth بالبريد. يرجع { uid, email, disabled } أو null.
export async function getAuthUserByEmail(email) {
  const accessToken = await getGoogleAccessToken(IDENTITY_TOOLKIT_SCOPE);
  const res = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: [email] }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Identity Toolkit lookup failed (${res.status}): ${safeErrorText(body)}`);
  }
  const user = Array.isArray(body.users) ? body.users[0] : null;
  if (!user || typeof user.localId !== "string") return null;
  return {
    uid: user.localId,
    email: typeof user.email === "string" ? user.email : email,
    disabled: user.disabled === true,
  };
}

// إنشاء مستخدم Auth بالبريد فقط — بلا باسورد وبلا مزوّد.
// يرجع { uid, email }، أو null لو كان البريد موجودًا أصلًا
// (سباق: أُنشئ بين البحث والإنشاء — على المتصل إعادة البحث).
export async function createAuthUser(email) {
  const accessToken = await getGoogleAccessToken(IDENTITY_TOOLKIT_SCOPE);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/accounts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, emailVerified: false }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (safeErrorText(body).includes("EMAIL_EXISTS")) return null;
    throw new Error(`Identity Toolkit create failed (${res.status}): ${safeErrorText(body)}`);
  }
  if (typeof body.localId !== "string") {
    throw new Error("Identity Toolkit create failed: missing localId");
  }
  return { uid: body.localId, email };
}

// التسجيل المسبق: أعد استخدام المستخدم الموجود أو أنشئ واحدًا جديدًا.
// يرجع { uid, created } — created=false تعني أن الحساب كان موجودًا
// أصلًا (وهذا أيضًا يصلح موظفًا سبق أن رأى شاشة الرفض).
export async function preprovisionAuthUser(email) {
  const existing = await getAuthUserByEmail(email);
  if (existing) return { uid: existing.uid, created: false };

  const createdUser = await createAuthUser(email);
  if (createdUser) return { uid: createdUser.uid, created: true };

  // سباق: أُنشئ الحساب بين البحث والإنشاء — أعد البحث بدل الفشل.
  const raced = await getAuthUserByEmail(email);
  if (raced) return { uid: raced.uid, created: false };
  throw new Error("Identity Toolkit create failed: user not found after EMAIL_EXISTS");
}
