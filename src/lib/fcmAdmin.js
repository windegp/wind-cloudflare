import { getGoogleAccessToken } from "./googleServiceAccount";
import {
  firestoreAdminDelete,
  firestoreAdminGet,
  firestoreAdminList,
  parseFirestoreDoc,
} from "./firestoreAdmin";
import { ROLES, isOwnerUid, resolveRole } from "./rbac";
import { isNotificationRecipient } from "./adminTokens";

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
  // قراءة adminTokens بصلاحيات Service Account (REST) مش بالـ Client SDK:
  // بعد إغلاق القراءة العامة في قواعد Firestore، قراءة السيرفر بالـ SDK
  // كانت هتترفض (permission-denied) والإشعارات كانت هتقف بصمت.
  const docs = await firestoreAdminList("adminTokens");
  // doc id = token نفسه (آخر جزء من name). بنرجّع الـ platform كمان عشان
  // نقدر نبعت android.notification.sound مخصص بس لتوكنات التطبيق النيتيف،
  // والـ uid والدور المخزنين على المستند (من تسجيله) — لكن الدور
  // الحقيقي بيتحلّ لحظيًا من مستند الموظف في resolveTokenRecipientRole،
  // لأن الدور المخزن قد يكون قديمًا بعد تغيير دور الموظف.
  return docs.map((d) => ({
    token: d.name.split("/").pop(),
    platform: d.fields?.platform?.stringValue || "unknown",
    uid: d.fields?.uid?.stringValue || null,
    storedRole: d.fields?.role?.stringValue || null,
  }));
}

// ============================================
// 1b. حلّ الدور الحالي لصاحب التوكن (لحظة الإرسال)
// ============================================
// السياسة (قرار المالك 2026-11-28، عُدّل في نفس اليوم ليشمل المشاهدة
// فقط): إشعار الطلب الجديد يصل للمالك والأدمن وموظف الطلبات
// والمشاهدة فقط. أي توكن لا يمكن إسناده لدور مستلم
// يُتخطى ويُسجَّل — لا يُرسَل "للكل" أبدًا عند الشك.
// - التوكنات القديمة المختومة uid = ADMIN_UID (قبل هذا التعديل) تُعامل
//   كتوكنات مالك، وتُعاد كتابتها بالـ uid الحقيقي عند إعادة التسجيل.
// - توكن بلا uid، أو صاحبه ليس موظفًا فعّالًا، أو دوره خارج المستلمين،
//   يُتخطى.
async function resolveTokenRecipientRole({ uid }) {
  if (!uid) return { ok: false, reason: "missing_uid" };
  if (isOwnerUid(uid)) return { ok: true, role: ROLES.OWNER };
  let restDoc;
  try {
    restDoc = await firestoreAdminGet("admins", uid);
  } catch {
    return { ok: false, reason: "role_lookup_unavailable" };
  }
  if (!restDoc) return { ok: false, reason: "not_staff" };
  const role = resolveRole(uid, parseFirestoreDoc(restDoc));
  if (!role) return { ok: false, reason: "not_staff" };
  return { ok: true, role };
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

    // فلترة حسب الدور الحالي لصاحب كل توكن (مالك/أدمن/طلبات/مشاهدة فقط).
    // المتخطَّى لا يُرسَل له شيء، ويُسجَّل عدده فقط — بلا أي uid كامل في اللوج.
    const resolved = await Promise.all(
      devices.map(async (device) => ({
        device,
        ...(await resolveTokenRecipientRole(device)),
      })),
    );
    const recipients = [];
    let skipped = 0;
    for (const entry of resolved) {
      if (entry.ok && isNotificationRecipient(entry.role)) {
        recipients.push(entry.device);
      } else {
        skipped++;
        console.warn(
          `Skipping FCM token: owner is not a notification recipient (${entry.reason || entry.role})`,
        );
      }
    }
    if (recipients.length === 0) {
      console.log(
        JSON.stringify({
          event: "order_push_result",
          orderId,
          devices: devices.length,
          accepted: 0,
          invalid: 0,
          failed: 0,
          skipped,
        }),
      );
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
      recipients.map(async ({ token, platform }) => {
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
    console.log(JSON.stringify({ event: "order_push_result", orderId, devices: devices.length, accepted, invalid, failed, skipped }));
    if (strict && failed) throw new Error("FCM_DISPATCH_INCOMPLETE");
  } catch (error) {
    // ⚠️ مقصود: أي فشل هنا ما يأثرش على إنشاء الأوردر أو إرسال الإيميل
    if (strict) throw new Error("FCM_DISPATCH_FAILED");
    console.error("❌ FCM push notification error:", error?.message);
  }
}