"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from "../../context/CartContext";
import { useGlobalLoader } from "@/context/GlobalLoaderContext";
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import ScrollToTop from "./ScrollToTop";
import { fbTrack } from "@/lib/fbTrack";
import { ttTrack } from "@/lib/ttTrack";
import WhatsAppWidget from "@/components/WhatsAppWidget";
export default function StoreLayout({ children }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const isCheckout = pathname === '/checkout' || pathname?.startsWith('/checkout/');
  const { closeCart } = useCart();
  const { startNavigation } = useGlobalLoader();

  // 🔥 PageView يُطلق من هنا فقط (نقطة استدعاء واحدة، لا يوجد fbq('track','PageView')
  // منفصل في layout.js بعد الآن) — كل تغيير مسار حقيقي يستدعي fbTrack()
  // الموحّدة، فتُطلق Browser + Server معاً بنفس event_id تلقائياً (Dual Fire).
  useEffect(() => {
    if (!isAdmin) {
      fbTrack("PageView", {});
      ttTrack("PageView", {}); // TikTok — مستقل تمامًا عن fbTrack أعلاه
    }
  }, [pathname, isAdmin]);
  // أغلق حالة السلة بعد تأكيد الوصول إلى مسار Checkout.
  useEffect(() => {
    if (isCheckout) {
      closeCart();
    }
  }, [isCheckout, closeCart]);
  
  // بدء Global Loader فور الضغط على رابط داخلي في المتجر.
  useEffect(() => {
    if (isAdmin || isCheckout) return;

    const handleInternalNavigation = (event) => {
      // تجاهل النقرات التي تفتح تبويباً أو نافذة جديدة.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      // الوصول إلى الرابط حتى لو كان الضغط على صورة أو أيقونة داخله.
      const clickedElement = event.target;

      const link =
        clickedElement instanceof Element
          ? clickedElement.closest("a[href]")
          : null;

      if (!link || link.hasAttribute("download")) return;

      const target = link.getAttribute("target");

      if (target && target.toLowerCase() !== "_self") return;

      const href = link.getAttribute("href");

      if (!href || href.startsWith("#")) return;

      let destination;

      try {
        destination = new URL(href, window.location.href);
      } catch {
        return;
      }

      // تجاهل الروابط الخارجية.
      if (destination.origin !== window.location.origin) return;

      // تجاهل التنقل داخل المسار الحالي.
      if (destination.pathname === window.location.pathname) return;

      // الإدارة والدفع مستثنيان من Global Loader.
      const isExcludedDestination =
        destination.pathname.startsWith("/admin") ||
        destination.pathname === "/checkout" ||
        destination.pathname.startsWith("/checkout/");

      if (isExcludedDestination) return;

      startNavigation();
    };

    document.addEventListener("click", handleInternalNavigation, true);

    return () => {
      document.removeEventListener("click", handleInternalNavigation, true);
    };
  }, [isAdmin, isCheckout, startNavigation]);
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