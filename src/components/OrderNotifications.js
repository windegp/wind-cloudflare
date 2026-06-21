"use client";

import { useEffect, useRef, useState } from "react";
import { doc, setDoc } from "firebase/firestore/lite";
import { getDb } from "@/lib/firebase";
import { getCairoTimestamp } from "@/lib/analytics-helpers";
import { ADMIN_UID } from "@/lib/constants";
import {
  isMessagingSupported,
  requestNotificationToken,
  listenForegroundMessages,
} from "@/lib/firebaseMessaging";
import { Bell, BellRing, BellOff } from "@/components/icons-extra";

// 🔥 إشعارات الأوردرات الجديدة بالصوت — مخصص للأدمن بس.
// بيتركّب مرة واحدة في admin/layout.js فيشتغل في كل صفحات الأدمن.
//
// ⚠️ حد طبيعي من المتصفح نفسه (مش قصور في الكود):
// - التاب مفتوح وفوكَس (foreground) → صوت مخصص (cha-ching) + توست داخلي.
// - التاب مفتوح بس مش فوكَس / في الخلفية → إشعار نظام بصوت النظام
//   الافتراضي (مش الصوت المخصص) — ده بيتظبط من public/firebase-messaging-sw.js
// - التاب/المتصفح مقفول بالكامل → مفيش إشعار خالص.

export default function OrderNotifications() {
  const [status, setStatus] = useState("checking"); // checking | unsupported | default | granted | denied
  const [toast, setToast] = useState(null);
  const audioRef = useRef(null);

  // تجهيز عنصر الصوت مرة واحدة بس
  useEffect(() => {
    audioRef.current = new Audio("/cha-ching.mp3");    audioRef.current.preload = "auto";
  }, []);

  const saveToken = async (token) => {
    if (!token) return;
    try {
      await setDoc(
        doc(getDb(), "adminTokens", token),
        {
          token,
          uid: ADMIN_UID,
          userAgent: navigator.userAgent,
          createdAt: getCairoTimestamp(),
          lastSeenAt: getCairoTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("Failed to save FCM token:", error?.message);
    }
  };

  const enableNotifications = async () => {
    const token = await requestNotificationToken();
    if (token) {
      await saveToken(token);
      setStatus("granted");
    } else {
      setStatus(Notification.permission === "denied" ? "denied" : "default");
    }
  };

  useEffect(() => {
    let unsubscribe = () => {};

    (async () => {
      const supported = await isMessagingSupported();
      if (!supported) {
        setStatus("unsupported");
        return;
      }

      const currentPermission =
        typeof Notification !== "undefined" ? Notification.permission : "default";

      if (currentPermission === "granted") {
        // الصلاحية موجودة من قبل — نجدد الـ token بصمت من غير ما نطلب إذن تاني
        const token = await requestNotificationToken();
        if (token) await saveToken(token);
        setStatus("granted");
      } else {
        setStatus(currentPermission); // "default" أو "denied"
      }

      unsubscribe = await listenForegroundMessages((payload) => {
        audioRef.current?.play().catch(() => {});

        setToast({
          title: payload?.notification?.title || "طلب جديد",
          body: payload?.notification?.body || "",
        });
        setTimeout(() => setToast(null), 6000);
      });
    })();

    return () => unsubscribe();
  }, []);

  return (
    <>
      {status === "default" && (
        <button
          onClick={enableNotifications}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#1a1a1a] bg-white border border-gray-300 hover:bg-gray-100 transition-all"
        >
          <Bell size={16} />
          فعّل تنبيهات الصوت
        </button>
      )}

      {status === "granted" && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#1a1a1a]"
          title="تنبيهات الأوردرات شغالة على الجهاز ده"
        >
          <BellRing size={16} className="text-[#008060]" />
          التنبيهات شغالة
        </div>
      )}

      {status === "denied" && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-gray-400"
          title="افتح إعدادات المتصفح وفعّل صلاحية الإشعارات لهذا الموقع"
        >
          <BellOff size={16} />
          الإشعارات محظورة من المتصفح
        </div>
      )}

      {toast && (
        <div
          dir="rtl"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] bg-[#111111] text-white px-5 py-3 rounded-xl shadow-lg flex flex-col items-center text-center animate-in fade-in"
        >
          <span className="font-bold text-sm">{toast.title}</span>
          {toast.body && <span className="text-xs text-gray-300 mt-1">{toast.body}</span>}
        </div>
      )}
    </>
  );
}