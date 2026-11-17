import { ADMIN_UID } from "@/lib/constants";

export async function verifyAdminIdToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!match) {
    console.warn("[admin-auth] missing_bearer_token");
    return false;
  }

  if (!apiKey) {
    console.error("[admin-auth] missing_firebase_api_key");
    return false;
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
      console.warn("[admin-auth] firebase_lookup_failed", {
        status: response.status,
        errorCode: payload.error?.message || "UNKNOWN",
      });
      return false;
    }

    const user = payload.users?.[0];

    if (!user) {
      console.warn("[admin-auth] firebase_user_missing");
      return false;
    }

    if (user.localId !== ADMIN_UID) {
      console.warn("[admin-auth] admin_uid_mismatch");
      return false;
    }

    if (user.disabled === true) {
      console.warn("[admin-auth] admin_account_disabled");
      return false;
    }

    return true;
  } catch (error) {
    console.error("[admin-auth] firebase_request_failed", {
      errorName: error?.name || "UnknownError",
    });
    return false;
  }
}
