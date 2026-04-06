"use client";
import { useEffect, useState } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore/lite";
import { Package, TrendingUp, ShoppingCart, Users, Activity, Calendar, ChevronDown, Eye } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  // ⚠️ المنطق القديم بالكامل بدون أي مساس
  const [stats, setStats] = useState({ products: 0, orders: 12, sales: 4500 });

  useEffect(() => {
    getDocs(collection(getDb(), "products")).then(s => setStats(p => ({...p, products: s.size})));
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" dir="rtl">
      
      {/* 1. الهيدر وتحديد التاريخ (مجهز للمستقبل) */}
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
      
      {/* 2. شريط البث الحي (Live View) - تصميم شوبيفاي المدمج */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Eye size={20} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#202223] flex items-center gap-2">
              الزوار النشطون حالياً
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#008060]"></span>
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">مباشر (Live View)</p>
          </div>
        </div>
        <div className="text-3xl font-black text-[#202223] w-full sm:w-auto text-right sm:text-left">
          -- {/* سيتم ربطه مستقبلاً */}
        </div>
      </div>

      {/* 3. شبكة الإحصائيات الشاملة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* كارت المبيعات (من الـ State الحالي) */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي المبيعات للتواريخ المحددة">إجمالي المبيعات</h3>
            <TrendingUp size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]" dir="ltr">EGP {stats.sales.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span className="text-green-600 font-bold">--%</span> مقارنة بأمس
            </p>
          </div>
        </div>

        {/* كارت الزيارات (مجهز للمستقبل) */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="عدد الجلسات في متجرك">زيارات المتجر</h3>
            <Users size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">--</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span className="text-red-500 font-bold">--%</span> مقارنة بأمس
            </p>
          </div>
        </div>

        {/* كارت الطلبات (من الـ State الحالي) */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="إجمالي الطلبات المكتملة">إجمالي الطلبات</h3>
            <ShoppingCart size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">{stats.orders}</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span className="text-gray-400 font-bold">--</span> طلبات قيد الانتظار
            </p>
          </div>
        </div>

        {/* كارت معدل التحويل (مجهز للمستقبل) */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="نسبة الزوار الذين قاموا بالشراء">معدل التحويل</h3>
            <Activity size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#202223]">--%</p>
            <p className="text-xs text-gray-500 mt-1">مضاف إلى السلة: --%</p>
          </div>
        </div>

        {/* كارت المنتجات (من الـ State الحالي) */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-600 border-b border-dashed border-gray-300 pb-0.5 cursor-help" title="عدد المنتجات المتاحة حالياً">المنتجات النشطة</h3>
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