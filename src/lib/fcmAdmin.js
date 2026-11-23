import { collection, getDocs } from "firebase/firestore/lite";
import { getDb } from "./firebase";
import { getGoogleAccessToken } from "./googleServiceAccount";
import { firestoreAdminDelete } from "./firestoreAdmin";

// 🔥 إرسال إشعارات الأوردرات الجديدة للأدمن عن طريق FCM HTTP v1 API.
//
// السيرفر بيستخدم نفس الـ Service Account (FIREBASE_CLIENT_EMAIL +
// FIREBASE_PRIVATE_KEY) المُستخدم في register-admin-token/route.js
// (عن طريق lib/googleServiceAccount.js المشترك) عشان يولّد access
// token من Google OAuth2، وبعدين يبعت الإشعار لكل الأجهزة المسجلة في
// كولكشن "adminTokens".

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

// ============================================
// 1. جلب كل أجهزة الأدمن المسجلة من Firestore
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
// 2. حذف Token بقى غير صالح (الجهاز شال الإذن أو الـ token قديم)
// ============================================
async function removeInvalidToken(token) {
  try {
    await firestoreAdminDelete("adminTokens", token);
    console.log(`🗑️ Removed stale FCM token: ${token.slice(0, 12)}...`);
  } catch (error) {
    console.warn("Failed to remove stale token:", error?.message);
  }
}

// ============================================
// 3. الدالة الرئيسية — بتتنادى من create-order و webhooks/kashier
// ============================================
export async function sendNewOrderNotification({ title, body, orderId, strict = false }) {
  try {
    const devices = await getAdminDeviceTokens();
    if (devices.length === 0) {
      console.log("ℹ️ No admin FCM tokens registered — skipping push notification");
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      if (strict) throw new Error("FCM_NOT_CONFIGURED");
      console.warn("FIREBASE_PROJECT_ID env var missing — skipping push notification");
      return;
    }

    const accessToken = await getGoogleAccessToken(FCM_SCOPE);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let accepted = 0;
    let invalid = 0;
    const results = await Promise.allSettled(
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

        // 🔥 للتطبيق النيتيف بس: نوجّه الإشعار لقناة order_alerts_v3 اللي
        // اتعملت في التطبيق بصوت cha_ching.mp3 (res/raw/cha_ching).
        // ⚠️ خلاص: لو احتجنا نغيّر الصوت تاني يوماً، لازم نغيّر اسم القناة
        // تاني (v4...) — قنوات أندرويد مالهاش رجعة، أول صوت بيتسجل بيها
        // بيفضل ثابت للأبد على جهاز المستخدم مهما حدّثنا الكود بعد كده.
        if (isNativeAndroid) {
          message.android = {
            notification: {
              channel_id: "order_alerts_v3",
              sound: "cha_ching",
              icon: "ic_stat_wind",
              color: "#000000",
              // ic_notification_large موجود في drawable كـ resource محلي
              // Android بيختاره تلقائياً من الـ density المناسبة
              notification_count: 1,
            },
          };
        }

        const res = await fetch(endpoint, {
          method: "POST",
          ...(strict ? { signal: AbortSignal.timeout(10000) } : {}),
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
            invalid++;
            await removeInvalidToken(token);
          } else {
            console.warn("FCM send failed:", res.status);
            throw new Error("FCM_PROVIDER_REJECTED");
          }
        } else {
          accepted++;
        }
      })
    );

    const failed = results.filter(result => result.status === "rejected").length;
    console.log(JSON.stringify({ event: "order_push_result", orderId, devices: devices.length, accepted, invalid, failed }));
    if (strict && failed) throw new Error("FCM_DISPATCH_INCOMPLETE");
  } catch (error) {
    // ⚠️ مقصود: أي فشل هنا ما يأثرش على إنشاء الأوردر أو إرسال الإيميل
    if (strict) throw new Error("FCM_DISPATCH_FAILED");
    console.error("❌ FCM push notification error:", error?.message);
  }
}