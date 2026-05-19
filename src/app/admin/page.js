"use client";
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getRtdb } from "@/lib/firebase"; 
import { useSettings } from "@/context/SettingsContext";
import { ref, onValue } from "firebase/database"; 
import { Package, TrendingUp, ShoppingCart, Users, Activity, Calendar, ChevronDown, Eye, ArrowLeft, Loader2, X } from '@/components/icons-extra';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PERIODS = [
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'آخر 7 أيام' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'last_month', label: 'الشهر الماضي' },
  { id: 'all', label: 'الكل' },
  { id: 'custom', label: 'فترة مخصصة' },
];

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useSettings();
  const [liveVisitors, setLiveVisitors] = useState(0);

  // ==========================================
  // حالة الفلترة — الـ default هو "اليوم"
  // ==========================================
  const [activePeriod, setActivePeriod] = useState('today');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const menuRef = useRef(null);

  const [dashboardData, setDashboardData] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState(null);

  // ==========================================
  // إغلاق القائمة عند النقر خارجها
  // ==========================================
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowPeriodMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ==========================================
  // جلب الإحصائيات
  // ==========================================
  const fetchDashboardStats = useCallback(async (period, startDate, endDate) => {
    setIsLoadingStats(true);
    setStatsError(null);
    
    try {
      let url = `/api/admin/dashboard-stats?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      
      const res = await fetch(url);
      const result = await res.json();
      
      if (result.success) {
        setDashboardData(result.data);
      } else {
        setStatsError(result.error || 'فشل تحميل البيانات');
        setDashboardData(null);
      }
    } catch (err) {
      setStatsError(err.message);
      setDashboardData(null);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // ==========================================
  // تحديث عند تغيير الفترة
  // ==========================================
  useEffect(() => {
    if (activePeriod === 'custom' && (!customStartDate || !customEndDate)) {
      // لا نجلب البيانات تلقائياً للفترة المخصصة إلا بعد الضغط على "عرض"
      if (!dashboardData) {
        // عرض رسالة انتظار بدلاً من جلب البيانات
      }
      return;
    }
    fetchDashboardStats(activePeriod, customStartDate, customEndDate);
  }, [activePeriod, fetchDashboardStats]);
  // ملاحظة: customStartDate/customEndDate مش متضمنين — بنستخدمهم يدوي

  // تحديث دوري كل 30 ثانية
  useEffect(() => {
    if (activePeriod === 'custom') return;
    const interval = setInterval(() => {
      fetchDashboardStats(activePeriod, customStartDate, customEndDate);
    }, 30000);
    return () => clearInterval(interval);
  }, [activePeriod, customStartDate, customEndDate, fetchDashboardStats]);

  // ==========================================
  // اختيار فترة
  // ==========================================
  const handlePeriodSelect = (periodId) => {
    setShowPeriodMenu(false);
    setShowCustomPicker(false);
    
    if (periodId === 'custom') {
      setShowCustomPicker(true);
      setActivePeriod('custom');
      // لا نجلب — المستخدم يضغط على "عرض"
      return;
    }
    
    setActivePeriod(periodId);
    fetchDashboardStats(periodId, '', '');
  };

  const handleCustomDateSubmit = () => {
    if (customStartDate && customEndDate) {
      setActivePeriod('custom');
      fetchDashboardStats('custom', customStartDate, customEndDate);
    }
  };

  // ==========================================
  // Live Visitors
  // ==========================================
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
                lastActive = session.lastActiveClient || Date.now();
              }
              if (now - lastActive < 7200000) activeCount++;
            });
            setLiveVisitors(activeCount);
          } else {
            setLiveVisitors(0);
          }
        }, () => {});
      } catch (error) {
        console.warn("Live View Dashboard skipped");
      }
    };
    if (!document.hidden) startListening();
    document.addEventListener("visibilitychange", () => {});
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const activePeriodLabel = PERIODS.find(p => p.id === activePeriod)?.label || 'اليوم';

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" dir="rtl">
      
      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-2">
        <h2 className="text-xl font-bold text-[#202223]">نظرة عامة (Overview)</h2>
        
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setShowPeriodMenu(!showPeriodMenu)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-[#202223] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20 w-full sm:w-auto justify-center"
          >
            <Calendar size={16} className="text-gray-500" />
            <span>{dashboardData?.periodLabel || activePeriodLabel}</span>
            <ChevronDown size={16} className={`text-gray-500 transition-transform ${showPeriodMenu ? 'rotate-180' : ''}`} />
          </button>

          {showPeriodMenu && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-56 overflow-hidden">
              {PERIODS.map(period => (
                <button
                  key={period.id}
                  onClick={() => handlePeriodSelect(period.id)}
                  className={`w-full text-right px-4 py-3 text-sm font-medium transition-colors hover:bg-gray-50 flex items-center gap-3 ${
                    activePeriod === period.id && !showCustomPicker ? 'bg-[#008060]/5 text-[#008060] font-bold' : 'text-gray-700'
                  }`}
                >
                  {activePeriod === period.id && !showCustomPicker ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#008060] shrink-0"></span>
                  ) : (
                    <span className="w-1.5 h-1.5 shrink-0"></span>
                  )}
                  {period.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom Date Picker */}
          {showCustomPicker && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 w-72">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-700">فترة مخصصة</h3>
                <button onClick={() => setShowCustomPicker(false)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">من</label>
                  <input 
                    type="date" 
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20 focus:border-[#008060]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">إلى</label>
                  <input 
                    type="date" 
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20 focus:border-[#008060]"
                  />
                </div>
                <button 
                  onClick={handleCustomDateSubmit}
                  disabled={!customStartDate || !customEndDate}
                  className="w-full py-2.5 bg-[#008060] text-white font-bold rounded-lg text-sm hover:bg-[#006e52] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  عرض البيانات
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== LIVE VISITORS ===== */}
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

      {/* ===== حالة التحميل ===== */}
      {isLoadingStats && !dashboardData && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="text-[#008060]" />
          <span className="mr-3 text-sm font-bold text-gray-500">جاري تحميل الإحصائيات...</span>
        </div>
      )}

      {/* ===== حالة انتظار الفترة المخصصة ===== */}
      {activePeriod === 'custom' && !dashboardData && !isLoadingStats && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Calendar size={48} className="text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-500 mb-1">اختر تاريخ البداية والنهاية</h3>
          <p className="text-sm text-gray-400">ثم اضغط على "عرض البيانات"</p>
        </div>
      )}

      {/* ===== خطأ ===== */}
      {statsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm font-bold text-red-600">خطأ: {statsError}</p>
          <button 
            onClick={() => fetchDashboardStats(activePeriod, customStartDate, customEndDate)}
            className="mt-2 text-xs text-red-500 underline hover:text-red-700"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ===== البطاقات الإحصائية ===== */}
      {dashboardData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* إجمالي المبيعات */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5">إجمالي المبيعات</h3>
              <TrendingUp size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#202223]" dir="ltr">
                EGP {Number(dashboardData.sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">{dashboardData.periodDays} يوم</p>
            </div>
          </div>

          {/* زوار المتجر */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5">زيارات المتجر</h3>
              <Users size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#202223]">
                {Number(dashboardData.visitors).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {dashboardData.periodDays > 1 ? `≈ ${Math.round(dashboardData.visitors / dashboardData.periodDays)} زيارة/يوم` : ''}
              </p>
            </div>
          </div>

          {/* إجمالي الطلبات */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5">إجمالي الطلبات</h3>
              <ShoppingCart size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#202223]">{dashboardData.orders}</p>
              <p className="text-xs text-gray-500 mt-1">{dashboardData.completedOrders} طلب مكتمل</p>
            </div>
          </div>

          {/* العملاء */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5">العملاء</h3>
              <Users size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#202223]">{dashboardData.totalCustomers}</p>
              <p className="text-xs text-gray-500 mt-1">عميل نشط</p>
            </div>
          </div>

          {/* معدل التحويل */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5">معدل التحويل</h3>
              <Activity size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#202223]">{dashboardData.conversionRate}%</p>
              <p className="text-xs text-gray-500 mt-1">
                {dashboardData.completedOrders} طلب ÷ {dashboardData.visitors} زائر
              </p>
            </div>
          </div>

          {/* المنتجات النشطة */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5">المنتجات النشطة</h3>
              <Package size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#202223]">
                {settings?.counters?.products || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">منتج متاح</p>
            </div>
          </div>

        </div>
      )}

      {/* ===== ملخص الفترة ===== */}
      {dashboardData && (
        <div className="bg-[#008060]/5 border border-[#008060]/10 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-[#008060]" />
            <span className="text-sm font-bold text-[#008060]">
              {dashboardData.periodLabel}
              {dashboardData.dateRange ? ` (${dashboardData.dateRange.start} → ${dashboardData.dateRange.end})` : ''}
            </span>
          </div>
          <button 
            onClick={() => fetchDashboardStats(activePeriod, customStartDate, customEndDate)}
            className="text-xs text-[#008060] font-bold hover:underline flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            تحديث
          </button>
        </div>
      )}

    </div>
  );
}