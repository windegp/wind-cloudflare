"use client";
import { useEffect, useState, useMemo } from 'react';
import { getRtdb } from "@/lib/firebase"; 
import { useSettings } from "@/context/SettingsContext"; // 🔥 الربط مع الكونتكس الموفر
// 🔥 استدعاء دوال الـ Realtime Database
import { ref, onValue } from "firebase/database"; 
import { Package, TrendingUp, ShoppingCart, Users, Activity, Calendar, ChevronDown, Eye } from '@/components/icons-extra';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useSettings(); // سحب البيانات المجمعة من الكونتكس (0 قراءة إضافية)
  const [liveVisitors, setLiveVisitors] = useState(0);

  // استخراج الأرقام من وثيقة الإعدادات المركزية - Safe property access for legacy browsers
  // Memoized to prevent recalculation on every render
  const stats = useMemo(() => {
    const counters = (settings && settings.counters) || {};
    return {
      products: counters.products || 0,
      orders: counters.orders || 0,
      sales: counters.sales || 0,
      customers: counters.customers || 0,
      visitors: counters.visitors || 0 // 🔥 الحقل الجديد
    };
  }, [settings]);

  // 🔥 [تعديل الحماية] جلب الزوار النشطين بذكاء لمنع استنزاف الكوتا وقت الخمول
  useEffect(() => {
    let unsubscribe = null;

    const startListening = () => {
      if (unsubscribe) return; // الخط مفتوح بالفعل
      try {
        const rtdb = getRtdb();
        const liveSessionsRef = ref(rtdb, 'LiveSessions');

        unsubscribe = onValue(liveSessionsRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const now = Date.now();
            let activeCount = 0;
            Object.values(data).forEach(session => {
              // 🛡️ FIXED: Safe timestamp handling with Date.now() fallback
              let lastActive = session.lastActive;

              // Guard 1: serverTime must be valid number (not object placeholder)
              // Using global isFinite with type check for legacy browser compatibility
              if (typeof lastActive !== 'number' || !isFinite(lastActive) || lastActive <= 0) {
                // Guard 2: fallback to client timestamp
                lastActive = session.lastActiveClient;
                if (typeof lastActive !== 'number' || !isFinite(lastActive) || lastActive <= 0) {
                  // Guard 3: use NOW to prevent filtering bug (don't return 0!)
                  lastActive = Date.now();
                }
              }

              // EXTENDED: 2 hours (7200000ms) - onDisconnect not working properly
              if (now - lastActive < 7200000) {
                activeCount++;
              }
            });
            setLiveVisitors(activeCount);
          } else {
            setLiveVisitors(0);
          }
        }, (error) => {
          console.error("RTDB Live View Error:", error);
        });
      } catch (error) {
        console.warn("Live View Dashboard skipped (Edge Protection)");
      }
    };

    const stopListening = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    // 1. تشغيل المراقبة فوراً لو التاب نشط
    if (!document.hidden) startListening();

    // 2. 🪄 حساس نشاط التاب - Keep listening for instant updates on return
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Admin returned to tab - onValue automatically syncs latest data
        // No need to stop/start, Firebase handles reconnection seamlessly
      }
      // Removed aggressive stopListening() - connection stays alive for real-time updates
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 3. التنظيف الشامل
    return () => {
      stopListening();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" dir="rtl">
      
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-2">
        <h2 className="text-xl font-bold text-[#202223]">نظرة عامة (Overview)</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 bg-white border border-gray-300 text-[#202223] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20 w-full sm:w-auto justify-center">
            <Calendar size={16} className="text-gray-500" />
            اليوم
            <ChevronDown size={16} className="text-gray-500" />
          </button>
        </div>
      </div>
      
      <div 
        onClick={() => router.push('/admin/live')}
        className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer group"
      >
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Eye size={20} className="text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#202223] flex items-center gap-2">
              الزوار النشطون حالياً
              <span className="relative flex h-2.5 w-2.5">
                {liveVisitors > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${liveVisitors > 0 ? 'bg-[#008060]' : 'bg-gray-300'}`}></span>
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">مباشر (Live View)</p>
          </div>
        </div>
        <div className={`text-3xl font-black w-full sm:w-auto text-right sm:text-left ${liveVisitors > 0 ? 'text-[#008060]' : 'text-gray-400'}`}>
          {liveVisitors}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي المبيعات">إجمالي المبيعات</h3>
            <TrendingUp size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]" dir="ltr">
  EGP {Number(stats.sales).toLocaleString()}
</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span className="text-green-600 font-bold">--%</span> مقارنة بأمس
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="زيارات المتجر">زيارات المتجر</h3>
            <Users size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">
   {Number(stats.visitors).toLocaleString()}
</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span className="text-red-500 font-bold">--%</span> مقارنة بأمس
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي الطلبات">إجمالي الطلبات</h3>
            <ShoppingCart size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">{stats.orders}</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span className="text-gray-400 font-bold">--</span> طلبات قيد الانتظار
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="معدل التحويل">معدل التحويل</h3>
            <Activity size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">--%</p>
            <p className="text-xs text-gray-500 mt-1">مضاف إلى السلة: --%</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="المنتجات النشطة">المنتجات النشطة</h3>
            <Package size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">{stats.products}</p>
            <p className="text-xs text-gray-500 mt-1">منتج متاح في المتجر</p>
          </div>
        </div>

      </div>
    </div>
  );
}