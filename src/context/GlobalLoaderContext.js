"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

const GlobalLoaderContext = createContext();

export function GlobalLoaderProvider({ children }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isReceding, setIsReceding] = useState(false);
  const [loaderType, setLoaderType] = useState("standard");
  const [pageReady, setPageReady] = useState(false); // Data-driven readiness signal
  const pathname = usePathname();

  // Maximum timeout: 8 seconds fail-safe
  const MAX_LOADER_TIME = 8000;

  // [تعديل جراحي] تم إزالة useEffect الخاص بـ document.readyState بالكامل
  // لأنه كان يقوم بسحب اللودر فوراً قبل انتظار بيانات Firebase (وهذا هو سبب ظهور النافبار مبكراً)
  // الاعتماد الآن سيكون 100% على signalPageReady القادم من الصفحة نفسها

  // Handle route changes: Reset state and force scroll to top
  useEffect(() => {
    // إجبار المتصفح على بدء أي صفحة من الأعلى فوراً وبدون أي تأثيرات تأخير
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    
    // 🔥 الحل الجذري للأدمن وصفحة الدفع: اقتل اللودر فوراً ليظهر المحتوى بأقصى سرعة
    if (pathname?.startsWith("/admin") || pathname?.includes("/checkout")) {
      setIsVisible(false);
      setIsReceding(false);
      setPageReady(true);
      return; // خروج مباشر
    }

    // Reset loader state for new route
    setIsVisible(true);
    setIsReceding(false);
    
    // Use a timeout to reset pageReady AFTER the component tree has time to detect the pathname change
    // This prevents the race condition where setPageReady(false) overwrites signalPageReady() calls
    const resetReadyTimer = setTimeout(() => {
      setPageReady(false);
    }, 0);

    // Detect if navigating to Kashier Payment Gateway
    const isKashierPayment = pathname?.includes("kashier") || pathname?.includes("checkout");
    setLoaderType(isKashierPayment ? "secure-vault" : "standard");

    // Fail-safe timeout: Force recede after 8 seconds regardless of pageReady
    const timeoutTimer = setTimeout(() => {
      setIsReceding(true);
      setTimeout(() => setIsVisible(false), 900);
    }, MAX_LOADER_TIME);

    return () => {
      clearTimeout(resetReadyTimer);
      clearTimeout(timeoutTimer);
    };
  }, [pathname]);

  // تم إلغاء حساسات السكرول والروابط للعودة للسرعة القصوى والأداء الصاروخي

  // Handle page readiness: Trigger recede immediately when page is ready
  useEffect(() => {
    if (pageReady && isVisible && !isReceding) {
      // Page is ready - start receding IMMEDIATELY (no artificial delays)
      setIsReceding(true);
      setTimeout(() => setIsVisible(false), 900); // Receding animation duration
    }
  }, [pageReady, isVisible, isReceding]);

  // Expose setPageReady for pages to signal data readiness
  const signalPageReady = useCallback(() => {
    setPageReady(true);
  }, []);

  const value = {
    isVisible,
    isReceding,
    loaderType,
    pageReady,
    setPageReady,
    signalPageReady, // Public API for pages to use
  };

  return (
    <GlobalLoaderContext.Provider value={value}>
      {children}
    </GlobalLoaderContext.Provider>
  );
}

export function useGlobalLoader() {
  const context = useContext(GlobalLoaderContext);
  if (!context) {
    throw new Error("useGlobalLoader must be used within GlobalLoaderProvider");
  }
  return context;
}

/**
 * Custom hook for pages to signal they're ready to be displayed.
 * Call this after critical data and initial images are loaded.
 * * @example
 * const { signalPageReady } = usePageReady();
 * * useEffect(() => {
 * if (products.length > 0 && imagesLoaded) {
 * signalPageReady(); // Tell GlobalLoader to start receding
 * }
 * }, [products, imagesLoaded]);
 */
export function usePageReady() {
  const { signalPageReady } = useGlobalLoader();
  return { signalPageReady };
}