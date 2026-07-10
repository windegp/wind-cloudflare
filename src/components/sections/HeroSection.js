"use client";
import React, { useState, useEffect, useRef } from 'react';

// ==========================================================================
// مكون الهيرو الرئيسي (The Masterpiece Hero) - تطابق تام مع المرجع 100%
// تصميم Editorial المينيماليست (أبيض وأسود فقط)
// ==========================================================================
export default function HeroSection({ data }) {
  const [current, setCurrent] = useState(0);
  const scrollContainerRef = useRef(null);

  const slides = data?.slides || [];
  const categories = data?.categories || [];

  // مؤقت تقليب الصور (مضبوط على 6 ثواني ليتمكن العميل من قراءة النقاط)
  useEffect(() => {
    if (slides.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  if (slides.length === 0) {
    return <div className="w-full h-[60vh] bg-white"></div>;
  }

  return (
    <div className="relative w-full bg-white text-black font-sans overflow-x-hidden" dir="rtl">
      
      {/* تعريف الأنيميشن الاحترافي (Fade Up) والنقاط (Lines) في الـ Style jsx */}
      <style jsx global>{`
        /* أنيميشن ناعم لظهور النصوص */
        @keyframes minimalistFadeUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .fade-up-element {
          animation: minimalistFadeUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        /* تنسيق الخطوط (النقاط سابقاً) */
        .hero-line-pagination {
          display: flex;
          gap: 8px;
          justify-content: flex-start;
          width: 100%;
          padding-right: 2px; /* محاذاة مع النص */
          margin-bottom: 32px; /* مسافة تحت النقاط */
        }
        
        .hero-line {
          height: 2px;
          background-color: #EAEAEA; /* لون الخط غير النشط */
          transition: all 0.6s ease;
          border-radius: 2px;
        }
        
        .hero-line.active {
          background-color: #1A1A1A; /* لون الخط النشط - أسود */
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ----------------------------------------------------------------- */}
      {/* 1. قسم الصورة المؤطرة (Contained & Framed Image) - أعلى الصفحة */}
      {/* المساحات البيضاء حول الصورة مضبوطة لتعطي إحساس المرجع الإنجليزي */}
      <div className="relative w-full bg-white px-4 pt-4 md:px-6 md:pt-6 z-20">
        
        {/* حاوية الصورة بحواف دائرية واضحة aspect-[21/9] للديسكتوب و [4/5] للموبايل */}
        <div className="relative w-full aspect-4-5 md:aspect-21-9 overflow-hidden rounded-2xl shadow-sm bg-[#F0EEE6]">
          {slides.map((slide, index) => (
            <img 
              key={index}
              src={slide.image} 
              alt={slide.title}
              // أنيميشن ناعم جداً عند انتقال الصور (Cross-fade)
              className={`absolute inset-0 w-full h-full object-cover origin-center transition-opacity duration-1500 ease-in-out ${index === current ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-102'}`} 
            />
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. الـ 4 عناصر أسفل الصورة (مساحة بيضاء نظيفة بالكامل) */}
      {/* المحاذاة لليمين، الهوامش مضبوطة بالمللي لتطابق المرجع */}
      <div className="relative w-full bg-white px-6 pt-10 md:px-12 md:pt-16 pb-16 z-10 text-right">
        
        {/* أ. النقاط (الخطوط) الديناميكية - تقع تحت الصورة مباشرة وقبل النص */}
        {/* عدد الخطوط يزيد تلقائياً حسب عدد الـ slides المضافة في الأدمن */}
        <div className="hero-line-pagination mb-10">
          {slides.map((_, i) => (
            <div 
              key={i} 
              // الخط النشط عريض، وغير النشط كنز
              className={`hero-line ${i === current ? 'active w-12' : 'w-5'}`}
            />
          ))}
        </div>

        {/* ب. بلوك النصوص والزر - حجز مساحة ثابتة min-h لمنع تداخل العناصر */}
        <div className="relative min-h-[320px] md:min-h-[260px]">
          {slides.map((slide, index) => (
            <div 
              key={`text-${index}`}
              // ظهور العناصر بتأثير fade-up-element
              className={`absolute top-0 right-0 w-full flex flex-col items-start text-right ${index === current ? 'opacity-100 z-10 pointer-events-auto fade-up-element' : 'opacity-0 z-0 pointer-events-none'}`}
            >
              
              {/* ب-1. العنوان الصغير (Tag) - أسود فقط، Bold */}
              <span className="text-[#1A1A1A] text-xs md:text-sm font-bold tracking-widest uppercase mb-3 block font-tajawal">
                {slide.tag || "WIND EXCLUSIVE"}
              </span>
              
              {/* ب-2. النص الرئيسي العريض جداً وضخم (استخدام Cairo ExtraBold) */}
              {/* حجم خط ضخم ومسافة بادئة ضيقة leading-[1.1] تطابق المرجع */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-[#1A1A1A] mb-8 leading-[1.1] tracking-tighter" style={{fontFamily: "'Cairo', sans-serif"}}>
                {slide.title}
              </h1>
              
              {/* ب-3. الـ 3 نقاط المتغيرة حسب كل صورة مع الدوائر الصغيرة */}
              <div className="flex flex-col gap-3.5 mb-12 pr-1">
                {[slide.feature1, slide.feature2, slide.feature3].filter(Boolean).map((feature, fIdx) => (
                  <div key={fIdx} className="flex items-center gap-3.5">
                    {/* الدائرة السوداء الصغيرة - مينيماليست تماماً */}
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] shrink-0"></span>
                    {/* نص النقطة - أسود وبولد */}
                    <span className="text-[15px] font-bold text-[#1A1A1A] font-tajawal">{feature}</span>
                  </div>
                ))}
              </div>

              {/* ب-4. زر الرابط الأسود السوليد (Zara style) - بدون حواف دائرية */}
              <a 
                href={slide.productLink} 
                className="inline-flex justify-center items-center bg-[#1A1A1A] text-white px-12 py-4 font-bold text-[13px] tracking-wide hover:bg-[#333] transition-colors duration-300 w-fit rounded-none shadow-md"
                style={{fontFamily: "'Tajawal', sans-serif"}}
              >
                {slide.buttonText || "تسوق الإطلالة"}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. قسم تصفح الأقسام (تم تحديثه للون الأبيض والأسود فقط) */}
      <div className="w-full bg-white pt-6 pb-12 relative z-10 px-4 md:px-8 border-t border-[#EAEAEA]">
        
        {/* عنوان القسم محاذي تماماً ليمين الصورة */}
        <div className="flex items-center gap-2.5 mb-5 pt-2">
          <h2 className="text-[#1A1A1A] text-xl md:text-2xl font-black tracking-tight" style={{fontFamily: "'Cairo', sans-serif"}}>
            تصفح الأقسام
          </h2>
          <span className="text-black text-2xl mb-1 font-bold">›</span>
        </div>
        
        {/* حاوية سحب الأقسام مع الخطوط السوداء الرفيعة */}
        <div className="relative w-full border-t border-[#EAEAEA] py-5 flex items-center">
          
          {/* شريط السحب */}
          <div 
            ref={scrollContainerRef}
            className="flex gap-3 overflow-x-auto hide-scrollbar w-full items-center"
          >
            {categories.map((category, idx) => (
              <a 
                key={idx} 
                href={category.link} 
                // أبيض وأسود فقط، حواف دائرية كاملة (Pill shape)
                className="whitespace-nowrap flex items-center gap-1.5 bg-white border border-[#EAEAEA] text-[#1A1A1A] px-6 py-3 rounded-full text-sm font-bold hover:bg-[#1A1A1A] hover:text-white hover:border-[#1A1A1A] transition-all shadow-sm hover:shadow-md"
                style={{fontFamily: "'Tajawal', sans-serif"}}
              >
                {category.title}
              </a>
            ))}
            {/* مسافة فارغة في النهاية */}
            <div className="w-16 flex-shrink-0"></div>
          </div>

          {/* تأثير التدرج والسهم الأيسر (أبيض وأسود فقط) */}
          <div className="absolute top-0 left-0 h-full flex items-center z-20 pointer-events-none">
            {/* التدرج اللوني الأبيض النظيف */}
            <div className="h-full w-12 md:w-24 bg-gradient-to-r from-white to-transparent"></div>
            
            {/* الخط الطولي والسهم في أقصى اليسار */}
            <div className="h-[70%] border-r border-[#EAEAEA] flex items-center bg-white pl-2 md:pl-4 pr-3 md:pr-5">
              <button 
                  onClick={scrollLeft}
                  className="pointer-events-auto flex items-center justify-center w-11 h-11 text-[#1A1A1A] hover:text-white hover:bg-[#1A1A1A] bg-white border border-[#EAEAEA] rounded-full transition-all shadow-sm hover:shadow-md"
                  aria-label="تمرير للمزيد"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 -ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}