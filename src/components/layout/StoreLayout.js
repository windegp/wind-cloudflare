"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import ScrollToTop from "./ScrollToTop";
import { fbTrack } from "@/lib/fbTrack";
import WhatsAppWidget from "@/components/WhatsAppWidget";
export default function StoreLayout({ children }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const isCheckout = pathname === '/checkout' || pathname?.startsWith('/checkout/');

  // 🔥 PageView يُطلق من هنا فقط (نقطة استدعاء واحدة، لا يوجد fbq('track','PageView')
  // منفصل في layout.js بعد الآن) — كل تغيير مسار حقيقي يستدعي fbTrack()
  // الموحّدة، فتُطلق Browser + Server معاً بنفس event_id تلقائياً (Dual Fire).
  useEffect(() => {
    if (!isAdmin && !isCheckout) {
      fbTrack("PageView", {});
    }
  }, [pathname, isAdmin]);

  return (
    <>
      {/* لو مش في الأدمن، اعرض الهيدر وسلة المشتريات */}
      {!isAdmin && !isCheckout && <Navbar />}
      {!isAdmin && !isCheckout && <CartDrawer />}

      {/* المحتوى الأساسي للصفحة (سواء أدمن أو متجر) */}
      <main className={`min-h-screen ${!isAdmin && !isCheckout ? 'pt-[96px]' : ''}`}>
        {children}
      </main>

      {/* لو مش في الأدمن، اعرض الفوتر وزر الصعود */}
      {!isAdmin && !isCheckout && <Footer />}
      {!isAdmin && !isCheckout && <ScrollToTop />}
      {!isAdmin && !isCheckout && <WhatsAppWidget />}
    </>
  );
}