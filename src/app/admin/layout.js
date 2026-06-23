"use client";
import { SWRConfig } from 'swr';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuthInstance } from "@/lib/firebase"; 
import { ADMIN_UID } from "@/lib/constants";
import OrderNotifications from "@/components/OrderNotifications";

// 👇 دمجنا كل الأيقونات في استدعاء واحد فقط عشان نمنع أي خطأ
import { Search, Menu, X, User, ShoppingCart, ChevronDown, Grid, List, Filter, Edit, Trash2, Copy, Move, Plus, LayoutDashboard, Package, ShoppingBag, PlusCircle, Users, Star, Palette, FolderTree, FileText, Settings, Lock, LogOut, ChevronLeft, Tag } from '@/components/icons-extra';

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuthInstance();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      // Check if user is the hardcoded admin UID
      if (u && u.uid === ADMIN_UID) {
        setUser(u);
      } else if (u) {
        // User is authenticated but not admin - sign them out
        signOut(auth);
        setUser(null);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const menu = [
    { name: 'الرئيسية', path: '/admin', icon: <LayoutDashboard size={20}/> },
    { name: 'الطلبات', path: '/admin/orders', icon: <Package size={20}/> },
    { name: 'العملاء', path: '/admin/customers', icon: <Users size={20}/> },
    { name: 'المنتجات', path: '/admin/products', icon: <ShoppingBag size={20}/> },
    { name: 'إضافة منتج', path: '/admin/products/create', icon: <PlusCircle size={20}/> },
    { name: 'التقييمات', path: '/admin/reviews', icon: <Star size={20}/> }, // ← قسم التقييمات الجديد
    { name: 'الأقسام', path: '/admin/collections', icon: <FolderTree size={20}/> },
    { name: 'إدارة الواجهة', path: '/admin/home-manager', icon: <Palette size={20}/> },
    { name: 'المنيو', path: '/admin/menu', icon: <Menu size={20}/> },
    { name: 'الصفحات', path: '/admin/pages', icon: <FileText size={20}/> },
    { name: 'الإعدادات', path: '/admin/settings', icon: <Settings size={20}/> },
    { name: 'العروض والخصومات', path: '/admin/promotions', icon: <Tag size={20}/> },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#202223]"></div>
      </div>
    );
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (!user || user.uid !== ADMIN_UID) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex flex-col items-center justify-center p-4 text-center" dir="rtl">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 max-w-sm w-full shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="text-[#202223]" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#202223] mb-2">منطقة محظورة</h2>
          <p className="text-gray-500 mb-8 text-sm">عذراً، يجب تسجيل الدخول بحساب المدير لتتمكن من إدارة الموقع.</p>
          
          <Link 
            href="/admin/login"
            prefetch={false}
            className="w-full py-3 bg-[#1a1a1a] text-white font-bold rounded-xl hover:bg-black transition-all block text-center shadow-sm"
          >
            تسجيل الدخول كمدير
          </Link>
        </div>
      </div>
    );
  }

 return (
    // 🔥 تغليف الأدمن بالكامل بإعدادات SWR لتقليل استهلاك الكوتا
    <SWRConfig 
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        dedupingInterval: 300000, 
        revalidateIfStale: false
      }}
    >
      <div className="h-screen bg-[#f4f6f8] text-[#202223] flex overflow-hidden font-sans" dir="rtl">
        {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`fixed lg:relative z-50 h-full bg-[#ebebeb] border-l border-gray-300 transition-all duration-300 ease-in-out shadow-xl lg:shadow-none flex flex-col ${
        isOpen ? 'translate-x-0 w-64' : 'translate-x-full lg:translate-x-0 lg:w-20'
      }`}>
        <div className="p-4 lg:p-5 border-b border-gray-300 flex justify-between items-center h-16 lg:h-20 bg-[#ebebeb]">
          {isOpen && <h1 className="font-black text-xl tracking-tight text-[#202223] ml-2 text-center flex-1">WIND</h1>}
          <button onClick={() => setIsOpen(!isOpen)} className="text-gray-600 hover:bg-gray-300 p-2 rounded-lg transition-colors mx-auto lg:mx-0 hidden lg:block">
            <Menu size={20}/>
          </button>
          <button onClick={() => setIsOpen(false)} className="text-gray-600 hover:bg-gray-300 p-2 rounded-lg transition-colors lg:hidden">
            <ChevronLeft size={20}/>
          </button>
        </div>
        
        <nav className="p-3 space-y-1 mt-2 flex-1 overflow-y-auto scrollbar-hide">
          {menu.map((item) => {
            const active = pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path));
            return (
              // 🔥 تم استبدال Link بـ div مع onClick لقتل الـ Hover Prefetch تماماً
              <div 
                key={item.path} 
                onClick={() => { 
                  if(window.innerWidth < 1024) setIsOpen(false);
                  router.push(item.path); // الانتقال لا يحدث إلا بالنقر الصريح
                }} 
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                  active 
                  ? 'bg-white text-[#1a1a1a] font-bold shadow-sm border border-gray-200' 
                  : 'text-gray-600 hover:bg-gray-200 hover:text-[#1a1a1a]'
                }`}
              >
                <div className={`${active ? 'text-[#008060]' : 'text-gray-500'}`}>
                  {item.icon}
                </div>
                {isOpen && <span className="text-sm flex-1">{item.name}</span>}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-300 space-y-2">
          {/* 🔥 OrderNotifications لازم يفضل mounted دايمًا، حتى لو الـ sidebar
              مقفول — لأنه هو المسؤول عن الاستماع للإشعارات اللحظية
              (listenForegroundMessages) وتجديد التوكن. لو اتقفل من هنا،
              الإشعارات بتتوقف لحد ما تفتح الـ sidebar تاني. */}
          <div className="px-1">
            <OrderNotifications isOpen={isOpen} />
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-all"
          >
            <LogOut size={20}/>
            {isOpen && <span className="text-sm font-bold">تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-y-auto bg-[#f4f6f8] flex flex-col relative custom-scrollbar">
        <div className="lg:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <button onClick={() => setIsOpen(true)} className="p-2 -m-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Menu size={24}/>
          </button>
          <h1 className="font-black text-lg text-[#202223]">WIND</h1>
          <div className="w-8"></div>
        </div>

        <div className="p-4 md:p-6 lg:p-8 w-full max-w-[1200px] mx-auto pb-24">
          {children}
        </div>
      </main>
    </div>
    </SWRConfig>
  );
}