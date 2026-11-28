"use client";

import { useEffect, useRef, useState } from "react";
import { doc, setDoc } from "firebase/firestore/lite";
import { getAuthInstance, getDb } from "@/lib/firebase";
import { getAdminProfile } from "@/lib/adminAccess";
import { buildAdminTokenDoc, isNotificationRecipient } from "@/lib/adminTokens";
import { getCairoTimestamp } from "@/lib/analytics-helpers";
import {
  isMessagingSupported,
  requestNotificationToken,
  listenForegroundMessages,
} from "@/lib/firebaseMessaging";
import { Bell, BellRing, BellOff } from "@/components/icons-extra";

// 🔥 إشعارات الأوردرات الجديدة بالصوت — للمالك والأدمن وموظف الطلبات فقط
// (قرار المالك 2026-11-28). بيتركّب مرة واحدة في admin/layout.js فيشتغل
// في كل صفحات الأدمن. الـ layout بيمرّر ملف الموظف (profile) — جاهز
// هناك — فلا قراءة إضافية من Firestore في العادة.
export default function OrderNotifications({ isOpen = true, profile = null } = {}) {
  const [status, setStatus] = useState("checking"); // checking | unsupported | default | granted | denied
  const [toast, setToast] = useState(null);
  const audioRef = useRef(null);
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // حلّ ملف الموظف: الـ prop أولًا، ولو غاب (استخدام مستقل) من المستخدم
  // المسجّل دخول حاليًا. يرجع null لغير الموظفين.
  const resolveProfile = async () => {
    if (profileRef.current) return profileRef.current;
    const uid = getAuthInstance().currentUser?.uid;
    if (!uid) return null;
    const resolved = await getAdminProfile(uid);
    profileRef.current = resolved;
    return resolved;
  };

  const saveToken = async (token) => {
    if (!token) return;
    const staffProfile = await resolveProfile();
    if (!staffProfile) {
      console.warn("Skipping FCM token save: no staff profile");
      return;
    }
    // الأدوار التي لا تستلم إشعارات الطلبات (مشاهدة فقط، منتجات، محتوى)
    // لا تسجّل توكنًا أصلًا — فلا يصلها شيء حتى لو تغيّر الإرسال.
    if (!isNotificationRecipient(staffProfile.role)) return;
    try {
      await setDoc(
        doc(getDb(), "adminTokens", token),
        buildAdminTokenDoc(staffProfile, token, getCairoTimestamp(), {
          userAgent: navigator.userAgent,
        }),
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
      // ⚠️ حد طبيعي من المتصفح نفسه (مش قصور في الكود):
      // - التاب مفتوح وفوكَس (foreground) → صوت مخصص (cha-ching) + توست داخلي.
      // - التاب مفتوح بس مش فوكَس / في الخلفية → إشعار نظام بصوت النظام
      //   الافتراضي (مش الصوت المخصص) — ده بيتظبط من public/firebase-messaging-sw.js
      // - التاب/المتصفح مقفول بالكامل → مفيش إشعار خالص.
      //
      // بوابة الدور: الأدوار التي لا تستلم إشعارات الطلبات لا تسجّل توكنًا
      // ولا تستمع للرسائل اللحظية أصلًا — فلا صوت ولا توست لها.
      const staffProfile = await resolveProfile();
      if (!staffProfile || !isNotificationRecipient(staffProfile.role)) {
        setStatus("unsupported");
        return;
      }

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
  }, [profile]);

  return (
    <>
      {isOpen && status === "default" && (
        <button
          onClick={enableNotifications}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#1a1a1a] bg-white border border-gray-300 hover:bg-gray-100 transition-all"
        >
          <Bell size={16} />
          فعّل تنبيهات الصوت
        </button>
      )}

      {isOpen && status === "granted" && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#1a1a1a]"
          title="تنبيهات الأوردرات شغالة على الجهاز ده"
        >
          <BellRing size={16} className="text-[#008060]" />
          التنبيهات شغالة
        </div>
      )}

      {isOpen && status === "denied" && (
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