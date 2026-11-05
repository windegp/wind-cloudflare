
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { usePathname } from "next/navigation";

const GlobalLoaderContext = createContext();

// تجنب تحذير useLayoutEffect أثناء العرض على السيرفر.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const MAX_LOADER_TIME = 8000;
const LOADER_FADE_DURATION = 500;

export function GlobalLoaderProvider({ children }) {
  const pathname = usePathname();

  const [isVisible, setIsVisible] = useState(true);
  const [isReceding, setIsReceding] = useState(false);
  const [loaderType, setLoaderType] = useState("standard");

  // ربط الجاهزية بالمسار نفسه لمنع استخدام إشارة قديمة.
  const [readyPathname, setReadyPathname] = useState(null);
  const pageReady = Boolean(pathname && readyPathname === pathname);

  const fallbackTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  // إلغاء جميع المؤقتات السابقة عند تغيير المسار أو إزالة Provider.
  const clearLoaderTimers = useCallback(() => {
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // الحفاظ على واجهة setPageReady الحالية.
  const setPageReady = useCallback(
    (ready) => {
      setReadyPathname(ready ? pathname : null);
    },
    [pathname]
  );

  // إعداد اللودر عند كل تغيير حقيقي في المسار.
  useIsomorphicLayoutEffect(() => {
    clearLoaderTimers();

    // بدء الصفحة الجديدة من الأعلى.
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    // استثناء صفحات الإدارة والدفع من Global Loader.
    const isExcludedRoute =
    pathname?.startsWith("/admin") ||
    pathname?.includes("/checkout");

    if (isExcludedRoute) {
      setIsVisible(false);
      setIsReceding(false);
      setPageReady(true);

      return () => {
        clearLoaderTimers();
      };
    }

    // إعداد دورة تحميل جديدة.
    setIsVisible(true);
    setIsReceding(false);
    setPageReady(false);

    // تحديد نوع اللودر مع الحفاظ على السلوك السابق.
    const isKashierPayment =
      pathname?.includes("kashier") ||
      pathname?.includes("checkout");

    setLoaderType(
      isKashierPayment ? "secure-vault" : "standard"
    );

    // مهلة أمان: لا نترك اللودر ظاهرًا إلى ما لا نهاية.
    fallbackTimerRef.current = window.setTimeout(() => {
      fallbackTimerRef.current = null;

      setIsReceding(true);

      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        setIsVisible(false);
      }, LOADER_FADE_DURATION);
    }, MAX_LOADER_TIME);

    // إلغاء مؤقتات هذه الصفحة عند الانتقال إلى صفحة أخرى.
    return () => {
      clearLoaderTimers();
    };
  }, [pathname, clearLoaderTimers, setPageReady]);

  // إخفاء اللودر بمجرد إعلان الصفحة الحالية عن جاهزيتها.
  useEffect(() => {
    if (!pageReady || !isVisible || isReceding) {
      return;
    }

    // لم نعد بحاجة إلى مهلة الأمان بعد جاهزية الصفحة.
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    // إلغاء أي مؤقت إخفاء سابق قبل إنشاء مؤقت جديد.
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    setIsReceding(true);

    // مدة الإخفاء متطابقة مع حركة CSS الحالية (500ms).
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setIsVisible(false);
    }, LOADER_FADE_DURATION);
  }, [pageReady, isVisible, isReceding]);

  // إرسال إشارة جاهزية مرتبطة بالمسار الذي أرسلها.
  const signalPageReady = useCallback(() => {
    if (pathname) {
      setReadyPathname(pathname);
    }
  }, [pathname]);

  const value = {
    isVisible,
    isReceding,
    loaderType,
    pageReady,
    setPageReady,
    signalPageReady,
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
    throw new Error(
      "useGlobalLoader must be used within GlobalLoaderProvider"
    );
  }

  return context;
}

/**
 * Custom hook for pages to signal they're ready.
 * Call signalPageReady() after the critical page content is available.
 */
export function usePageReady() {
  const { signalPageReady } = useGlobalLoader();

  return { signalPageReady };
}
