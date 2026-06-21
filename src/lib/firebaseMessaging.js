// src/lib/firebaseMessaging.js
// 🔥 Wrapper بسيط حوالين firebase/messaging — كله Browser-only.
// لازم يتستدعى بس من جوه useEffect (مش top-level import) عشان مكتبة
// firebase/messaging بتفترض وجود window/navigator/Notification وهي
// حاجات مش موجودة وقت الـ SSR. نفس فكرة "Edge Runtime Protection"
// المستخدمة في LiveTracker.js بس هنا لحماية الـ SSR مش الـ Edge.

import { getAppInstanceForMessaging } from "./firebase";

// ✅ القيمة دلوقتي مؤكدة ومتطابقة مع Firebase Console (Phase 1)
// ومحطوطة في Cloudflare Pages كـ NEXT_PUBLIC_FIREBASE_VAPID_KEY
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * يتحقق إذا كان المتصفح بيدعم Web Push أصلاً (سفاري قديم/iOS برا PWA لأ).
 */
export async function isMessagingSupported() {
  if (typeof window === "undefined") return false;
  try {
    const { isSupported } = await import("firebase/messaging");
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * يطلب صلاحية الإشعارات من المستخدم، يسجل الـ Service Worker،
 * ويرجع الـ FCM token الخاص بالجهاز ده. يرجع null لو حصل أي رفض/خطأ.
 */
export async function requestNotificationToken() {
  if (typeof window === "undefined") return null;
  if (!VAPID_KEY) {
    console.warn("NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing — check Cloudflare env vars.");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    const { getMessaging, getToken } = await import("firebase/messaging");
    const messaging = getMessaging(getAppInstanceForMessaging());

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (error) {
    console.warn("Notification token request failed:", error?.message);
    return null;
  }
}

/**
 * يستمع للإشعارات اللي توصل والتاب مفتوح وفي الفوكَس (foreground).
 * هنا بس فين ممكن نشغل صوت مخصص (cha-ching) — قيد المتصفح نفسه.
 * بيرجع دالة unsubscribe.
 */
export async function listenForegroundMessages(onMessageReceived) {
  if (typeof window === "undefined") return () => {};

  try {
    const { getMessaging, onMessage } = await import("firebase/messaging");
    const messaging = getMessaging(getAppInstanceForMessaging());

    const unsubscribe = onMessage(messaging, (payload) => {
      onMessageReceived?.(payload);
    });

    return unsubscribe;
  } catch (error) {
    console.warn("Foreground listener setup failed:", error?.message);
    return () => {};
  }
}