import { collection, getDocs, doc, deleteDoc } from "firebase/firestore/lite";
import { getDb } from "./firebase";

// 🔥 إرسال إشعارات الأوردرات الجديدة للأدمن عن طريق FCM HTTP v1 API
// مكتوب بـ Web Crypto API بس (crypto.subtle) — نفس الأسلوب المستخدم في
// توقيع Kashier الموجود في create-order/route.js، عشان يفضل الكود
// شغال على أي Runtime (Edge أو Node compat) من غير الاعتماد على Buffer.
//
// السيرفر بيستخدم Service Account (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
// عشان يولّد access token من Google OAuth2، وبعدين يبعت الإشعار لكل
// الأجهزة المسجلة في كولكشن "adminTokens".

let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

// ============================================
// 1. تحويل base64 العادي لـ base64url (المطلوب في JWT)
// ============================================
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

// ============================================
// 2. تحويل مفتاح PEM (private_key) إلى ArrayBuffer جاهز للـ Web Crypto
// ============================================
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

// ============================================
// 3. توليد access token من Google (Service Account JWT flow)
// ============================================
async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  // كاش بسيط — الـ token صالح لساعة، نجدده قبل انتهاءه بدقيقة أمان
  if (cachedAccessToken && now < cachedAccessTokenExpiry - 60) {
    return cachedAccessToken;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY env var missing");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
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

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiry = now + (data.expires_in || 3600);
  return cachedAccessToken;
}

// ============================================
// 4. جلب كل أجهزة الأدمن المسجلة من Firestore
// ============================================
async function getAdminDeviceTokens() {
  const snapshot = await getDocs(collection(getDb(), "adminTokens"));
  // doc id = token نفسه. بنرجّع الـ platform كمان عشان نقدر نبعت
  // android.notification.sound مخصص بس لتوكنات التطبيق النيتيف.
  return snapshot.docs.map((d) => ({
    token: d.id,
    platform: d.data()?.platform || "unknown",
  }));
}

// ============================================
// 5. حذف Token بقى غير صالح (الجهاز شال الإذن أو الـ token قديم)
// ============================================
async function removeInvalidToken(token) {
  try {
    await deleteDoc(doc(getDb(), "adminTokens", token));
    console.log(`🗑️ Removed stale FCM token: ${token.slice(0, 12)}...`);
  } catch (error) {
    console.warn("Failed to remove stale token:", error?.message);
  }
}

// ============================================
// 6. الدالة الرئيسية — بتتنادى من create-order و webhooks/kashier
// ============================================
export async function sendNewOrderNotification({ title, body, orderId }) {
  try {
    const devices = await getAdminDeviceTokens();
    if (devices.length === 0) {
      console.log("ℹ️ No admin FCM tokens registered — skipping push notification");
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.warn("FIREBASE_PROJECT_ID env var missing — skipping push notification");
      return;
    }

    const accessToken = await getGoogleAccessToken();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    await Promise.allSettled(
      devices.map(async ({ token, platform }) => {
        const isNativeAndroid = platform === "android-native";

        const orderUrl = `https://windeg.com/admin/orders/${String(orderId || "")}`;

        const message = {
          token,
          notification: { title, body },
          data: { orderId: String(orderId || ""), url: orderUrl },
          webpush: {
            fcm_options: { link: "/admin/orders" },
          },
        };

        // 🔥 للتطبيق النيتيف بس: نوجّه الإشعار لقناة order_alerts اللي
        // اتعملت في التطبيق بصوت cha_ching.mp3 (res/raw/cha_ching).
        // من غير الجزء ده، النظام بيستخدم القناة الافتراضية بصوت
        // النظام العادي حتى لو التطبيق فاتح القناة المخصصة بنفسه.
        if (isNativeAndroid) {
          message.android = {
            notification: {
              channel_id: "order_alerts",
              sound: "cha_ching",
            },
          };
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errorCode = errData?.error?.details?.[0]?.errorCode;
          if (errorCode === "UNREGISTERED" || res.status === 404) {
            await removeInvalidToken(token);
          } else {
            console.warn("FCM send failed:", res.status, JSON.stringify(errData));
          }
        }
      })
    );

    console.log(`✅ Push notification dispatched to ${devices.length} admin device(s)`);
  } catch (error) {
    // ⚠️ مقصود: أي فشل هنا ما يأثرش على إنشاء الأوردر أو إرسال الإيميل
    console.error("❌ FCM push notification error:", error?.message);
  }
}