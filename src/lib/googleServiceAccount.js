// 🔥 Helper مشترك لتوليد Google OAuth2 access token من Service Account
// (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)، مكتوب بـ Web Crypto API
// بس (crypto.subtle) عشان يفضل شغال على أي Runtime (Edge أو Node compat).
//
// بيستخدمه أي كود محتاج صلاحيات Admin حقيقية بتتخطى Firestore Security
// Rules (زي register-admin-token/route.js اللي بيكتب من غير مستخدم
// مسجل دخول)، أو يبعت لـ Google APIs تانية زي FCM (fcmAdmin.js).
//
// كل scope ليه cache منفصل لأن الـ access token مرتبط بالـ scope اللي
// اتطلب بيه.

const tokenCache = new Map(); // scope -> { token, expiry }

function base64UrlEncode(input) {
  let base64;
  if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    base64 = btoa(binary);
  } else {
    base64 = btoa(input);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/\\n/g, "\n") // لو الـ env var متخزنة بـ \n حرفي
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function getGoogleAccessToken(scope) {
  const now = Math.floor(Date.now() / 1000);

  const cached = tokenCache.get(scope);
  if (cached && now < cached.expiry - 60) {
    return cached.token;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY env var missing");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;

  const keyData = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64UrlEncode(signatureBuffer)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth2 token exchange failed: ${JSON.stringify(data)}`);
  }

  tokenCache.set(scope, {
    token: data.access_token,
    expiry: now + (data.expires_in || 3600),
  });
  return data.access_token;
}
