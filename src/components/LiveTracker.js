"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '../context/CartContext';
// استدعاء دالة الـ RTDB اللي عملناها في ملف الكلاينت الأساسي
import { getRtdb } from '@/lib/firebase'; 
import { ref, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { debounceAsync, createSnapshot, hasSnapshotChanged } from '@/lib/writeOptimizer';

export default function LiveTracker() {
  const pathname = usePathname();
  const { cartItems, subtotal } = useCart();
  const sessionIdRef = useRef(null);
  const lastSnapshotRef = useRef("");

  // Debounced live tracking update
  const updateLiveSessionDebounced = useRef(
    debounceAsync(async (sessionData) => {
      try {
        const rtdb = getRtdb();
        const sessionRef = ref(rtdb, `LiveSessions/${sessionIdRef.current}`);
        
        // Only update if data changed
        const currentSnapshot = createSnapshot(sessionData, ['path', 'cartValue', 'itemsCount', 'status']);
        if (!hasSnapshotChanged(lastSnapshotRef.current, currentSnapshot)) return;
        
        await set(sessionRef, sessionData);
        lastSnapshotRef.current = currentSnapshot;
      } catch (error) {
        console.warn("LiveTracker update failed:", error);
      }
    }, 2000) // 2 second debounce
  ).current;

  useEffect(() => {
    // 1. حظر تتبع الأدمن نهائياً لتوفير الموارد
    if (pathname?.startsWith('/admin')) return;

    // 2. إنشاء أو جلب معرف جلسة فريد للزائر
    if (!sessionStorage.getItem('wind_live_session')) {
      sessionStorage.setItem('wind_live_session', 'sess_' + Math.random().toString(36).substr(2, 9));
    }
    sessionIdRef.current = sessionStorage.getItem('wind_live_session');

    if (!sessionIdRef.current) return;

    try {
      const rtdb = getRtdb();
      // تحديد مسار الزائر في الـ Realtime Database
      const sessionRef = ref(rtdb, `LiveSessions/${sessionIdRef.current}`);

      // السحر المطلق: أمر لفايربيز بمسح هذا الزائر فور إغلاقه للمتصفح (مجاناً وبدون كود إضافي)
      onDisconnect(sessionRef).remove();

      // 3. تحديد حالة الزائر بناءً على مساره وسلته
      let status = 'browsing';
      if (pathname?.includes('/thank-you')) status = 'purchased';
      else if (pathname?.includes('/checkout')) status = 'checkout';
      else if (cartItems && cartItems.length > 0) status = 'active_cart';

      // 4. إرسال البيانات (debounced to reduce writes)
      const sessionData = {
        path: pathname || '/',
        cartValue: subtotal || 0,
        itemsCount: cartItems?.length || 0,
        status: status,
        lastActive: serverTimestamp(),
        device: window.innerWidth < 768 ? 'Mobile' : 'Desktop'
      };
      
      updateLiveSessionDebounced(sessionData);

    } catch (error) {
      console.warn("LiveTracker initialization skipped (Edge Runtime Protection)");
    }

  }, [pathname, cartItems?.length, subtotal]); 

  return null;
}