"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import ScrollToTop from "./ScrollToTop";
import { fbTrack } from "@/lib/fbTrack";

export default function StoreLayout({ children }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  // 🔥 نرسل PageView للسيرفر (Conversions API) عند كل تغيير مسار حقيقي
  // (بخلاف fbq الذي يرسل من المتصفح فقط مرة واحدة عند أول تحميل).
  // هذا يحسّن "Conversions API coverage" لحدث PageView كما أوصى فيسبوك،
  // ولا يحمل أي array فيتأثر بمشكلة flattening.
  useEffect(() => {
    if (!isAdmin) {
      fbTrack("PageView", {});
    }
  }, [pathname, isAdmin]);

  return (
    <>
      {/* لو مش في الأدمن، اعرض الهيدر وسلة المشتريات */}
      {!isAdmin && <Navbar />}
      {!isAdmin && <CartDrawer />}

      {/* المحتوى الأساسي للصفحة (سواء أدمن أو متجر) */}
      <main className={`min-h-screen ${!isAdmin ? 'pt-[96px]' : ''}`}>
        {children}
      </main>

      {/* لو مش في الأدمن، اعرض الفوتر وزر الصعود */}
      {!isAdmin && <Footer />}
      {!isAdmin && <ScrollToTop />}
    </>
  );
}