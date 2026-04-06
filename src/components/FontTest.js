"use client";
import React from 'react';

export default function FontTest() {
  return (
    <div className="min-h-screen bg-[#121212] text-white p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold mb-8">اختبار الخطوط - Font Test</h1>
        
        {/* Cairo Font Test */}
        <div className="bg-[#1A1A1A] p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4 text-[#F5C518]">Cairo Font (Primary)</h2>
          <p className="text-lg mb-2">This uses Cairo font via Tailwind's default font-sans class</p>
          <p className="text-base">هذا النص يستخدم خط القاهرة عبر فئة font-sans الافتراضية في Tailwind</p>
        </div>

        {/* Tajawal Font Test */}
        <div className="bg-[#1A1A1A] p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4 text-[#F5C518] font-tajawal">Tajawal Font (Secondary)</h2>
          <p className="text-lg mb-2 font-tajawal">This uses Tajawal font via Tailwind's font-tajawal class</p>
          <p className="text-base font-tajawal">هذا النص يستخدم خط تجول عبر فئة font-tajawal في Tailwind</p>
        </div>

        {/* Mixed Usage */}
        <div className="bg-[#1A1A1A] p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4 text-[#F5C518]">Mixed Usage</h2>
          <p className="text-base">
            <span className="font-sans">Cairo: </span>
            <span className="font-tajawal">تجول</span>
            <span className="font-sans"> and </span>
            <span className="font-tajawal">Tajawal</span>
            <span className="font-sans"> fonts working together</span>
          </p>
        </div>

        {/* CSS Variable Test */}
        <div className="bg-[#1A1A1A] p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4 text-[#F5C518]">CSS Variables Test</h2>
          <p className="text-base" style={{ fontFamily: 'var(--font-cairo)' }}>
            Cairo via CSS variable: هذا النص يستخدم متغير CSS
          </p>
          <p className="text-base mt-2" style={{ fontFamily: 'var(--font-tajawal)' }}>
            Tajawal via CSS variable: هذا النص يستخدم متغير CSS
          </p>
        </div>
      </div>
    </div>
  );
}
