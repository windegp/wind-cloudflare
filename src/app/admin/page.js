"use client";
import { useEffect, useState, useMemo, useCallback } from 'react';
import { getRtdb } from "@/lib/firebase";
import { useSettings } from "@/context/SettingsContext";
import { ref, onValue } from "firebase/database";
// firestore imports moved to dynamic fetch inside useEffect
import { Package, TrendingUp, ShoppingCart, Users, Activity, Calendar, ChevronDown, Eye } from '@/components/icons-extra';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useSettings(); // سحب البيانات المجمعة من الكونتكس (0 قراءة إضافية)
  const [liveVisitors, setLiveVisitors] = useState(0);

  // --- بيانات الطلبات للفلترة الزمنية ---
  const [recentOrders, setRecentOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [activePeriod, setActivePeriod] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // جلب آخر 500 طلب مرة واحدة فقط (لا يؤثر على counters أو tabs الطلبات)
  useEffect(() => {
    if (ordersLoaded) return;
    const fetchRecent = async () => {
      try {
        const { getDb } = await import("@/lib/firebase");
        const { collection, query, orderBy, limit, getDocs } = await import("firebase/firestore/lite");
        const db = getDb();
        const q = query(
          collection(db, "Orders"),
          orderBy("Created at", "desc"),
          limit(500)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => d.data());
        setRecentOrders(docs);
        setOrdersLoaded(true);
      } catch (e) {
        console.error("Dashboard orders fetch:", e);
        setOrdersLoaded(true);
      }
    };
    fetchRecent();
  }, [ordersLoaded]);

  // تحويل "Created at" string لـ Date بأمان
  const parseOrderDate = useCallback((str) => {
    if (!str) return null;
    const s = str.replace(/ \+\d{4}$/, '').trim();
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  // حساب نطاق التاريخ حسب الفترة المختارة
  const getPeriodRange = useCallback((period) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (period === 'this_month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59)];
    if (period === 'last_month') return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59)];
    if (period === 'dec_feb') return [new Date(2025, 11, 1), new Date(2026, 1, 28, 23, 59, 59)];
    if (period === 'all') return [new Date(2019, 0, 1), new Date(2030, 0, 1)];
    return null;
  }, []);

  // حساب إحصائيات الفترة المختارة من الطلبات المجلوبة
  const periodStats = useMemo(() => {
    if (!recentOrders.length) return null;

    let from, to;
    if (activePeriod === 'custom' && customFrom && customTo) {
      from = new Date(customFrom);
      to = new Date(customTo + 'T23:59:59');
    } else {
      const range = getPeriodRange(activePeriod);
      if (!range) return null;
      [from, to] = range;
    }

    const filtered = recentOrders.filter(o => {
      if (o['Financial Status'] === 'deleted') return false;
      const isAbandoned = o['Financial Status'] === 'abandoned' ||
        o['Financial Status'] === 'pending_payment' ||
        (o.Name && o.Name.startsWith('DRAFT-'));
      if (isAbandoned) return false;
      const d = parseOrderDate(o['Created at']);
      return d && d >= from && d <= to;
    });

    // الفترة السابقة للمقارنة
    const span = to - from;
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = new Date(from.getTime() - 1);
    const prevFiltered = recentOrders.filter(o => {
      if (o['Financial Status'] === 'deleted') return false;
      const isAbandoned = o['Financial Status'] === 'abandoned' ||
        o['Financial Status'] === 'pending_payment' ||
        (o.Name && o.Name.startsWith('DRAFT-'));
      if (isAbandoned) return false;
      const d = parseOrderDate(o['Created at']);
      return d && d >= prevFrom && d <= prevTo;
    });

    const paidOrders = filtered.filter(o =>
      o['Financial Status'] === 'paid' || o['Financial Status'] === 'fulfilled'
    );
    const totalSales = paidOrders.reduce((s, o) => s + Number(o.Total || 0), 0);
    const aov = paidOrders.length > 0 ? Math.round(totalSales / paidOrders.length) : 0;
    const uniqueEmails = new Set(
      filtered.map(o => (o.Email || '').toLowerCase()).filter(Boolean)
    );
    const paidRate = filtered.length > 0
      ? Math.round((paidOrders.length / filtered.length) * 100)
      : 0;

    // معدل التحويل: طلبات ÷ زوار الفترة (تقديري بناء على نسبة الأيام)
    const days = Math.max(1, Math.round(span / (1000 * 60 * 60 * 24)));
    const totalVisitors = stats.visitors || 30000;
    const periodVisitors = Math.round((days / 90) * totalVisitors);
    const cr = periodVisitors > 0
      ? ((filtered.length / periodVisitors) * 100).toFixed(1)
      : '—';

    // مقارنة بالفترة السابقة
    const prevSales = prevFiltered
      .filter(o => o['Financial Status'] === 'paid' || o['Financial Status'] === 'fulfilled')
      .reduce((s, o) => s + Number(o.Total || 0), 0);
    const diffOrders = filtered.length - prevFiltered.length;
    const diffSales = Math.round(totalSales - prevSales);

    return {
      orders: filtered.length,
      sales: Math.round(totalSales),
      aov,
      customers: uniqueEmails.size,
      paidRate,
      cr,
      periodVisitors,
      diffOrders,
      diffSales,
      hasPrev: prevFiltered.length > 0,
    };
  }, [recentOrders, activePeriod, customFrom, customTo, getPeriodRange, parseOrderDate, stats.visitors]);

  const periodLabel = {
    this_month: 'هذا الشهر',
    last_month: 'الشهر الماضي',
    dec_feb: 'ديسمبر – فبراير',
    all: 'كل الوقت',
    custom: 'فترة مخصصة',
  };

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

      {/* فلتر الفترة الزمنية */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 shadow-sm">
        <Activity size={16} className="text-gray-400 shrink-0" />
        {['this_month','last_month','dec_feb','all','custom'].map(p => (
          <button
            key={p}
            onClick={() => {
              setActivePeriod(p);
              setShowCustom(p === 'custom');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activePeriod === p
                ? 'bg-[#008060] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {periodLabel[p]}
          </button>
        ))}
        {showCustom && (
          <div className="flex items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-[#008060]"
            />
            <span className="text-xs text-gray-400">إلى</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-[#008060]"
            />
          </div>
        )}
      </div>

      {/* كروت إحصائيات الفترة */}
      {periodStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: 'الطلبات',
              value: periodStats.orders.toLocaleString(),
              sub: periodStats.hasPrev
                ? `${periodStats.diffOrders >= 0 ? '+' : ''}${periodStats.diffOrders} من السابق`
                : null,
              subColor: periodStats.diffOrders >= 0 ? 'text-green-600' : 'text-red-500',
            },
            {
              label: 'المبيعات',
              value: periodStats.sales.toLocaleString() + ' EGP',
              sub: periodStats.hasPrev
                ? `${periodStats.diffSales >= 0 ? '+' : ''}${periodStats.diffSales.toLocaleString()} EGP`
                : null,
              subColor: periodStats.diffSales >= 0 ? 'text-green-600' : 'text-red-500',
            },
            {
              label: 'متوسط الطلب',
              value: periodStats.aov.toLocaleString() + ' EGP',
              sub: 'لكل طلب مدفوع',
              subColor: 'text-gray-400',
            },
            {
              label: 'معدل التحويل',
              value: periodStats.cr + '%',
              sub: `${periodStats.orders} ÷ ${periodStats.periodVisitors.toLocaleString()} زيارة`,
              subColor: 'text-gray-400',
            },
            {
              label: 'عملاء فريدون',
              value: periodStats.customers.toLocaleString(),
              sub: 'إيميل غير مكرر',
              subColor: 'text-gray-400',
            },
            {
              label: 'نسبة الإتمام',
              value: periodStats.paidRate + '%',
              sub: 'من إجمالي الطلبات',
              subColor: 'text-gray-400',
            },
          ].map(card => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className="text-lg font-bold text-[#202223] leading-tight">{card.value}</p>
              {card.sub && (
                <p className={`text-[10px] mt-1 font-medium ${card.subColor}`}>{card.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!periodStats && ordersLoaded && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400 shadow-sm">
          لا توجد طلبات في هذه الفترة
        </div>
      )}

      {!ordersLoaded && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400 shadow-sm animate-pulse">
          جاري حساب إحصائيات الفترة...
        </div>
      )}
      
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