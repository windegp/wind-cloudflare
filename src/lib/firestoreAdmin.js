import { getGoogleAccessToken } from "./googleServiceAccount";

// 🔥 الـ Client SDK العادي (firebase/firestore/lite) بيتقيّد بقواعد
// الأمان (Security Rules) زي أي مستخدم عادي — وقواعدنا بتمنع الكتابة في
// كولكشن زي adminTokens غير لمستخدم مسجل دخول بـ UID الأدمن.
//
// السيرفر (API routes) مش عنده مستخدم مسجل دخول أصلاً، فمحتاج طريقة
// "Admin" حقيقية بتتخطى القواعد دي بالكامل — وده اللي REST API بتاع
// Firestore بيوفره لما نستخدم access token من Service Account.
//
// ⚠️ القراءة (getDocs) مش محتاجة الـ helper ده، لأن قاعدة الأمان عندنا
// فيها "allow read: if true" عامة لكل المستندات — القراءة شغالة عادي
// بالـ Client SDK. المشكلة كانت في الكتابة/الحذف بس.

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") fields[key] = { stringValue: value };
    else if (typeof value === "number") {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    } else if (typeof value === "boolean") fields[key] = { booleanValue: value };
    else if (value === null || value === undefined) fields[key] = { nullValue: null };
    else fields[key] = { stringValue: String(value) };
  }
  return fields;
}

function docUrl(projectId, collectionPath, docId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}/${encodeURIComponent(docId)}`;
}

// إنشاء/تحديث مستند (نفس سلوك setDoc(..., {merge: true}))
export async function firestoreAdminSet(collectionPath, docId, data) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID env var missing");

  const accessToken = await getGoogleAccessToken(FIRESTORE_SCOPE);
  const fieldMask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");

  const res = await fetch(`${docUrl(projectId, collectionPath, docId)}?${fieldMask}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Firestore admin write failed (${res.status}): ${errBody}`);
  }

  return res.json();
}

// حذف مستند
export async function firestoreAdminDelete(collectionPath, docId) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID env var missing");

  const accessToken = await getGoogleAccessToken(FIRESTORE_SCOPE);

  const res = await fetch(docUrl(projectId, collectionPath, docId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 404 يعني المستند أصلاً مش موجود — مش خطأ بالنسبالنا هنا
  if (!res.ok && res.status !== 404) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Firestore admin delete failed (${res.status}): ${errBody}`);
  }
}
