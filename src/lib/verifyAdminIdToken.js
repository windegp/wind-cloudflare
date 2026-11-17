import { ADMIN_UID } from "@/lib/constants";

export async function verifyAdminIdToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const apiKey = process.env.FIREBASE_SERVER_API_KEY;

  if (!match) {
    return { ok: false, reason: "missing_bearer_token" };
  }

  if (!apiKey) {
    return { ok: false, reason: "missing_firebase_api_key" };
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
      };
    }

    const user = payload.users?.[0];

    if (!user) {
      return { ok: false, reason: "firebase_user_missing" };
    }

    if (user.localId !== ADMIN_UID) {
      return { ok: false, reason: "admin_uid_mismatch" };
    }

    if (user.disabled === true) {
      return { ok: false, reason: "admin_account_disabled" };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `firebase_request_failed_${error?.name || "UnknownError"}`,
    };
  }
}
