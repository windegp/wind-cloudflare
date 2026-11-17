
import { ADMIN_UID } from "@/lib/constants";

export async function verifyAdminIdToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!match || !apiKey) return false;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] }),
      },
    );

    if (!response.ok) return false;

    const payload = await response.json();
    const user = payload.users?.[0];

    return user?.localId === ADMIN_UID && user.disabled !== true;
  } catch {
    return false;
  }
}
