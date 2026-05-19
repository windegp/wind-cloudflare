"use client";
import { useEffect, useState, useMemo } from 'react';
import { getRtdb, getDb } from "@/lib/firebase"; // 🛡️ تم التعديل للاستدعاء الفعلي للدوال من ملفك
import { useSettings } from "@/context/SettingsContext"; 
import { ref, onValue } from "firebase/database"; 
// استدعاء دوال الفلترة والاستعلام متوافقة مع النسخة الـ Lite
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore/lite";
import { Package, TrendingUp, ShoppingCart, Users, Activity, Calendar, ChevronDown, Eye } from '@/components/icons-extra';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useSettings(); 
  const [liveVisitors, setLiveVisitors] = useState(0);

  // حالات الفلترة والتحميل
  const [filter, setFilter] = useState('today'); 
  const [loading, setLoading] = useState(false);
  const [filteredStats, setFilteredStats] = useState({
    orders: 0,
    sales: 0
  });

  // استخراج الأرقام الكلية من وثيقة الإعدادات المركزية
  const totalStats = useMemo(() => {
    const counters = (settings && settings.counters) || {};
    return {
      products: counters.products || 0,
      orders: counters.orders || 0,
      sales: counters.sales || 0,
      customers: counters.customers || 0,
      visitors: counters.visitors || 0 
    };
  }, [settings]);

  // منطق الفلترة الذكي وحساب التواريخ
  useEffect(() => {
    if (filter === 'all') {
      setFilteredStats({ orders: totalStats.orders, sales: totalStats.sales });
      return;
    }

    const fetchFilteredOrders = async () => {
      setLoading(true);
      try {
        const now = new Date();
        let startDate = new Date();

        if (filter === 'today') {
          startDate.setHours(0, 0, 0, 0); 
        } else if (filter === 'week') {
          startDate.setDate(now.getDate() - 7); 
        } else if (filter === 'month') {
          startDate.setMonth(now.getMonth() - 1); 
        }

        // استدعاء دالة جلب الداتابيز الفعلي getDb() لتمريرها للاستعلام
        const database = getDb();
        const q = query(
          collection(database, "orders"), 
          where("createdAt", ">=", Timestamp.fromDate(startDate))
        );

        const snapshot = await getDocs(q);
        let ordersCount = 0;
        let salesSum = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          ordersCount++;
          salesSum += Number(data.totalPrice || 0); 
        });

        setFilteredStats({ orders: ordersCount, sales: salesSum });
      } catch (error) {
        console.error("Error fetching filtered data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFilteredOrders();
  }, [filter, totalStats]);

  // جلب الزوار النشطين (Realtime Database)
  useEffect(() => {
    let unsubscribe = null;

    const startListening = () => {
      if (unsubscribe) return;
      try {
        const rtdb = getRtdb();
        const liveSessionsRef = ref(rtdb, 'LiveSessions');

        unsubscribe = onValue(liveSessionsRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const now = Date.now();
            let activeCount = 0;
            Object.values(data).forEach(session => {
              let lastActive = session.lastActive;

              if (typeof lastActive !== 'number' || !isFinite(lastActive) || lastActive <= 0) {
                lastActive = session.lastActiveClient;
                if (typeof lastActive !== 'number' || !isFinite(lastActive) || lastActive <= 0) {
                  lastActive = Date.now();
                }
              }

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

    if (!document.hidden) startListening();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // يتم المزامنة تلقائياً عند العودة للنافذة
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopListening();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" dir="rtl">
      
      {/* عنوان الصفحة والـ Filter */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-2">
        <h2 className="text-xl font-bold text-[#202223]">نظرة عامة (Overview)</h2>
        <div className="relative inline-block w-full sm:w-auto">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={loading}
            className="appearance-none bg-white border border-gray-300 text-[#202223] pr-10 pl-8 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20 w-full sm:w-44 cursor-pointer"
          >
            <option value="today">اليوم</option>
            <option value="week">الأسبوع الماضي</option>
            <option value="month">الشهر الماضي</option>
            <option value="all">كل الوقت (Lifetime)</option>
          </select>
          <Calendar size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>
      
      {/* بطاقة الزوار النشطين حالياً */}
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

      {/* شبكة الإحصائيات والأرقام */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* إجمالي المبيعات */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32 relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 animate-pulse pointer-events-none" />}
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي المبيعات بالفترة المحددة">إجمالي المبيعات</h3>
            <TrendingUp size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]" dir="ltr">
              EGP {Number(filteredStats.sales).toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">المبيعات بحسب الفلتر المختار</p>
          </div>
        </div>

        {/* زيارات المتجر الكلية */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي زيارات المتجر">زيارات المتجر</h3>
            <Users size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">
              {Number(totalStats.visitors).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">الرقم الإجمالي التراكمي</p>
          </div>
        </div>

        {/* إجمالي الطلبات */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32 relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 animate-pulse pointer-events-none" />}
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي الطلبات بالفترة المحددة">إجمالي الطلبات</h3>
            <ShoppingCart size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">{filteredStats.orders}</p>
            <p className="text-xs text-gray-400 mt-1">الطلبات بحسب الفلتر المختار</p>
          </div>
        </div>

        {/* معدل التحويل */}
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

        {/* المنتجات النشطة */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="المنتجات النشطة">المنتجات النشطة</h3>
            <Package size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">{totalStats.products}</p>
            <p className="text-xs text-gray-500 mt-1">منتج متاح في المتجر</p>
          </div>
        </div>

      </div>
    </div>
  );
}