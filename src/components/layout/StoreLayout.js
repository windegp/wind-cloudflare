"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import ScrollToTop from "./ScrollToTop";

export default function StoreLayout({ children }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  return (
    <>
      {/* لو مش في الأدمن، اعرض الهيدر وسلة المشتريات */}
      {!isAdmin && <Navbar />}
      {!isAdmin && <CartDrawer />}

      {/* المحتوى الأساسي للصفحة (سواء أدمن أو متجر) */}
      <main className="min-h-screen">
        {children}
      </main>

      {/* لو مش في الأدمن، اعرض الفوتر وزر الصعود */}
      {!isAdmin && <Footer />}
      {!isAdmin && <ScrollToTop />}
    </>
  );
}