"use client";
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { usePageReady } from "@/context/GlobalLoaderContext";
import logo from '@/../public/logo.png';

const HomeSectionsMain = dynamic(() => import("@/components/HomeSectionsMain"), { 
  ssr: false,
  loading: () => <div className="bg-white min-h-screen" /> 
});

export default function MaintenancePage() {
  const [password, setPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showError, setShowError] = useState(false);
  const { signalPageReady } = usePageReady();

  useEffect(() => {
    signalPageReady();
  }, [signalPageReady]);

  const handleAccess = (e) => {
    e.preventDefault();
    if (password === "271117") {
      setIsAuthorized(true);
    } else {
      setShowError(true);
      setTimeout(() => setShowError(false), 2000);
    }
  };

  if (isAuthorized) {
    return <HomeSectionsMain />;
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-white flex flex-col items-center justify-center px-6 overflow-hidden" dir="rtl">
      
      <div className="max-w-lg w-full flex flex-col items-center text-center">

        {/* اللوجو */}
        <div className="mb-16 animate-fade-up">
          <Image
            src={logo}
            alt="WIND Shopping"
            height={40}
            style={{ width: 'auto', height: '40px', objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 bg-[#F4F4F4] rounded-full px-4 py-1.5 mb-9 animate-fade-up [animation-delay:100ms]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] animate-pulse-dot" />
          <span className="font-tajawal text-[11px] font-medium text-[#555] tracking-wide">
            التحديث جارٍ الآن
          </span>
        </div>

        {/* العنوان الرئيسي - سطر واحد */}
        <div className="overflow-hidden mb-5">
          <h1 className="font-cairo text-[32px] md:text-[42px] font-light text-[#1A1A1A] leading-tight whitespace-nowrap animate-fade-up [animation-delay:250ms]">
            جاري وضع <span className="font-semibold">اللمسات النهائية</span>
          </h1>
        </div>

        {/* الجملة الثانية */}
        <div className="overflow-hidden mb-2">
          <p className="font-tajawal text-[15px] text-[#888] leading-relaxed animate-fade-up [animation-delay:400ms]">
            الموقع في مرحلة التحديث لضمان أفضل تجربة لكم.
          </p>
        </div>

        {/* الجملة الثالثة */}
        <div className="overflow-hidden">
          <p className="font-tajawal text-[13px] font-light text-[#BBB] animate-fade-up [animation-delay:550ms]">
            شكراً لانتظاركم وثقتكم بنا.
          </p>
        </div>

        {/* فاصل */}
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-[#DDD] to-transparent my-12 animate-fade-up [animation-delay:650ms]" />

        {/* منطقة المطورين */}
        <div className="w-full max-w-[260px] animate-fade-up [animation-delay:800ms]">
          <p className="font-tajawal text-[9px] text-[#CCC] tracking-[0.25em] uppercase text-center mb-4">
            منطقة وصول المطورين
          </p>
          <form onSubmit={handleAccess} className="space-y-5">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full bg-transparent border-b ${
                showError ? 'border-red-400 text-red-500' : 'border-[#E5E5E5] text-[#1A1A1A] focus:border-[#1A1A1A]'
              } py-2.5 text-center font-cairo text-[14px] font-light outline-none transition-all duration-500 placeholder:text-[#CCC] placeholder:font-light`}
              placeholder="أدخل الرمز"
            />
            <button
              type="submit"
              className="w-full bg-[#1A1A1A] hover:bg-[#333] text-white font-tajawal text-[11px] font-medium tracking-[0.3em] uppercase py-3.5 transition-all duration-300"
            >
              دخول
            </button>
          </form>
        </div>
      </div>

      {/* التذييل */}
      <div className="absolute bottom-6 animate-fade-up [animation-delay:1000ms]">
        <p className="font-tajawal text-[10px] text-[#CCC] tracking-[0.2em] uppercase">
          © 2026 WIND SHOPPING
        </p>
      </div>

      <style jsx global>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fade-up 1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          opacity: 0;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }
        .animate-pulse-dot {
          animation: pulse-dot 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}