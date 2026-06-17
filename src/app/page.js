"use client";
import React from 'react';
import dynamic from 'next/dynamic';

// استدعاء المكون الأساسي بشكل ديناميكي لضمان استقرار الموقع على كلاود فلير
// الـ ssr: false هنا مهمة عشان نضمن إن الداتا تيجي من الـ Client side بدون تعارض
const HomeSectionsMain = dynamic(() => import("@/components/HomeSectionsMain"), { 
  ssr: false,
  loading: () => <div className="bg-[#121212] min-h-screen" /> // شاشة سوداء بسيطة جداً خلف اللودر
});

export default function Home() {
  // شيلنا كل الـ hooks اللي مش مستخدمة هنا لأننا نقلناها لـ HomeSectionsMain
  // كدة الصفحة الرئيسية بقت خفيفة جداً ومهمتها بس تشغيل المحرك الأساسي
  return <HomeSectionsMain />;
}