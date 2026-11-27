import { ADMIN_UID } from "@/lib/constants";
import { firestoreAdminGet, parseFirestoreDoc } from "@/lib/firestoreAdmin";
import {
  ROLES,
  hasAnyPermission,
  isOwnerUid,
  permissionsForRole,
  resolveRole,
} from "@/lib/rbac";

// حلّ دور المستخدم من مستند `admins/{uid}` عبر Service Account.
// المالك يُحلّ محليًا دون أي قراءة — حتى لو فشلت قراءة Firestore
// (env ناقص، Rules، انقطاع)، يبقى دخول المالك شغالًا.
// لغير المالك: أي فشل في الحلّ = رفض (fail closed).
async function resolveStaffRole(uid) {
  if (isOwnerUid(uid)) {
    return { ok: true, role: ROLES.OWNER };
  }
  let restDoc;
  try {
    restDoc = await firestoreAdminGet("admins", uid);
  } catch {
    // مثال: FIREBASE_PROJECT_ID أو Service Account env ناقص.
    // لا نمنح وصولًا عند الشك.
    return { ok: false, reason: "admin_role_lookup_unavailable" };
  }
  if (!restDoc) return { ok: false, reason: "not_staff" };
  const staffDoc = parseFirestoreDoc(restDoc);
  const role = resolveRole(uid, staffDoc);
  if (!role) {
    return {
      ok: false,
      reason: staffDoc && staffDoc.active === false
        ? "staff_inactive"
        : "not_staff",
    };
  }
  return { ok: true, role };
}

export async function verifyAdminIdToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const apiKey = process.env.FIREBASE_SERVER_API_KEY;

  if (!match) {
    return { ok: false, reason: "missing_bearer_token", status: 401 };
  }

  if (!apiKey) {
    return { ok: false, reason: "missing_firebase_api_key", status: 401 };
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] }),
      },
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const rawCode = payload.error?.message || "UNKNOWN";
      const safeCode = /^[A-Z0-9_]+$/.test(rawCode)
        ? rawCode
        : "UNKNOWN";

      return {
        ok: false,
        reason: `firebase_lookup_failed_${response.status}_${safeCode}`,
        status: 401,
      };
    }

    const user = payload.users?.[0];

    if (!user) {
      return { ok: false, reason: "firebase_user_missing", status: 401 };
    }

    if (user.localId !== ADMIN_UID) {
      // ليس المالك: يجب أن يكون موظفًا فعّالًا في كولكشن admins.
      const resolved = await resolveStaffRole(user.localId);
      if (!resolved.ok) {
        return { ok: false, reason: resolved.reason, status: 403 };
      }
      if (user.disabled === true) {
        return { ok: false, reason: "admin_account_disabled", status: 403 };
      }
      return {
        ok: true,
        uid: user.localId,
        role: resolved.role,
        permissions: permissionsForRole(resolved.role),
        status: 200,
      };
    }

    if (user.disabled === true) {
      return { ok: false, reason: "admin_account_disabled", status: 403 };
    }

    return {
      ok: true,
      uid: user.localId,
      role: ROLES.OWNER,
      permissions: permissionsForRole(ROLES.OWNER),
      status: 200,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `firebase_request_failed_${error?.name || "UnknownError"}`,
      status: 401,
    };
  }
}

// مثل verifyAdminIdToken، مع شرط صلاحية إضافي.
// يقبل صلاحية واحدة أو مصفوفة (يكفي توفّر أي واحدة).
// يرجع 401 لغير الموثّق، و403 لمن هو موثّق لكن بلا الصلاحية.
export async function verifyAdminPermission(request, permissionOrList) {
  const auth = await verifyAdminIdToken(request);
  if (!auth.ok) return auth;
  if (
    permissionOrList !== null &&
    permissionOrList !== undefined &&
    !hasAnyPermission(auth.role, permissionOrList)
  ) {
    return {
      ...auth,
      ok: false,
      reason: "forbidden_missing_permission",
      status: 403,
    };
  }
  return auth;
}
