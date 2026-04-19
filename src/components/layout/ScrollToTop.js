"use client";
import React, { useState, useEffect } from 'react';

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  // مراقبة حركة السكرول لإظهار الزر بعد النزول 400 بيكسل
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 400) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="العودة للأعلى"
      // التصميم: دائري داكن، يظهر في الأسفل يساراً، ويتحول للذهبي عند التفاعل
      className="fixed bottom-6 left-6 z-50 p-3 rounded-full bg-[#1A1A1A] border border-[#333] text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all duration-300 hover:bg-[#F5C518] hover:text-black hover:border-[#F5C518] hover:scale-110 animate-fade-in"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-6 w-6" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor" 
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </button>
  );
}