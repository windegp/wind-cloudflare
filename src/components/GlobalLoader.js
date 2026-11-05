"use client";

import { useGlobalLoader } from "@/context/GlobalLoaderContext";
import { usePathname } from "next/navigation";
import logo from '@/../public/logo.png';

export default function GlobalLoader() {
  const {
    isVisible,
    isReceding,
    isRouteNavigation
  } = useGlobalLoader();

  const pathname = usePathname();

  // استثناء الإدارة والدفع.
  if (
    pathname?.startsWith("/admin") ||
    pathname?.includes("checkout")
  ) {
    return null;
  }

  if (!isVisible) return null;

  // مؤشر التنقل للأقسام والمنتجات:
  // يحافظ على الصفحة الحالية ويُظهر شعار WIND.
  if (isRouteNavigation) {
    return (
      <>
        <div
          role="status"
          aria-live="polite"
          aria-label="جاري تحميل الصفحة"
          className={`fixed top-[100px] left-4 z-[120]
            pointer-events-none
            flex items-center gap-3
            rounded-full border border-[#EAEAEA]
            bg-white/95 px-3 py-2
            shadow-sm backdrop-blur-sm
            transition-all duration-300
            ${
              isReceding
                ? "opacity-0 -translate-y-1"
                : "opacity-100"
            }`}
        >
          <img
            src={logo.src}
            alt="WIND Shopping"
            className="h-7 w-auto max-w-[72px] object-contain"
          />

          <div className="relative w-16 h-[2px] bg-[#EAEAEA] overflow-hidden rounded-full">
            <div className="route-loader-progress absolute inset-y-0 left-0 w-1/2 bg-[#111111]" />
          </div>
        </div>

        <style jsx global>{`
          @keyframes route-loader-sweep {
            0% {
              transform: translateX(160%);
            }
            100% {
              transform: translateX(-220%);
            }
          }

          .route-loader-progress {
            animation: route-loader-sweep
              1.35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .route-loader-progress {
              animation-duration: 2.5s;
            }
          }
        `}</style>
      </>
    );
  }

  // شاشة التحميل الأصلية لبقية المسارات.
  return (
    <div
      className={`fixed inset-0 z-[9999] bg-white flex items-center justify-center ${
        isReceding ? "receding-standard" : ""
      }`}
    >
      <div className="relative flex flex-col items-center">
        <img
          src={logo.src}
          alt="WIND"
          className="h-24 md:h-28 w-auto object-contain"
        />

        <div className="mt-8 w-32 h-[1px] bg-[#EAEAEA] relative overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-black animate-loading-smooth"></div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes loading-smooth {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        .animate-loading-smooth {
          animation: loading-smooth 1.5s infinite
            cubic-bezier(0.4, 0, 0.2, 1);
        }

        .receding-standard {
          animation: loader-fade-out 500ms ease-out forwards;
        }

        @keyframes loader-fade-out {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
      `}</style>
    </div>
  );
}