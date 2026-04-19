"use client";
import { useGlobalLoader } from "@/context/GlobalLoaderContext";
import { usePathname } from "next/navigation";
import logo from '@/../public/logo.png';

export default function GlobalLoader() {
  const { isVisible, isReceding, loaderType } = useGlobalLoader();
  const pathname = usePathname();

  // 🔥 الضربة القاضية: لو إنت في مسار الدفع أو الأدمن، متعملش ريندر لأي حاجة نهائياً!
  if (pathname?.startsWith("/admin") || pathname?.includes("checkout")) {
    return null;
  }

  if (!isVisible) return null;

  // Standard WIND Shopping Loader (سريع، أنيق، وبدون أي تأخير مُفتعل)
  return (
    <div 
      className={`fixed inset-0 z-[9999] bg-white flex items-center justify-center ${
        isReceding ? "receding-standard" : ""
      }`}
    >
      <div className="relative flex flex-col items-center">
        {/* اللوجو الخاص بـ WIND */}
        <img 
          src={logo.src} 
          alt="WIND" 
          className="h-24 md:h-28 w-auto object-contain"
        />
        
        {/* شريط تحميل ناعم وسريع باللون الأسود */}
        <div className="mt-8 w-32 h-[1px] bg-[#EAEAEA] relative overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-black animate-loading-smooth"></div>
        </div>
      </div>

      <style jsx global>{`
        /* حركة شريط التحميل */
        @keyframes loading-smooth {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        
        .animate-loading-smooth {
          animation: loading-smooth 1.5s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* خروج ناعم وسريع جداً (Fade Out) بدون أي رجة للصفحة */
        .receding-standard {
          animation: loader-fade-out 500ms ease-out forwards;
        }
        
        @keyframes loader-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; display: none; }
        }
      `}</style>
    </div>
  );
}