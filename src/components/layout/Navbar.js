"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from "@/context/CartContext"; 
import { useSettings } from "@/context/SettingsContext";
import { X, ShoppingBag, ChevronLeft, ArrowRight, ChevronRight } from '@/components/icons-extra';
import logo from '@/../public/logo.png';


export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { cartItems = [], toggleCart } = useCart() || {};
  
  const { settings: activeSettings } = useSettings();

  // Smart sticky: hide on scroll down, show on scroll up
  const [prevScrollY, setPrevScrollY] = useState(0);
  const [navHidden, setNavHidden] = useState(false);
  const tickingRef = useRef(false);
  const HEADER_HEIGHT = 80; // announcement bar + nav bar
  const TOTAL_HIDE = 40; // announcement bar height
  const MIN_SCROLL = 80;

  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - prevScrollY;
        if (currentY > MIN_SCROLL) {
          if (delta > 5 && currentY > TOTAL_HIDE) {
            setNavHidden(true);
          } else if (delta < -5) {
            setNavHidden(false);
          }
        } else {
          setNavHidden(false);
        }
        setPrevScrollY(currentY);
        tickingRef.current = false;
      });
      tickingRef.current = true;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prevScrollY]);

  // دمج البيانات (الأولوية للبيانات الحية)
  const announcements = activeSettings?.announcements || ["WIND Shopping"];
  const liveMenuItems = activeSettings?.menuItems || [];

  // ⚡ 2. حالات المنيو والإعلانات
  const [categories, setCategories] = useState([]);
  const [activeLayer, setActiveLayer] = useState({ title: "الرئيسية", items: [] });
  const [history, setHistory] = useState([]);
  const [adIndex, setAdIndex] = useState(0);

  // --- شرط الإخفاء (الآدمن والـ Checkout) ---
  const shouldHideNavbar = pathname.startsWith('/admin') || pathname.startsWith('/checkout');

  // --- وظائف مساعدة ---
  const formatLink = (link) => {
    if (!link) return "/";
    if (link.startsWith('/') || link.startsWith('http')) return link;
    return `/collections/${link}`;
  };

  const sanitizeMenuItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
      ...item,
      id: item.id || Math.random().toString(36).substr(2, 9),
      title: typeof item.title === 'string' ? item.title : "قسم",
      link: formatLink(item.link),
      children: sanitizeMenuItems(item.children || [])
    }));
  };

  // --- منطق تقليب الإعلانات ---
  const nextAd = () => {
    setAdIndex((prev) => (prev === announcements.length - 1 ? 0 : prev + 1));
  };
  const prevAd = () => {
    setAdIndex((prev) => (prev === 0 ? announcements.length - 1 : prev - 1));
  };

  // أوتوماتيك لتقليب الإعلانات
  useEffect(() => {
    if (announcements.length > 1) {
      const interval = setInterval(nextAd, 4000);
      return () => clearInterval(interval);
    }
  }, [announcements.length]);

  // تحديث المنيو عند وصول البيانات الحية
  useEffect(() => {
    if (liveMenuItems && liveMenuItems.length > 0) {
      const cleanData = sanitizeMenuItems(liveMenuItems);
      setCategories(cleanData);
      if (history.length === 0) {
        setActiveLayer({ title: activeSettings?.brandName || "WIND Catalogue", items: cleanData });
      }
    }
  }, [liveMenuItems, activeSettings?.brandName]);

  // --- محرك التنقل ---
  const openSubMenu = (item) => {
    setHistory([...history, activeLayer]);
    setActiveLayer({ title: item.title, items: item.children });
  };

  const goBack = () => {
    if (history.length === 0) return;
    const previousLayer = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setActiveLayer(previousLayer);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setTimeout(() => {
      setHistory([]);
      setActiveLayer({ title: activeSettings?.brandName || "WIND Catalogue", items: categories });
    }, 300);
  };

  // حماية الـ Build: لو في صفحة مستثناة لا ترسم شيئاً
  if (shouldHideNavbar) return null;

  return (
    <>
      <div className={`fixed top-0 left-0 right-0 z-[110] transition-all duration-500 ${navHidden ? '-translate-y-full' : 'translate-y-0'}`}>
        {/* 1. شريط الإعلانات العلوي */}
        <div className="bg-[#111] text-white h-9 flex items-center justify-center border-b border-[#222] px-4 transition-colors duration-700">
          <div className="flex items-center gap-4 md:gap-8 relative justify-center">
            <button onClick={prevAd} className="hover:scale-125 hover:text-white transition-all p-1 z-10">
              <ChevronLeft className="w-4 h-4 animate-arrow-slide-left cursor-pointer text-white/40" />
            </button>

            <div className="overflow-hidden relative h-6 flex justify-center items-center w-[250px] md:w-[350px]">
              {announcements.map((text, index) => (
                <span 
                  key={index}
                  className={`text-[10px] md:text-[11px] font-light tracking-[0.15em] absolute inset-0 flex items-center justify-center whitespace-nowrap font-tajawal
                  ${index === adIndex ? 'animate-slide-right-text' : 'opacity-0'}`}
                >
                  {text}
                </span>
              ))}
            </div>

            <button onClick={nextAd} className="hover:scale-125 hover:text-white transition-all p-1 z-10">
              <ChevronRight className="w-4 h-4 animate-arrow-slide-right cursor-pointer text-white/40" />
            </button>
          </div>
        </div>

        {/* 2. النافبار الأساسي */}
        <nav className="bg-white h-14 w-full">
        <div className="max-w-[1600px] mx-auto px-6 h-full flex items-center justify-between">
          <button onClick={() => setIsMenuOpen(true)} className="group flex items-center gap-3 text-black/70 hover:text-[#1A1A1A] transition-all">
            <div className="flex flex-col gap-[5px] overflow-hidden">
              <span className="w-[24px] h-[1.5px] bg-current transition-all group-hover:w-[16px]"></span>
              <span className="w-[16px] h-[1.5px] bg-current transition-all group-hover:w-[24px]"></span>
              <span className="w-[24px] h-[1.5px] bg-current"></span>
            </div>
            <span className="hidden md:block text-[10px] font-black tracking-widest uppercase">Menu</span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2">
            <Link href="/" className="block">
              <img 
                src={activeSettings?.logoUrl || logo.src} 
                alt={activeSettings?.brandName || "WIND Shopping"}
                className="h-12 md:h-14 w-auto object-contain scale-[1.3] md:scale-[1.5] origin-center brightness-110 contrast-125 hover:scale-[1.4] md:hover:scale-[1.6] transition-all duration-700" 
              />
            </Link>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={toggleCart} className="relative group p-2 text-black/70 hover:text-[#1A1A1A] transition-all">
              <ShoppingBag size={24} strokeWidth={1.5} />
              {cartItems?.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#1A1A1A] text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                  {cartItems.length}
                </span>
              )}
            </button>
          </div>
          </div>
        </nav>
      </div>

      {/* 3. المنيو الجانبي */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[1000] overflow-hidden" dir="rtl">
          <div className="absolute inset-0 bg-black/40 transition-opacity duration-300" onClick={closeMenu}></div>
          <div className="absolute top-0 right-0 w-full max-w-[85%] md:max-w-[400px] h-full bg-white border-l border-[#EBEBEB] shadow-xl flex flex-col animate-slide-in">
            <div className="px-6 border-b border-[#EBEBEB] bg-white flex justify-between items-center min-h-[72px]">
              {history.length > 0 ? (
                <button onClick={goBack} className="flex items-center gap-2 border border-[#E0E0E0] text-[#111] px-4 py-2 rounded-lg font-bold text-xs hover:bg-[#F5F5F5] transition-colors">
                  <ArrowRight size={14} strokeWidth={2.5} />
                  <span>رجوع</span>
                </button>
              ) : (
                <span className="text-[9px] font-black text-[#999] tracking-[0.4em] uppercase italic">WIND</span>
              )}
              <button onClick={closeMenu} className="text-[#999] hover:text-[#111] transition-colors p-2 border border-[#E8E8E8] rounded-full">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 pt-5 pb-2">
              <h2 className="text-xl font-black text-[#111] animate-fade-in tracking-tight">{history.length === 0 ? "القائمة" : activeLayer.title}</h2>
              <div className="h-[1px] w-8 bg-[#111] mt-2 mb-1"></div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-10 custom-scrollbar">
              <ul className="space-y-0">
                {activeLayer.items.map((item, i) => (
                  <li key={item.id || i} className="animate-fade-up" style={{ animationDelay: `${i * 0.03}s` }}>
                    {item.children?.length > 0 ? (
                      <button onClick={() => openSubMenu(item)} className="w-full flex items-center justify-between py-4 px-2 border-b border-[#F0F0F0] hover:bg-[#FAFAF8] group transition-all">
                        <span className="text-[15px] font-bold text-[#111] group-hover:text-[#333]">{item.title}</span>
                        <ChevronLeft size={16} className="text-[#bbb] group-hover:text-[#111] transition-colors" />
                      </button>
                    ) : (
                      <Link href={item.link} onClick={closeMenu} className="block py-4 px-2 border-b border-[#F0F0F0] text-[15px] font-semibold text-[#444] hover:text-[#111] transition-all">
                        {item.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5 border-t border-[#EBEBEB] bg-white text-center">
              <p className="text-[8px] text-[#ccc] font-bold uppercase tracking-[0.5em]">WIND PREMIUM WEAR</p>
            </div>
          </div>
        </div>
      )}

      {/* الستايلات */}
      <style jsx global>{`
        @keyframes slide-right-text {
          0% { opacity: 0; transform: translateX(-30px); }
          15% { opacity: 1; transform: translateX(0); }
          85% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(30px); }
        }
        .animate-slide-right-text { animation: slide-right-text 4s cubic-bezier(0.2, 0.8, 0.2, 1) infinite; }
        @keyframes arrow-slide-right { 0%, 100% { transform: translateX(-3px); opacity: 0.4; } 50% { transform: translateX(3px); opacity: 1; } }
        @keyframes arrow-slide-left { 0%, 100% { transform: translateX(3px); opacity: 0.4; } 50% { transform: translateX(-3px); opacity: 1; } }
        .animate-arrow-slide-right { animation: arrow-slide-right 2s ease-in-out infinite; }
        .animate-arrow-slide-left { animation: arrow-slide-left 2s ease-in-out infinite; }
        @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slide-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
        @keyframes fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-up { animation: fade-up 0.2s ease-out forwards; opacity: 0; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ddd; border-radius: 10px; }
      `}</style>
    </>
  );
}