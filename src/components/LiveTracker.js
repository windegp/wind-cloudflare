"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '../context/CartContext';
//  استدعاء دالة الـ RTDB اللي عملناها في ملف الكلاينت الأساسي
import { getRtdb } from '@/lib/firebase';
import { ref, set, onDisconnect, serverTimestamp, remove } from 'firebase/database';

export default function LiveTracker() {
  const pathname = usePathname();
  const { cartItems, subtotal } = useCart();
  const sessionIdRef = useRef(null);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    // 1. حظر تتبع الأدمن نهائياً لتوفير الموارد
    if (pathname?.startsWith('/admin')) return;

    // 2. إنشاء أو جلب معرف جلسة فريد للزائر
    if (!sessionStorage.getItem('wind_live_session')) {
      sessionStorage.setItem('wind_live_session', 'sess_' + Math.random().toString(36).substr(2, 9));
    }
    sessionIdRef.current = sessionStorage.getItem('wind_live_session');

    if (!sessionIdRef.current) return;

    let sessionRef;

    try {
      const rtdb = getRtdb();
      // تحديد مسار الزائر في الـ Realtime Database
      sessionRef = ref(rtdb, `LiveSessions/${sessionIdRef.current}`);

      // 🪄 onDisconnect (فشل في Cloudflare - نحتاج backup)
      onDisconnect(sessionRef).remove().catch(() => {
        // Silent fail - we'll use heartbeat instead
      });

      // 3. تحديد حالة الزائر بناءً على مساره وسلته
      let status = 'browsing';
      if (pathname?.includes('/thank-you')) status = 'purchased';
      else if (pathname?.includes('/checkout')) status = 'checkout';
      else if (cartItems && cartItems.length > 0) status = 'active_cart';

      // 4. إرسال البيانات الأولية
      const updateSession = () => {
        set(sessionRef, {
          path: pathname || '/',
          cartValue: subtotal || 0,
          itemsCount: cartItems?.length || 0,
          status: status,
          lastActive: serverTimestamp(),
          lastActiveClient: Date.now(), // 🛡️ Fallback for safe timestamp handling
          device: window.innerWidth < 768 ? 'Mobile' : 'Desktop'
        }).catch(() => {
          // Silent fail on quota/network issues
        });
      };

      updateSession();

      // 🔥 HEARTBEAT: تحديث كل 20 ثانية عشان onDisconnect مش شغال
      heartbeatRef.current = setInterval(updateSession, 20000);

    } catch (error) {
      console.warn("LiveTracker initialization skipped (Edge Runtime Protection)");
    }

    // Cleanup لما الزائر يقفل التاب
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      // 🧹 مسح السيشن فوراً لما يقفل التاب
      if (sessionRef && !pathname?.includes('/thank-you')) {
        remove(sessionRef).catch(() => {});
      }
    };

  }, [pathname, cartItems?.length, subtotal]);

  return null;
}