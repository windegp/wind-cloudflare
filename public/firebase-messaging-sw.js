// firebase-messaging-sw.js
// 🔥 Service Worker مسؤول بس عن استقبال الإشعارات لما تاب الأدمن يكون
// مقفول أو في الخلفية (background). نفس الإشعار لما التاب يكون مفتوح
// وفوكَس (foreground) بيتعامل معاه ملف src/lib/firebaseMessaging.js مباشرة.
//
// ⚠️ ملحوظة مهمة: لما الإشعار ده يظهر من هنا (background)، المتصفح
// بيشغل صوت النظام الافتراضي بس — مفيش طريقة في أي متصفح دلوقتي تتحكم
// في صوت مخصص لإشعار وهو في الخلفية. الصوت المخصص (cha-ching) بيشتغل
// بس لما التاب يكون مفتوح وفوكَس — ده قيد من سبيسيفيكيشن الـ Web Push
// نفسه، مش قصور في الكود.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// نفس الإعدادات الموجودة في src/lib/firebase.js — لازم تتطابق دايماً
firebase.initializeApp({
  apiKey: "AIzaSyBIIdkBPaQFHhPLo7Gob7sA1LacaT3E2JE",
  authDomain: "wind-reviews.firebaseapp.com",
  projectId: "wind-reviews",
  storageBucket: "wind-reviews.firebasestorage.app",
  messagingSenderId: "596996130193",
  appId: "1:596996130193:web:186c91269249c6c5eb8630",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'طلب جديد على WIND';
  const body = payload?.notification?.body || 'وصل طلب جديد، افتح لوحة التحكم.';

  const notificationOptions = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    dir: 'rtl',
    lang: 'ar',
    tag: payload?.data?.orderId || 'wind-new-order',
    data: {
      url: '/admin/orders',
      orderId: payload?.data?.orderId || null,
    },
  };

  self.registration.showNotification(title, notificationOptions);
});

// لما الأدمن يدوس على الإشعار نفسه (مش الموقع)، يفتح صفحة الأوردرات
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/admin/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes('/admin'));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});