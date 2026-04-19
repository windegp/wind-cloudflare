"use client";
import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import QuickViewModal from "@/components/QuickViewModal";
import { Star, ChevronRight, ChevronLeft, Eye, Plus } from '@/components/icons-extra';
import ProductCard from '../products/ProductCard';

// الهوكات المجمعة اللي عملناها مع بعض للـ SWR
// تم إزالة الاستدعاءات الداخلية - البيانات تمرر عبر props الآن
// ==========================================================================
// WIND SHOPPING — Homepage Sections v5
// ✅ نظام ألوان موحد: أبيض #FFFFFF ↔ كريمي #FAF8F3 بالتبادل
// ✅ SectionHeading واحد مستخدم في كل الأقسام بدون استثناء
// ✅ card-lift آمن على الموبايل (translate محدود)
// ✅ spacing system موحد: py-16 لكل قسم
// ✅ كل البيانات الديناميكية والمنطق محفوظان 100%
// ✅ هوية WIND: Cairo + Tajawal | ذهبي #F5C518 | أسود #1A1A1A | كريمي
// ==========================================================================

// ─────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────
const GlobalStyles = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Tajawal:wght@300;400;500;700&display=swap');

    /* ── Marquee RTL ── */
    @keyframes marquee-rtl {
      0%   { transform: translateX(-50%); }
      100% { transform: translateX(0%);   }
    }
    .animate-marquee-rtl {
      display: flex;
      width: max-content;
      animation: marquee-rtl 45s linear infinite;
    }
    .pause-on-hover:hover { animation-play-state: paused; }

    /* ── Utilities ── */
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

    /* ── Typography tokens ── */
    .wind-title {
      font-family: 'Cairo', sans-serif;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .wind-body {
      font-family: 'Tajawal', sans-serif;
      font-weight: 500;
    }

    /* ── Divider ── */
    .wind-divider {
      height: 1px;
      background: linear-gradient(to left, transparent, #E2DDD5 40%, #E2DDD5 60%, transparent);
    }

    /* ── Card hover — mobile-safe ──
       على الموبايل: فقط ظل خفيف
       على الديسكتوب: رفع + ظل ذهبي
    ── */
    .card-lift {
      transition:
        transform  0.45s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1),
        border-color 0.3s ease;
    }
    @media (hover: hover) {
      .card-lift:hover {
        transform: translateY(-6px);
        box-shadow: 0 24px 48px rgba(0,0,0,0.09), 0 0 0 1.5px rgba(245,197,24,0.35);
      }
    }

    /* ── Image zoom ── */
    .img-zoom {
      transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .img-zoom:hover { transform: scale(1.06); }

    /* ── Gold underline on hover ── */
    .gold-bar {
      display: block;
      height: 2px;
      width: 0;
      border-radius: 2px;
      background: linear-gradient(to left, #F5C518, #E6AE00);
      transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    }
    *:hover > .gold-bar,
    .group:hover .gold-bar { width: 100%; }

    /* ── Arch (pill-top) shape ── */
    .arch-frame {
      border-radius: 1000px 1000px 18px 18px;
      overflow: hidden;
    }
  `}</style>
);

// ─────────────────────────────────────────────
// SECTION HEADING — موحد لكل الأقسام
// ─────────────────────────────────────────────
const SectionHeading = ({ title, subTitle, link, linkLabel = "عرض الكل", centered = false }) => (
  <div className={`mb-10 pt-16 px-4 md:px-6 ${centered ? 'text-center' : ''}`} dir="rtl">

    {/* الصف العلوي */}
    <div className={`flex items-center ${centered ? 'justify-center gap-3' : 'justify-between'}`}>
      <div className={`flex items-center gap-3 ${centered ? 'flex-col-reverse' : ''}`}>
        {!centered && (
          <div className="w-[4px] h-[26px] rounded-full shrink-0" style={{ background: 'linear-gradient(180deg,#F5C518,#E6AE00)' }} />
        )}
        <h2 className="wind-title text-xl md:text-3xl text-[#1A1A1A] leading-none">
          {title}
        </h2>
      </div>

      {link && !centered && (
        <Link
          href={link}
          className="wind-body flex items-center gap-1.5 text-[#1A1A1A] text-xs md:text-sm font-bold
                     bg-white border border-[#E2DDD5] px-4 py-2 rounded-full
                     hover:border-[#F5C518] hover:shadow-md transition-all duration-300 shrink-0 group"
        >
          {linkLabel}
          <span className="text-base leading-none group-hover:-translate-x-1 transition-transform inline-block">›</span>
        </Link>
      )}
    </div>

    {/* الفرعي */}
    {subTitle && (
      <p className={`wind-body text-[#8A8070] text-xs md:text-sm mt-2.5 leading-relaxed
                     ${centered ? 'max-w-md mx-auto mt-3' : 'max-w-[80%] md:max-w-[60%]'}`}>
        {subTitle}
      </p>
    )}

    {/* خط مركزي للـ centered mode */}
    {centered && (
      <div className="flex items-center justify-center gap-3 mt-5">
        <div className="h-px w-12 bg-[#E2DDD5]" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#F5C518]" />
        <div className="h-px w-12 bg-[#E2DDD5]" />
      </div>
    )}

    {/* divider للـ side mode */}
    {!centered && <div className="wind-divider mt-6" />}
  </div>
);

// ─────────────────────────────────────────────
// PRICE BADGE — مساعد مشترك
// ─────────────────────────────────────────────
const PriceBadge = ({ price, compareAtPrice, size = "md" }) => (
  <div className="flex items-baseline gap-2.5 flex-wrap">
    <span className={`wind-title text-[#1A1A1A] font-black leading-none
      ${size === 'lg' ? 'text-xl md:text-2xl' : 'text-sm md:text-base'}`}>
      {price} LE
    </span>
    {compareAtPrice && (
      <span className={`wind-body text-[#B0A898] line-through
        ${size === 'lg' ? 'text-sm md:text-base' : 'text-xs'}`}>
        {compareAtPrice} LE
      </span>
    )}
  </div>
);

// ─────────────────────────────────────────────
// AVAILABLE PILL
// ─────────────────────────────────────────────
const AvailablePill = () => (
  <span className="wind-body text-[11px] px-2.5 py-1 rounded-full font-semibold"
    style={{ background: 'rgba(245,197,24,0.1)', color: '#9A7800', border: '1px solid rgba(245,197,24,0.25)' }}>
    متوفر الآن
  </span>
);

// ==========================================================================
// الهيرو المينيماليست المتمركز (Editorial Centered Hero) - خالي من الأخطاء 100%
// نقاط مرتبطة بالزر ارتباط مباشر (CSS Grid)، مساحات مرنة، وأنيميشن نصوص مستقل.
// ==========================================================================
export const EditorialCenteredHero = ({ data }) => {
  const [current, setCurrent] = useState(0);
  const slides = data?.slides || [];
  
  // 💡 حالة جديدة لضمان عمل الأنيميشن عند أول تحميل للصفحة
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // تفعيل الأنيميشن فوراً بعد تحميل المكون
    setIsMounted(true);

    if (slides.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
    }, 6000); 
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return <div className="w-full h-[60vh] bg-white"></div>;

  return (
    <div className="relative w-full bg-white text-black pb-14" dir="rtl">
      
      {/* 1. الصورة الرئيسية */}
      <div className="relative w-full aspect-[4/5] md:aspect-[21/9] bg-[#EAEAEA] overflow-hidden rounded-none">
        {slides.map((slide, index) => (
          <img 
            key={index}
            src={slide.image} 
            alt={slide.title}
            // 💡 ربطنا الصورة بـ isMounted عشان تعمل تأثيرها أول ما الصفحة تفتح
            className={`absolute inset-0 w-full h-full object-cover origin-center rounded-none transition-all duration-[1500ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${(isMounted && index === current) ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 z-0'}`} 
            style={{ willChange: 'opacity, transform' }}
          />
        ))}
      </div>

      {/* 2. قسم المحتوى والنقاط */}
      <div className="relative w-full bg-white px-6 pt-10 flex flex-col items-center">
        
        <div className="w-full max-w-4xl grid" style={{ gridTemplateColumns: '1fr' }}>
          
          {slides.map((slide, index) => {
            // 💡 شرط مركب: العنصر نشط + الصفحة حملت
            const isActive = isMounted && index === current;

            return (
              <div 
                key={`text-${index}`}
                className={`flex flex-col items-center justify-start ${isActive ? 'z-10 pointer-events-auto' : 'z-0 pointer-events-none'}`}
                style={{ gridArea: '1 / 1' }}
              >
                
                {/* أ. العنوان الصغير */}
                <span 
                  // 💡 زيادة المسافة إلى translate-y-12 (48px) لظهور أوضح
                  className={`font-tajawal text-[#1A1A1A] text-[14px] md:text-[16px] font-bold tracking-widest uppercase mb-3 transition-all ease-[cubic-bezier(0.22,1,0.36,1)] ${isActive ? 'translate-y-0 opacity-100 duration-[800ms] delay-[150ms]' : 'translate-y-12 opacity-0 duration-[300ms] delay-0'}`}
                  style={{ willChange: 'opacity, transform' }}
                >
                  {slide.tag || "WIND EXCLUSIVE"}
                </span>
                
                {/* ب. النص الرئيسي */}
                <h1 
                  // 💡 زيادة المسافة إلى translate-y-12
                  className={`text-[32px] md:text-[42px] lg:text-[48px] font-medium text-[#1A1A1A] leading-[1.2] tracking-normal text-center px-4 mb-8 md:mb-9 transition-all ease-[cubic-bezier(0.22,1,0.36,1)] ${isActive ? 'translate-y-0 opacity-100 duration-[800ms] delay-[300ms]' : 'translate-y-12 opacity-0 duration-[300ms] delay-0'}`}
                  style={{ fontFamily: "'Cairo', sans-serif", willChange: 'opacity, transform' }}
                >
                  {slide.title}
                </h1>
                
                {/* ج. الزر */}
                <a 
                  href={slide.productLink} 
                  // 💡 زيادة المسافة إلى translate-y-12
                  className={`font-tajawal inline-flex justify-center items-center bg-white text-[#1A1A1A] border border-[#1A1A1A] rounded-[3px] px-9 py-3.5 font-bold text-[13px] md:text-[14px] tracking-widest uppercase hover:bg-[#1A1A1A] hover:text-white transition-all ease-[cubic-bezier(0.22,1,0.36,1)] shadow-sm ${isActive ? 'translate-y-0 opacity-100 duration-[800ms] delay-[450ms]' : 'translate-y-12 opacity-0 duration-[300ms] delay-0'}`}
                  style={{ willChange: 'opacity, transform' }}
                >
                  {slide.buttonText || "تسوق الإطلالة"}
                </a>

                {/* د. النقاط */}
                <div 
                  className={`flex justify-center items-center gap-3.5 mt-12 md:mt-14 ${isActive ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                  style={{ transition: 'none' }}
                >
                  {slides.map((_, i) => {
                    const isDotActive = i === index;
                    return (
                      <div 
                        key={i} 
                        // 💡 النقطة النشطة كبيرة (w-4 h-4)، وغير النشطة صغيرة جداً وأنعم (w-2 h-2 opacity-60)
                        className={`rounded-full transition-all duration-300 ${isDotActive ? 'w-4 h-4 bg-white border-[1.5px] border-[#1A1A1A]' : 'w-2 h-2 bg-[#1A1A1A] opacity-60'}`}
                      />
                    );
                  })}
                </div>

              </div>
            );
          })}
          
        </div>
      </div>

    </div>
  );
};

// ==========================================================================
// 3. FEATURED TODAY — خلفية بيضاء #FFFFFF
// ==========================================================================
export const FeaturedToday = ({ data }) => {
  const scrollRef    = useRef(null);
  const [showLeft,  setShowLeft]  = useState(true);
  const [showRight, setShowRight] = useState(false);
  const [expandedDeck, setExpandedDeck] = useState(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const s = Math.abs(scrollLeft);
    setShowRight(s > 5);
    setShowLeft(s < scrollWidth - clientWidth - 5);
  };

  const scroll = (dir) =>
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -400 : 400, behavior: 'smooth' });

  const toggleDeck = (i, e) => {
    e.preventDefault(); e.stopPropagation();
    setExpandedDeck(expandedDeck === i ? null : i);
  };

  useEffect(() => { handleScroll(); }, [data]);
  if (!data?.cards) return null;

  return (
    <section className="bg-white border-t border-[#EEEBE5]">
      <GlobalStyles />
      <div className="max-w-[1400px] mx-auto relative" dir="rtl">

        <SectionHeading title={data.title || "Featured Today"} subTitle={data.subTitle} />

        <div className="relative group/slider px-4">
          {/* ── أسهم التنقل ── */}
          {[
            { d: 'right', show: showRight, pos: 'right-2', path: "M9 5l7 7-7 7" },
            { d: 'left',  show: showLeft,  pos: 'left-2',  path: "M15 19l-7-7 7-7" },
          ].map(({ d, show, pos, path }) => (
            <button
              key={d}
              onClick={() => scroll(d)}
              aria-label={d === 'right' ? 'التالي' : 'السابق'}
              className={`absolute top-1/2 -translate-y-1/2 ${pos} z-30
                         w-11 h-11 flex items-center justify-center
                         bg-white/95 backdrop-blur-sm shadow-lg
                         border border-[#EEEBE5] hover:border-[#F5C518]
                         text-[#1A1A1A] hover:text-[#E6AE00]
                         rounded-full transition-all duration-300
                         ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={path} />
              </svg>
            </button>
          ))}

          {/* ── السلايدر ── */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto gap-5 md:gap-7 scrollbar-hide snap-x py-4 pb-8"
            dir="rtl"
          >
            {data.cards.map((mainCard, mIndex) => {
              const isExpanded  = expandedDeck === mIndex;
              const hasSubCards = mainCard.subCards?.length > 0;

              return (
                <div key={mIndex} className="flex items-stretch snap-start">

                  {/* ── الكارت الرئيسي ── */}
                  <div className="relative z-50 flex flex-col gap-0">
                    <Link
                      href={mainCard.linkUrl || "#"}
                      className={`min-w-[200px] md:min-w-[260px] block card-lift
                                 ${isExpanded && hasSubCards ? 'rounded-r-2xl rounded-l-none' : 'rounded-2xl'}`}
                    >
                      <div className={`relative aspect-[3/4] overflow-hidden bg-[#FAF8F3]
                                      border border-[#EEEBE5] transition-all duration-500
                                      ${isExpanded && hasSubCards ? 'rounded-r-2xl rounded-l-none' : 'rounded-2xl'}`}>
                        <img src={mainCard.image} alt={mainCard.mainTitle}
                          className="w-full h-full object-cover img-zoom" />
                        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/65 to-transparent pointer-events-none" />

                        {/* Badge النوع */}
                        {mainCard.badgeType && mainCard.badgeType !== 'none' && (
                          <div className="absolute top-3 right-3 flex items-center gap-1.5
                                         bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full
                                         shadow-sm text-[#1A1A1A] text-[10px] md:text-xs font-bold wind-body
                                         uppercase tracking-wide z-10">
                            {mainCard.badgeType === 'list' ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                مجموعة
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                ألبوم
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* ── Info row ── */}
                    <div className="px-1 mt-3.5 flex justify-between items-start gap-2">
                      <div>
                        <h3 className="wind-title text-[#1A1A1A] text-sm md:text-base line-clamp-2 leading-snug">
                          {mainCard.mainTitle}
                        </h3>
                        <span className="wind-body text-[#8A8070] text-[11px] md:text-xs mt-1 block">
                          {mainCard.linkText}
                        </span>
                        <span className="gold-bar mt-2" />
                      </div>
                      {hasSubCards && !isExpanded && (
                        <button
                          onClick={(e) => toggleDeck(mIndex, e)}
                          aria-label="فتح المزيد"
                          className="mt-0.5 w-8 h-8 flex items-center justify-center
                                     bg-white border border-[#EEEBE5] rounded-full shadow-sm
                                     hover:border-[#F5C518] hover:bg-[#FFFBF0] transition-all shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#1A1A1A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── الكروت الفرعية ── */}
                  {hasSubCards && mainCard.subCards.map((subCard, sIndex) => {
                    const isLast = sIndex === mainCard.subCards.length - 1;
                    return (
                      <Link
                        key={`${mIndex}-${sIndex}`}
                        href={subCard.linkUrl || "#"}
                        className={`min-w-[200px] md:min-w-[260px] flex flex-col gap-0 cursor-pointer
                                   transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] origin-right
                                   ${isExpanded ? 'mr-0 opacity-100 scale-100' : '-mr-[200px] md:-mr-[260px] opacity-0 scale-95 pointer-events-none'}`}
                        style={{ zIndex: 40 - sIndex }}
                      >
                        <div className={`relative aspect-[3/4] overflow-hidden bg-[#FAF8F3]
                                       border border-[#EEEBE5] border-r-0
                                       shadow-[-8px_0_24px_rgba(0,0,0,0.07)]
                                       ${isLast ? 'rounded-l-2xl' : 'rounded-none'}`}>
                          <img src={subCard.image} alt={subCard.mainTitle}
                            className="w-full h-full object-cover img-zoom" />
                          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/65 to-transparent pointer-events-none" />
                        </div>

                        <div className={`px-1 mt-3.5 flex justify-between items-start gap-2
                                        transition-opacity duration-500 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                          <div>
                            <h3 className="wind-title text-[#1A1A1A] text-sm md:text-base line-clamp-2 leading-snug">
                              {subCard.mainTitle}
                            </h3>
                            <span className="wind-body text-[#8A8070] text-[11px] md:text-xs mt-1 block">
                              {subCard.linkText}
                            </span>
                            <span className="gold-bar mt-2" />
                          </div>
                          {isExpanded && isLast && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDeck(mIndex, e); }}
                              aria-label="إغلاق"
                              className="mt-0.5 w-8 h-8 flex items-center justify-center
                                         bg-white border border-[#EEEBE5] rounded-full shadow-sm
                                         hover:border-[#F5C518] hover:bg-[#FFFBF0] transition-all shrink-0"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#1A1A1A] rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </Link>
                    );
                  })}

                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

// ==========================================================================
// 4. TOP TEN PRODUCTS — خلفية كريمية #FAF8F3
// ==========================================================================
export const TopTenProducts = ({ data }) => {
  if (!data?.cards?.length) return null;

  return (
    <section className="bg-[#FAF8F3] border-t border-[#EEEBE5]">
      <div className="max-w-[960px] mx-auto" dir="rtl">

        <SectionHeading
          title={data.title || "أفضل 10 منتجات"}
          subTitle={data.subTitle}
          link={data.linkUrl?.trim() || data.viewAllLink?.trim() || null}
        />

        <div className="flex flex-col gap-4 px-4 md:px-6 pb-16">
          {data.cards.slice(0, 10).map((card, index) => (
            <div
              key={index}
              className="flex bg-white border border-[#EEEBE5] rounded-2xl overflow-hidden
                         card-lift group"
            >
              {/* ── الصورة ── */}
              <div className="relative w-[120px] md:w-[150px] shrink-0 bg-[#FAF8F3] overflow-hidden">
                <img
                  src={card.image}
                  alt={card.mainTitle}
                  className="w-full h-full object-cover aspect-[2/3] img-zoom"
                />
                {/* Bookmark */}
                <div
                  className="absolute top-0 right-0 w-9 flex items-start justify-center pt-2"
                  style={{
                    height: 52,
                    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
                    background: 'linear-gradient(180deg,#1A1A1A 0%,#2E2E2E 100%)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
                  }}
                >
                  <Plus size={18} className="text-[#F5C518]" />
                </div>
              </div>

              {/* ── التفاصيل ── */}
              <div className="flex-1 p-4 md:p-5 flex flex-col justify-between min-h-[150px]">
                {/* Rank badge */}
                <div className="mb-2.5 w-fit">
                  <div
                    className="px-3 pt-1.5 pb-3"
                    style={{
                      background: '#1A1A1A',
                      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  >
                    <span className="wind-title text-[#F5C518] text-xs md:text-sm leading-none block">
                      #{index + 1}
                    </span>
                  </div>
                </div>

                <h3 className="wind-title text-[#1A1A1A] font-bold text-sm md:text-lg
                               line-clamp-2 leading-snug mb-2
                               group-hover:text-[#1A1A1A] transition-colors">
                  {card.mainTitle}
                </h3>
                <span className="gold-bar mb-3" />

                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <PriceBadge price={card.price || "—"} compareAtPrice={card.compareAtPrice} />
                  {card.category && (
                    <span className="wind-body text-[#8A8070] bg-[#FAF8F3] border border-[#EEEBE5]
                                     text-[10px] md:text-xs px-2.5 py-1 rounded-full">
                      {card.category}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3 mt-auto">
                  {/* التقييم */}
                  <div className="flex items-center gap-2 bg-[#FAF8F3] border border-[#EEEBE5] px-3 py-1.5 rounded-full">
                    <Star size={14} className="text-[#F5C518] fill-[#F5C518]" />
                    <span className="wind-title text-[#1A1A1A] text-xs font-bold">{card.rating || "5.0"}</span>
                    <span className="wind-body text-[#B0A898] text-[10px]">({card.reviewsCount || "—"})</span>
                    <div className="w-px h-3.5 bg-[#EEEBE5]" />
                    <button className="wind-body text-[#1A1A1A] hover:text-[#E6AE00] text-xs font-bold transition-colors">
                      قيّم
                    </button>
                  </div>

                  {/* زر العرض */}
                  <Link
                    href={card.linkUrl || "/"}
                    className="wind-body flex items-center gap-1.5
                               bg-[#1A1A1A] hover:bg-[#F5C518]
                               text-white hover:text-[#1A1A1A]
                               text-xs md:text-sm font-bold
                               px-4 py-2 rounded-full
                               transition-all duration-300 shadow-sm"
                  >
                    عرض التفاصيل
                    <ChevronLeft size={15} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(data.linkUrl?.trim() || data.viewAllLink?.trim()) && (
          <div className="pb-16 flex justify-center px-4">
            <Link
              href={data.linkUrl || data.viewAllLink}
              className="wind-body text-[#1A1A1A] font-bold text-sm
                         border border-[#EEEBE5] bg-white
                         px-10 py-3.5 rounded-full
                         hover:border-[#F5C518] hover:shadow-md
                         transition-all duration-300"
            >
              عرض القائمة كاملة
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

// ==========================================================================
// 5. MARQUEE PRODUCTS — خلفية بيضاء #FFFFFF
// ==========================================================================
export const MarqueeProducts = ({ data }) => {
  if (!data?.products?.length) return null;
  const dup = [...data.products, ...data.products, ...data.products];

  return (
    <section className="bg-white border-t border-[#EEEBE5]">
      <div className="max-w-[1400px] mx-auto" dir="rtl">

        <SectionHeading
          title={data.title || "تسوق التشكيلة الجديدة"}
          subTitle={data.subTitle}
          link={data.linkUrl?.trim() || data.viewAllLink?.trim() || null}
        />

        <div className="overflow-hidden pb-16" dir="ltr">
          <div
            className="flex animate-marquee-rtl pause-on-hover items-start"
            style={{ gap: '20px', animationDuration: '50s' }}
          >
            {dup.map((product, index) => (
              <Link
                key={index}
                href={product.linkUrl || "#"}
                className="w-[165px] md:w-[230px] flex-none group block"
              >
                {/* صورة */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#FAF8F3]
                               rounded-2xl border border-[#EEEBE5] mb-3.5
                               group-hover:border-[#F5C518]/50 group-hover:shadow-lg
                               transition-all duration-400">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover img-zoom"
                  />
                  {product.badge && (
                    <span className="absolute top-3 right-3 z-10
                                    bg-[#F5C518] text-[#1A1A1A]
                                    wind-body text-[9px] md:text-[10px] font-black
                                    px-2.5 py-1 rounded-sm uppercase tracking-wider shadow-sm">
                      {product.badge}
                    </span>
                  )}
                  {product.compareAtPrice && (
                    <span className="absolute top-3 left-3 z-10
                                    bg-white text-red-500 border border-red-100
                                    wind-body text-[9px] font-black px-2 py-1 rounded-sm shadow-sm">
                      تخفيض
                    </span>
                  )}
                </div>

                {/* النص */}
                <div className="text-right px-0.5" dir="rtl">
                  <h3 className="wind-title text-[#1A1A1A] text-sm md:text-base line-clamp-2
                                 group-hover:opacity-70 transition-opacity leading-snug">
                    {product.name}
                  </h3>
                  <span className="gold-bar mt-1.5" />
                  <div className="mt-2">
                    <PriceBadge price={product.price} compareAtPrice={product.compareAtPrice} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// ==========================================================================
// 6. BEST SELLERS — خلفية كريمية #FAF8F3
// ==========================================================================
export const BestSellersSection = ({ data }) => {
  if (!data?.products?.length) return null;

  const heroProduct  = data.products[0];
  const gridProducts = data.products.slice(1, 5);

  return (
    <section className="bg-[#FAF8F3] border-t border-[#EEEBE5]">
      <div className="max-w-[1400px] mx-auto" dir="rtl">

        <SectionHeading
          title={data.title || "الأكثر مبيعاً"}
          subTitle={data.subTitle}
          link={data.linkUrl?.trim() || data.viewAllLink?.trim() || null}
        />

        <div className="flex flex-col md:flex-row gap-5 md:gap-7 px-4 md:px-6 pb-16">

          {/* ── المنتج البطل ── */}
          {heroProduct && (
            <div className="md:w-5/12 w-full relative group card-lift">
              {/* Badge */}
              <div className="absolute top-4 right-4 z-20">
                <span className="wind-title bg-[#1A1A1A] text-[#F5C518]
                                 text-[10px] md:text-xs font-black px-4 py-1.5
                                 rounded-sm shadow-lg uppercase tracking-wider">
                  الأكثر طلباً #1
                </span>
              </div>

              <Link href={heroProduct.linkUrl || "#"} className="block h-full">
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-white rounded-2xl
                               border border-[#EEEBE5] shadow-sm
                               group-hover:border-[#F5C518]/40 group-hover:shadow-xl
                               transition-all duration-500">
                  <img
                    src={heroProduct.image} alt={heroProduct.name}
                    className="w-full h-full object-cover img-zoom"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
                  <div className="absolute bottom-6 right-5 left-5 text-right z-10">
                    <h3 className="wind-title text-white text-xl md:text-2xl line-clamp-2 leading-tight mb-3 drop-shadow">
                      {heroProduct.name}
                    </h3>
                    <div className="flex items-baseline gap-3">
                      <span className="wind-title text-[#F5C518] font-black text-xl md:text-2xl drop-shadow">
                        {heroProduct.price} LE
                      </span>
                      {heroProduct.compareAtPrice && (
                        <span className="wind-body text-white/60 line-through text-sm">
                          {heroProduct.compareAtPrice} LE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* ── شبكة المنتجات ── */}
          <div className="md:w-7/12 w-full grid grid-cols-2 gap-4 md:gap-5">
            {gridProducts.map((p, index) => (
              <div key={index} className="group card-lift">
                <Link href={p.linkUrl || "#"} className="block h-full">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-white rounded-2xl
                                 border border-[#EEEBE5]
                                 group-hover:border-[#F5C518]/40 group-hover:shadow-lg
                                 transition-all duration-500">
                    <img src={p.image} alt={p.name}
                      className="w-full h-full object-cover img-zoom" />

                    {/* Info overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-white/97 backdrop-blur-sm
                                   p-3.5 md:p-4 border-t border-[#EEEBE5]
                                   group-hover:bg-[#FAF8F3] transition-colors duration-300">
                      <h3 className="wind-title text-[#1A1A1A] text-sm md:text-base line-clamp-2 leading-snug mb-2
                                     group-hover:opacity-70 transition-opacity">
                        {p.name}
                      </h3>
                      <PriceBadge price={p.price} compareAtPrice={p.compareAtPrice} />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
};

// ==========================================================================
// 7. EXCLUSIVE OFFERS — خلفية بيضاء #FFFFFF
// ==========================================================================
export const ExclusiveOffers = ({ data }) => {
  if (!data?.products?.length) return null;
  const premiumProducts = data.products.slice(0, 4);

  return (
    <section className="bg-white border-t border-[#EEEBE5]">
      <div className="max-w-[1400px] mx-auto" dir="rtl">

        <SectionHeading
          title={data.title || "عروض حصرية"}
          subTitle={data.subTitle}
          link={data.linkUrl?.trim() || data.viewAllLink?.trim() || null}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 px-4 md:px-6 pb-16">
          {premiumProducts.map((p, index) => (
            <Link
              key={index}
              href={p.linkUrl || "#"}
              className="group relative block aspect-[4/5] overflow-hidden bg-[#FAF8F3] rounded-2xl
                        border border-[#EEEBE5]
                        card-lift"
            >
              <img
                src={p.image} alt={p.name}
                className="w-full h-full object-cover img-zoom"
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t
                             from-black/90 via-black/15 to-transparent
                             opacity-60 group-hover:opacity-85 transition-opacity duration-500" />

              {/* تخفيض badge */}
              {p.compareAtPrice && (
                <div className="absolute top-4 left-4 z-20
                               bg-white text-[#1A1A1A] wind-body text-[10px] md:text-xs font-black
                               px-3.5 py-1.5 rounded-full shadow-md uppercase tracking-wide">
                  عرض خاص
                </div>
              )}

              {/* النص في الأسفل */}
              <div className="absolute bottom-0 inset-x-0 p-5 text-right z-20
                             translate-y-2 group-hover:translate-y-0 transition-transform duration-400">
                <h3 className="wind-title text-white text-base md:text-lg leading-snug line-clamp-2 mb-2.5 drop-shadow">
                  {p.name}
                </h3>
                <PriceBadge price={p.price} compareAtPrice={p.compareAtPrice} size="lg" />

                {/* خط ذهبي */}
                <div className="h-px w-0 bg-gradient-to-l from-[#F5C518] to-transparent
                               group-hover:w-full transition-all duration-500 ease-out my-3.5" />

                <span className="wind-body flex items-center justify-end gap-1.5
                               text-[#F5C518] text-xs font-bold tracking-wider
                               opacity-0 group-hover:opacity-100 transition-opacity duration-400 delay-75">
                  تسوق الآن
                  <ChevronLeft size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
};

// ==========================================================================
// 8. MASTERPIECE COLLECTIONS — خلفية كريمية #FAF8F3
// ==========================================================================
export const MasterpieceCollections = ({ data }) => {
  const collections = data?.linkedCollections || [];
  if (!collections.length) return null;

  return (
    <section className="bg-[#FAF8F3] border-t border-[#EEEBE5]">
      <div className="max-w-[1400px] mx-auto" dir="rtl">

        <SectionHeading
          title={data.title || "استكشف المجموعات"}
          subTitle={data.subTitle}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7 px-4 md:px-6 pb-16">
          {collections.map((col, index) => (
            <Link
              key={index}
              href={`/collections/${col.slug || col.id}`}
              className="group relative overflow-hidden rounded-2xl
                        border border-[#EEEBE5] bg-white shadow-sm
                        hover:shadow-xl hover:border-[#F5C518]/40
                        transition-all duration-500"
              style={{ height: index === 0 ? '540px' : '470px' }}
            >
              {/* رقم الخلفية */}
              <span className="absolute top-5 left-5 z-10
                              wind-title text-[70px] md:text-[100px] font-black leading-none
                              text-white/25 select-none drop-shadow
                              group-hover:text-[#F5C518]/50 transition-colors duration-600">
                {String(index + 1).padStart(2, '0')}
              </span>

              {/* الصورة */}
              <img
                src={col.image || "/placeholder.jpg"}
                alt={col.customName || col.name}
                className="w-full h-full object-cover
                           grayscale-[10%] group-hover:grayscale-0
                           group-hover:scale-105
                           transition-all duration-800 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/25 to-transparent pointer-events-none" />

              {/* النصوص */}
              <div className="absolute bottom-7 right-6 left-6 text-right z-20">
                <h3 className="wind-title text-white text-2xl md:text-3xl font-black mb-2.5 drop-shadow
                              group-hover:-translate-y-1 transition-transform duration-400">
                  {col.customName || col.name}
                </h3>
                {/* الخط الذهبي المتحرك */}
                <div className="h-[2px] w-0 rounded-full bg-gradient-to-l from-[#F5C518] to-transparent
                               group-hover:w-full transition-all duration-600 ease-out" />
                <p className="wind-body text-white/75 text-sm mt-3 flex items-center gap-1.5
                             opacity-0 group-hover:opacity-100 group-hover:translate-x-1
                             transition-all duration-500 delay-75">
                  {col.description || "تصفح المجموعة كاملة"}
                  <span className="text-[#F5C518] text-base leading-none">›</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

// ==========================================================================
// 9. TOP RATED THIS WEEK — خلفية بيضاء #FFFFFF
// ==========================================================================
export const TopRatedWeekly = ({ data, bundle }) => {
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  // استخدام البيانات الممررة عبر props بدلًا من الاستدعاء المباشر
  const products = bundle?.topRatedWeekly || data?.products || [];

  if (products.length === 0) return null;

  return (
    <section className="bg-white border-t border-[#EEEBE5]" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <SectionHeading title={data.title || "الأعلى تقييماً هذا الأسبوع"} subTitle={data.subTitle} link={data.viewAllLink || data.linkUrl || null} />
        <div className="flex flex-col gap-4 px-4 md:px-6 pb-16">
          {products.map((p, idx) => {
            const isFirst = idx === 0;
            return (
              <div key={idx} className="flex gap-4 p-4 rounded-2xl overflow-hidden transition-all duration-300 card-lift"
                style={{
                  background:  isFirst ? 'linear-gradient(135deg,#FFFDF5 0%,#FFFAEB 100%)' : '#FFFFFF',
                  border:      isFirst ? '1.5px solid rgba(245,197,24,0.5)' : '1.5px solid #EEEBE5',
                  boxShadow:   isFirst ? '0 4px 20px rgba(245,197,24,0.10)' : '0 2px 8px rgba(0,0,0,0.04)',
                }}>
                <Link href={`/product/${p.id}`} className="relative shrink-0 rounded-xl overflow-hidden block group" style={{ width: 110, height: 160 }}>
                  <img src={p.images?.[0] || p.mainImage} alt={p.title} className="w-full h-full object-cover img-zoom" />
                  <div className="absolute top-0 right-0 w-7 flex items-start justify-center pt-1.5 z-10" style={{ height: 48, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)', background: 'linear-gradient(180deg,#1A1A1A 0%,#2E2E2E 100%)', boxShadow: '0 3px 8px rgba(0,0,0,0.25)' }}>
                    <Plus size={18} className="text-[#F5C518]" />
                  </div>
                </Link>
                <div className="flex flex-col justify-start flex-1 py-0.5 text-right">
                  <div className="w-fit mb-3"><div className="px-3 pt-1.5 pb-3" style={{ background: '#1A1A1A', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)', borderRadius: '2px 2px 0 0' }}><span className="wind-title text-[#F5C518] text-sm leading-none block">#{idx + 1}</span></div></div>
                  <Link href={`/product/${p.id}`}><h3 className="wind-title text-[#1A1A1A] text-base md:text-lg line-clamp-2 leading-snug mb-1.5 hover:opacity-70 transition-opacity">{p.title}</h3></Link>
                  <span className="gold-bar mb-3" />
                  <div className="flex items-center gap-2.5 mb-3 flex-wrap"><span className="wind-title text-[#1A1A1A] text-base md:text-lg font-black">{p.price} LE</span><span className="wind-title text-[11px] font-bold px-2 py-0.5 rounded-sm bg-black text-white">متوفر</span></div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5"><Star size={14} className="text-[#F5C518] fill-[#F5C518]" /><span className="wind-title text-[#1A1A1A] text-sm font-bold">{p.weeklyAvg}</span><span className="wind-body text-[#B0A898] text-xs">({p.weeklyCount})</span></div>
                    <button className="wind-body flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all" style={{ color: '#9A7800', background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)' }}><Star size={11} strokeWidth={2} className="text-[#F5C518]" /> قيّم</button>
                  </div>
                  <button onClick={() => setQuickViewProduct(p)} className="wind-body flex items-center gap-1.5 text-sm font-bold w-fit px-3 py-1.5 rounded-lg transition-all mt-auto text-[#1A1A1A] bg-[#FAF8F3] hover:bg-[#F5F0E8] border border-[#EEEBE5]"><Eye size={15} /> نظرة سريعة</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {quickViewProduct && <QuickViewModal product={quickViewProduct} isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
    </section>
  );
};

// ==========================================================================
// 10. MOST LIKED THIS WEEK — خلفية كريمية #FAF8F3
// ==========================================================================
export const MostLikedWeekly = ({ data, bundle }) => {
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  // استخدام البيانات الممررة عبر props بدلًا من الاستدعاء المباشر
  const products = bundle?.mostLikedWeekly || data?.products || [];

  if (products.length === 0) return null;

  return (
    <section className="bg-[#FAF8F3] border-t border-[#EEEBE5]" dir="rtl">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading title={data.title || "القطع المفضلة"} subTitle={data.subTitle} link={data.viewAllLink || data.linkUrl || null} linkLabel="اكتشف المجموعة" centered />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5 md:gap-7 px-4 md:px-6 pb-16">
          {products.map((p, idx) => (
            <div key={idx} className="group relative flex flex-col items-center text-center">
              <div className="relative aspect-[3/4] w-full arch-frame bg-[#EDEAE3] shadow-sm group-hover:shadow-xl transition-all duration-500 border border-[#E2DDD5] group-hover:border-[#F5C518]/40">
                <Link href={`/product/${p.id}`} className="block w-full h-full"><img src={p.images?.[0] || p.mainImage} alt={p.title} className="w-full h-full object-cover img-zoom" /></Link>
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickViewProduct(p); }} aria-label="نظرة سريعة" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white/92 backdrop-blur-sm text-[#1A1A1A] p-2.5 rounded-full shadow-md hover:bg-[#1A1A1A] hover:text-[#F5C518] transition-all duration-300 opacity-100 md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0"><Eye size={15} strokeWidth={2} /></button>
              </div>
              <Link href={`/product/${p.id}`} className="pt-4 flex flex-col items-center w-full px-1">
                <h3 className="wind-title text-[#1A1A1A] text-sm md:text-base line-clamp-1 group-hover:opacity-70 transition-opacity">{p.title}</h3>
                <span className="gold-bar mt-1.5 max-w-[60%]" />
                <p className="wind-body text-[#1A1A1A] text-sm mt-2 font-semibold">{p.price} ج.م</p>
              </Link>
            </div>
          ))}
        </div>
      </div>
      {quickViewProduct && <QuickViewModal product={quickViewProduct} isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
    </section>
  );
};

// ==========================================================================
// 11. TOP RATED ALL-TIME (العموم) - IMDb Style 
// ==========================================================================
export const TopRatedAllTime = ({ data, bundle }) => {
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  // استخدام البيانات الممررة عبر props بدلًا من الاستدعاء المباشر
  const products = bundle?.topRatedAllTime || data?.products || [];

  if (products.length === 0) return null;

  return (
    <section className="bg-black py-10 font-sans border-y border-gray-800" dir="rtl">
      <div className="max-w-3xl mx-auto flex flex-col gap-5 px-4">
        <div className="mb-2">
          {(data.viewAllLink || data.linkUrl) ? (
            <Link href={data.viewAllLink || data.linkUrl} className="flex items-center gap-2 group w-fit"><div className="w-[4px] h-[24px] bg-[#F5C518] rounded-full shrink-0"></div><h2 className="text-white text-xl md:text-2xl font-bold flex items-center gap-1 group-hover:text-gray-300 transition-colors">{data.title || "أساطير التقييمات"}<ChevronLeft size={22} className="text-white group-hover:text-gray-300 transition-colors mt-0.5" /></h2></Link>
          ) : (
            <div className="flex items-center gap-2 w-fit"><div className="w-[4px] h-[24px] bg-[#F5C518] rounded-full shrink-0"></div><h2 className="text-white text-xl md:text-2xl font-bold flex items-center gap-1">{data.title || "أساطير التقييمات"}</h2></div>
          )}
          {data.subTitle && <p className="text-[#A3A3A3] text-xs font-medium mt-1 pr-6">{data.subTitle}</p>}
        </div>
        <div className="flex flex-col gap-5">
          {products.map((p, idx) => {
            const isFirstCard = idx === 0;
            const cardBgStyle = isFirstCard ? "bg-gradient-to-l from-[#1A1A1A] to-[#2c230b] border border-[#F5C518]/30 shadow-[0_0_30px_rgba(245,197,24,0.15)]" : "bg-[#1A1A1A] border border-gray-800 shadow-sm";
            return (
              <div key={idx} className={`flex gap-3 md:gap-4 p-5 rounded-2xl overflow-hidden transition-all duration-300 ${cardBgStyle}`}>
                <Link href={`/product/${p.id}`} className="relative w-[110px] h-[160px] md:w-[130px] md:h-[180px] shrink-0 bg-gray-800 rounded-lg overflow-hidden block shadow-md group z-0">
                  <img src={p.images?.[0] || p.mainImage} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute top-0 right-0 w-7 h-[50px] flex items-start justify-center pt-2 z-10 transition-transform group-hover:translate-y-px" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)', background: 'linear-gradient(180deg, #1d3557 0%, #457b9d 100%)', boxShadow: '0 6px 10px rgba(0,0,0,0.6)', borderTop: '1px solid rgba(255,255,255,0.1)' }}><Plus size={22} className="text-white drop-shadow-sm" /></div>
                </Link>
                <div className="flex flex-col justify-start flex-1 py-0.5 w-full text-right">
                  <div className="w-fit mb-2"><div className="bg-[#5799EF] px-3 pt-1.5 pb-2.5 rounded-t-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)' }}><span className="text-white font-extrabold text-sm md:text-base leading-none block pt-0.5">#{idx + 1}</span></div></div>
                  <Link href={`/product/${p.id}`}><h3 className="text-white font-bold text-base md:text-xl leading-tight line-clamp-2 mb-2 hover:underline">{p.title}</h3></Link>
                  <div className="text-[#A3A3A3] text-sm md:text-base mb-3 flex items-center gap-3 font-medium"><span className="font-black text-base md:text-lg text-white">{p.price} LE</span><span className="bg-gray-900/80 px-2.5 py-1 rounded text-[11px] md:text-xs border border-gray-800">متوفر الآن</span></div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5"><Star size={16} className="text-[#F5C518] fill-[#F5C518]" /><span className="text-white text-base font-medium pt-0.5">{p.allTimeAvg}</span><span className="text-[#A3A3A3] text-xs pt-0.5">({p.allTimeCount})</span></div>
                    <button className="flex items-center gap-1.5 text-[#5799EF] hover:bg-white/5 px-2.5 py-1 rounded transition-colors text-xs font-medium"><Star size={15} strokeWidth={2} className="text-[#5799EF]" /> قيّم</button>
                  </div>
                  <button onClick={() => setQuickViewProduct(p)} className="flex items-center gap-2 text-[#5799EF] text-sm font-bold w-fit hover:bg-white/5 px-3 py-2 -ml-3 rounded-lg transition-colors mt-auto"><Eye size={18} /> نظرة سريعة</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {quickViewProduct && <QuickViewModal product={quickViewProduct} isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
    </section>
  );
};

// ==========================================================================
// 12. MOST LIKED ALL-TIME (العموم) - Premium Grid Style
// ==========================================================================
export const MostLikedAllTime = ({ data, bundle }) => {
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  // استخدام البيانات الممررة عبر props بدلًا من الاستدعاء المباشر
  const products = bundle?.mostLikedAllTime || data?.products || [];

  if (products.length === 0) return null;

  return (
    <section className="bg-[#FAF9F6] py-12 border-y border-[#EAEAEA]" dir="rtl">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="mb-10 text-center flex flex-col items-center">
          <h2 className="text-[#1A1A1A] text-2xl md:text-4xl font-black tracking-tight" style={{fontFamily:"Cairo,sans-serif"}}>{data.title || "القطع الأكثر طلباً وحباً"}</h2>
          {data.subTitle && <p className="text-gray-500 text-sm md:text-base mt-2 max-w-lg">{data.subTitle}</p>}
          <div className="w-12 h-1 bg-[#1A1A1A] mt-5 rounded-full"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 px-2 md:px-4">
          {products.map((p, idx) => (
            <div key={idx} className="group relative rounded-2xl bg-white border border-[#EAEAEA] shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col overflow-hidden">
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-red-500 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm border border-red-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                {p.likesCount}
              </div>
              <button onClick={(e) => { e.preventDefault(); setQuickViewProduct(p); }} className="absolute bottom-[95px] left-3 z-20 bg-white/90 backdrop-blur-sm text-[#1A1A1A] border border-[#EAEAEA] p-2.5 rounded-full shadow-md opacity-100 md:opacity-0 md:-translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:bg-[#1A1A1A] hover:text-white"><Eye size={18} /></button>
              <Link href={`/product/${p.id}`} className="block relative w-full aspect-[3/4] overflow-hidden bg-[#F0EEE6]"><img src={p.images?.[0] || p.mainImage} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /></Link>
              <Link href={`/product/${p.id}`} className="flex flex-col justify-between flex-1 p-4 text-right">
                <h3 className="text-[#1A1A1A] text-sm md:text-base font-bold line-clamp-2 group-hover:text-gray-500 transition-colors leading-snug" style={{fontFamily:"Cairo,sans-serif"}}>{p.title}</h3>
                <p className="text-[#1A1A1A] text-base md:text-lg font-black mt-3" style={{fontFamily:"Impact, sans-serif"}}>{p.price} <span className="text-xs font-bold text-gray-500 font-sans">ج.م</span></p>
              </Link>
            </div>
          ))}
        </div>
        {(data.viewAllLink || data.linkUrl) && (
          <div className="mt-12 flex justify-center"><Link href={data.viewAllLink || data.linkUrl} className="text-center bg-white text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white font-bold py-3.5 px-10 rounded-full transition-all duration-300 text-sm md:text-base border border-[#EAEAEA] shadow-sm" style={{fontFamily:"Cairo,sans-serif"}}>استكشف المجموعة بالكامل</Link></div>
        )}
      </div>
      {quickViewProduct && <QuickViewModal product={quickViewProduct} isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
    </section>
  );
};

// ==========================================================================
// 13. CIRCULAR COLLECTIONS (Season Collection) - 🔥 MANUAL BADGE ONLY 🔥
// ==========================================================================

export const CircularCollections = ({ data }) => {
  const collections = data?.linkedCollections || [];
  const sectionRef = useRef(null);
  const [isSectionVisible, setIsSectionVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsSectionVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  if (!collections.length) return null;

  return (
    <section ref={sectionRef} className="bg-[#FFFFFF] overflow-hidden">
      <div className="max-w-[1400px] mx-auto pb-12 pt-10" dir="rtl">

        <div className="text-center mb-10 px-4">
          <div className={`transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h2 className="text-[#1A1A1A] text-2xl md:text-[28px] font-medium tracking-wide" style={{fontFamily: "'Cairo', sans-serif"}}>
              {data.title || "Season Collection"}
            </h2>
          </div>
          <div className={`mt-3.5 transition-all duration-[600ms] delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {data.subTitle && (
              <p className="text-[#757575] text-base md:text-lg max-w-2xl mx-auto font-medium font-tajawal">
                {data.subTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex overflow-x-auto scrollbar-hide snap-x px-4 md:px-6 pb-6 pt-2 gap-4 md:gap-10">
          {collections.map((col, index) => {
            const slug = col.slug || col.id;
            
            // 💡 الاعتماد الكلي على الحقل اليدوي (badge) المكتوب من لوحة التحكم
            const displayCount = (col.badge && col.badge.trim() !== "") ? col.badge : null;

            return (
              <Link
                key={index}
                href={col.linkUrl || `/collections/${slug}`}
                className={`group flex flex-col items-center flex-none snap-center transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{
                  transitionDelay: `${index * 80}ms`,
                  willChange: 'opacity, transform',
                }}
              >
                <div className="relative w-[140px] h-[140px] md:w-[240px] md:h-[240px] rounded-full bg-[#F5F5F5] transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center overflow-hidden group-hover:scale-[1.03] shadow-sm">
                  <img
                    src={col.image || "/placeholder.jpg"}
                    alt={col.customName || col.name}
                    className="w-full h-full object-cover transition-transform duration-[1500ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                  />
                </div>
                
                <div className="mt-5 flex items-center justify-center w-full relative">
                  <div className="relative inline-block">
                    <h3 className="text-[#1A1A1A] text-base md:text-xl font-bold group-hover:text-[#666] transition-colors line-clamp-1 text-center" style={{fontFamily: "'Cairo', sans-serif"}}>
                      {col.customName || col.name}
                    </h3>
                    {displayCount && (
                      <span className="absolute top-0 -left-1 -translate-x-full -translate-y-1 text-[#1A1A1A] text-[11px] md:text-xs font-bold" style={{fontFamily: "'Cairo', sans-serif"}} dir="ltr">
                        {displayCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ==========================================================================
// 14. TABBED HIGHLIGHTS (المنتجات المبوبة)
// ==========================================================================
export const TabbedHighlights = ({ data }) => {
  const products = data?.products || data?.cards || [];
  const [activeTab, setActiveTab] = useState(0);

  // حالة لظهور القسم بالكامل عند السكرول
  const [isSectionVisible, setIsSectionVisible] = useState(false);
  // حالة مخصصة لإعادة تشغيل أنيميشن الكروت عند تغيير التاب
  const [animateCards, setAnimateCards] = useState(false);

  const tabs = data?.tabs && data.tabs.length === 3 ? data.tabs : ["Hot items", "Best sellers", "New arrivals"];

  const chunkSizes = data?.chunkSizes || [
    Math.ceil(products.length / 3), 
    Math.ceil(products.length / 3), 
    Math.ceil(products.length / 3)
  ];

  let currentIdx = 0;
  const tabProducts = [
    products.slice(currentIdx, currentIdx += chunkSizes[0]),
    products.slice(currentIdx, currentIdx += chunkSizes[1]),
    products.slice(currentIdx, currentIdx += chunkSizes[2])
  ];

  const sectionRef = useRef(null);
  const carouselRef = useRef(null);

  // 1. مراقب القسم (يشتغل مرة واحدة لما العميل يعمل سكرول ويوصل للقسم)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsSectionVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -30px 0px' }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // 2. إعادة ضبط الأنيميشن والسكرول كل ما التاب يتغير
  useEffect(() => {
    // إخفاء الكروت لحظياً
    setAnimateCards(false); 
    
    // إرجاع شريط التمرير لأول السطر
    if (carouselRef.current) {
      carouselRef.current.scrollLeft = 0;
    }

    // إظهار الكروت بعد جزء من الثانية لتشغيل الأنيميشن من جديد
    const timer = setTimeout(() => {
      setAnimateCards(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [activeTab]);

  if (!products.length) return null;

  // شرط إظهار الكروت: القسم يكون ظاهر + الأنيميشن شغال
  const showCards = isSectionVisible && animateCards;

  return (
    <section ref={sectionRef} className="bg-white overflow-hidden pt-8 pb-16" dir="rtl">
      <div className="max-w-[1400px] mx-auto">

        {/* عنوان القسم */}
        <div className={`text-center mb-10 px-4 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
          <h2 className="text-[#1A1A1A] text-2xl md:text-[28px] font-medium tracking-wide" style={{fontFamily: "'Cairo', sans-serif"}}>
            {data.title || "This Week's Highlights"}
          </h2>
        </div>

        {/* أزرار التابات */}
        <div className={`flex justify-center gap-6 md:gap-10 mb-8 px-4 transition-all duration-[600ms] delay-100 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`pb-2 text-[17px] md:text-lg relative transition-colors duration-300 font-tajawal ${
                activeTab === idx ? 'text-[#1A1A1A] font-bold' : 'text-[#888888] font-medium hover:text-[#1A1A1A]'
              }`}
            >
              {tab}
              <span className={`absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A1A1A] transition-all duration-300 ${activeTab === idx ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} />
            </button>
          ))}
        </div>

        {/* حاوية الكروت */}
        <div className={`transition-all duration-[600ms] delay-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSectionVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div
            ref={carouselRef}
            className="flex md:grid md:grid-cols-4 overflow-x-auto snap-x snap-mandatory gap-4 md:gap-8 px-4 md:px-10 lg:px-14 pb-6 hide-scrollbar"
          >
            {(tabProducts[activeTab] || []).map((p, idx) => (
              <div
                key={`${activeTab}-${idx}`}
                // 💡 سطر الأنيميشن الديناميكي بطريقة React النظيفة
                className={`highlight-card-item min-w-[75vw] sm:min-w-[40vw] md:min-w-0 snap-center transition-all duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${showCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[28px]'}`}
                // 💡 التتابع الزمني وتسريع كارت الشاشة
                style={{ 
                  transitionDelay: `${idx * 80}ms`,
                  willChange: 'opacity, transform' 
                }}
              >
                <ProductCard
                  {...p}
                  id={p.productId || p.id}
                  title={p.name || p.mainTitle || p.title}
                />
              </div>
            ))}
          </div>
        </div>

        {/* زر تصفح كل المنتجات */}
        {(data.viewAllLink || data.linkUrl) && (
          <div className={`mt-6 flex justify-center px-4 transition-all duration-[600ms] delay-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
            <Link
              href={data.viewAllLink || data.linkUrl}
              className="font-tajawal inline-flex justify-center items-center bg-white text-[#1A1A1A] border border-[#1A1A1A] rounded-[3px] px-9 py-3.5 font-bold text-[13px] md:text-[14px] tracking-widest uppercase hover:bg-[#1A1A1A] hover:text-white transition-all duration-300 shadow-sm"
            >
              تصفح كل المنتجات
            </Link>
          </div>
        )}

      </div>
      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
};

// ==========================================================================
// 15. BANNER PRODUCT GRID (قسم الغلاف والمنتجات - أسلوب المجلات)
// تم التحديث: محاذاة الكروت مع الغلاف 100%، نظام الشبكة (2x2)، تكبير الخطوط
// ==========================================================================
export const BannerProductGrid = ({ data }) => {
  const products = data?.products || data?.cards || [];
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // تأثير ظهور القسم والنص العلوي (The React Way)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // 🧹 تم إزالة الـ useEffect الثاني (الذي كان يستخدم querySelectorAll) بالكامل 
  // وتم نقل تأثيراته مباشرة إلى كود ريأكت بالأسفل لتجنب أي تعارض ولتسريع الأداء

  if (!products.length && !data.bannerImage) return null;

  return (
    // تم إزالة الخط الفاصل (border-t border-[#EEEBE5])
    <section ref={sectionRef} className="bg-white overflow-hidden pt-12 pb-16" dir="rtl">
      
      {/* 🌟 الحاوية الأم: تم توحيد الـ px هنا لضمان محاذاة الغلاف مع الكروت 100% */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-10 lg:px-14">
        
        {/* ── 1. النص العلوي الوصفي ── */}
        {data.topDescription && (
          // 🌊 تطبيق نعومة Apple: ease-[cubic-bezier(0.16,1,0.3,1)]
          <div className={`text-center mb-8 px-2 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {/* 🌟 تم تكبير الخط ليتطابق مع المرفق */}
            <p className="text-[#1A1A1A] text-[22px] md:text-[28px] leading-[1.5] max-w-4xl mx-auto font-medium font-tajawal">
              {data.topDescription}
            </p>
          </div>
        )}

        {/* ── 2. صورة الغلاف (Banner) مع المحتوى ── */}
        {data.bannerImage && (
          // 🌟 المسافة السفلية mb-4 تطابق الـ gap-4 بتاع المنتجات ليظهروا ككتلة واحدة
          // 🌊 تطبيق نعومة Apple بدلاً من ease-out
          <div className={`relative w-full overflow-hidden mb-4 md:mb-6 transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="relative w-full aspect-[3/4] md:aspect-[21/9] bg-[#F5F5F5] overflow-hidden group">
              <img 
                src={data.bannerImage} 
                alt={data.bannerTitle || "Section Banner"} 
                className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-105"
              />
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

              <div className="absolute bottom-6 md:bottom-12 right-6 md:right-12 flex flex-col items-start z-10 text-right">
                {data.bannerSubTitle && (
                  // 🌟 تم تكبير العنوان الفرعي وزيادة المسافة تحته (mb-3) ليفصل عن الرئيسي
                  <span className="text-white/90 text-[14px] md:text-[16px] font-bold tracking-widest mb-3 font-tajawal">
                    {data.bannerSubTitle}
                  </span>
                )}
                {data.bannerTitle && (
                  <h2 className="text-white text-3xl md:text-5xl font-bold mb-6 leading-tight" style={{fontFamily: "'Cairo', sans-serif"}}>
                    {data.bannerTitle}
                  </h2>
                )}
                {data.buttonText && (
                  // تم توحيد شكل الزر ليتطابق مع زر الهيرو
                  <Link 
                    href={data.buttonLink || "#"} 
                    className="font-tajawal inline-flex justify-center items-center bg-white text-[#1A1A1A] border border-[#1A1A1A] rounded-[3px] px-9 py-3.5 font-bold text-[13px] md:text-[14px] tracking-widest uppercase hover:bg-[#1A1A1A] hover:text-white transition-all duration-300 shadow-md"
                  >
                    {data.buttonText}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 3. شبكة المنتجات (نظام كارتين وتحتهم كارتين) ── */}
        <div className={`transition-all duration-700 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          {/* 🌟 تم تحويلها لـ grid ثابت لضمان نظام "2 كارت في الصف" بدون سحب أفقي */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {products.map((p, idx) => (
              <div
                key={idx}
                // 💡 تفعيل الشفافية والحركة ديناميكياً باستخدام حالة ريأكت
                className={`banner-card-item transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                style={{ 
                  // ✨ تأثير الشلال (مضاف إليه 300ms ليتناغم مع ظهور الحاوية الأم)
                  transitionDelay: `${300 + (idx % 4) * 100}ms`,
                  // 🚀 همسة كارت الشاشة لتسريع الحركة
                  willChange: 'opacity, transform' 
                }}
              >
                <ProductCard 
                  {...p} 
                  id={p.productId || p.id} 
                  title={p.name || p.mainTitle || p.title} 
                />
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};
// ==========================================================================
// 16. VISUAL BREAK SECTION (الفاصل المرئي الداكن) - نسخة محدثة ومطابقة للمرجع
// تم التحديث: تكبير المسافات الكلية، تكبير الخطوط، زيادة تنفس النصوص، وتكبير الزر
// ==========================================================================
export const VisualBreakSection = ({ data }) => {
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 } // يظهر عند دخول 15% من القسم
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data.promoTitle && !data.promoImage) return null;

  return (
    // القسم هنا له خلفية داكنة ولا يحتوي أصلاً على خطوط فاصلة
    // 🌟 ت1: زيادة ضخمة في الـ Padding العلوى لتكبير مساحة البانر الأسود الأساسي (pt-24 md:pt-36)
    <section ref={sectionRef} className="bg-[#1E1E1E] text-white overflow-hidden pt-24 md:pt-36 pb-0" dir="ltr">
      
      {/* ── حاوية النصوص بالمنتصف ── */}
      <div className="max-w-4xl mx-auto px-6 text-center flex flex-col items-center">
        
        {/* ت2: تكبير حجم العنوان الصغير (text-base md:text-lg) */}
        {/* ت4: زيادة المسافة تحته ليتنفس (mb-6 md:mb-8) */}
        {data.promoSubTitle && (
          <span 
            className={`font-bold mb-6 md:mb-8 tracking-wide transition-all duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} text-base md:text-lg font-tajawal`}
            style={{ willChange: 'opacity, transform' }}
          >
            {data.promoSubTitle}
          </span>
        )}

        {/* ت4: زيادة المسافة بين أسطر العنوان الرئيسي (leading-[1.2]) ليصبح أكثر تنفساً */}
        {/* ت4: زيادة المسافة الكبيرة تحته (mb-8 md:mb-12) */}
        {data.promoTitle && (
          <h2 
            className={`text-4xl md:text-[56px] font-bold mb-8 md:mb-12 leading-[1.2] transition-all duration-[700ms] delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} font-tajawal`}
            style={{ willChange: 'opacity, transform' }}
          >
            {data.promoTitle}
          </h2>
        )}

        {/* ت4: زيادة المسافة الضخمة قبل الزر ليعطي إحساساً بالفخامة (mb-10 md:mb-16) */}
        {data.promoDescription && (
          <p 
            className={`text-[15px] md:text-lg text-gray-300 mb-10 md:mb-16 max-w-xl leading-relaxed transition-all duration-[700ms] delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} font-tajawal`}
            style={{ willChange: 'opacity, transform' }}
          >
            {data.promoDescription}
          </p>
        )}

        {/* تم توحيد شكل الزر ليتطابق مع زر الهيرو بدقة (مع الحفاظ على أنيميشن الفاصل المرئي) */}
        {(data.buttonText && data.buttonLink) && (
          <Link 
            href={data.buttonLink} 
            className={`font-tajawal inline-flex justify-center items-center bg-white text-[#1A1A1A] border border-[#1A1A1A] rounded-[3px] px-9 py-3.5 font-bold text-[13px] md:text-[14px] tracking-widest uppercase hover:bg-[#1A1A1A] hover:text-white transition-all duration-[700ms] delay-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            style={{ willChange: 'opacity, transform' }}
          >
            {data.buttonText}
          </Link>
        )}

      </div>

      {/* ── 5. صورة الفاصل (ممتدة ومرتبطة بأسفل القسم) ── */}
      {/* ت4: زيادة المسافة العلوية قبل الصورة لتتنفس بعيداً عن الزر (mt-16 md:mt-24) */}
      {data.promoImage && (
        <div 
          className={`w-full mt-16 md:mt-24 transition-all duration-[1000ms] delay-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
          style={{ willChange: 'opacity, transform' }}
        >
          <img 
            src={data.promoImage} 
            alt={data.promoTitle || "Promo Visual"} 
            className="w-full h-auto object-cover max-h-[85vh] transition-transform duration-[2000ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03]"
          />
        </div>
      )}

    </section>
  );
};
// ==========================================================================
// 17. CUSTOMER REVIEWS (تقييمات العملاء) - 🔥 SWR + HOOKS OPTIMIZED 🔥
// ==========================================================================

export const CustomerReviewsSection = ({ data, bundle }) => {
  // استخدام البيانات الممررة عبر props بدلًا من الاستدعاء المباشر
  const reviews = bundle?.reviews || data?.reviews || [];
  const allProducts = bundle?.products || data?.products || {};

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const sectionRef = useRef(null);
  
  const [expandedReviews, setExpandedReviews] = useState({});
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [isQuickViewModalOpen, setIsQuickViewModalOpen] = useState(false);
  const [isSectionVisible, setIsSectionVisible] = useState(false);

  // 1. مراقب ظهور القسم على الشاشة
  useEffect(() => {
    if (reviews.length === 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsSectionVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    
    return () => observer.disconnect();
  }, [reviews.length]); 

  // 2. مؤقت تقليب التقييمات التلقائي
  useEffect(() => {
    if (reviews.length <= 1 || isHovered || isQuickViewModalOpen) return; 
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev === reviews.length - 1 ? 0 : prev + 1));
      setExpandedReviews({}); 
    }, 6000); 
    return () => clearInterval(timer);
  }, [reviews.length, isHovered, isQuickViewModalOpen]);

  // 3. دوال التحكم
  const nextReview = () => { setCurrentIndex((prev) => (prev === reviews.length - 1 ? 0 : prev + 1)); setExpandedReviews({}); };
  const prevReview = () => { setCurrentIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1)); setExpandedReviews({}); };
  const toggleExpand = (id) => { setExpandedReviews(prev => ({ ...prev, [id]: !prev[id] })); };

  const formatReviewerName = (name, isEnglish) => {
    if (!name) return isEnglish ? "Wind Customer" : "عميل ويند";
    const parts = name.trim().split(" ");
    if (parts.length > 1) return `${parts[0]} ${parts[1].charAt(0)}.`;
    return name;
  };

  const handleOpenQuickView = (productData) => {
    if (productData) {
      setQuickViewProduct(productData);
      setIsQuickViewModalOpen(true);
    }
  };

  if (reviews.length === 0) return null;

  return (
    <section ref={sectionRef} className="bg-[#F5F5F5] py-12 md:py-16 flex flex-col items-center justify-center" dir="rtl">
      
      <div className={`mb-6 md:mb-8 px-4 text-center transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h2 className="text-[#1A1A1A] font-bold text-[19px] md:text-[23px] uppercase tracking-[0.15em]" style={{ fontFamily: "'Cairo', sans-serif" }}>
          {data.title || "Happy Customers"}
        </h2>
      </div>

      <div className={`max-w-[1400px] w-full mx-auto px-4 flex flex-col items-center transition-all duration-[1000ms] delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        
        <div className="bg-white rounded-[2px] shadow-sm w-full max-w-2xl px-6 pt-7 pb-8 md:px-12 md:pt-9 md:pb-10 relative h-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {reviews.map((review, index) => {
            const productData = allProducts[review.productHandle] || null;
            const isEnglish = /^[a-zA-Z]/.test(review.text || "");
            const isExpanded = expandedReviews[review.id];
            const isLongText = review.text && review.text.length > 160;
            const isActive = index === currentIndex;

            return (
              <div key={review.id || index}
                className={`w-full transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isActive ? 'opacity-100 relative translate-x-0' : 'opacity-0 absolute inset-x-6 md:inset-x-12 translate-x-4 pointer-events-none'
                }`}
                style={{ 
                  display: isActive ? 'block' : 'none', 
                  textAlign: isEnglish ? 'left' : 'right', 
                  dir: isEnglish ? 'ltr' : 'rtl',
                  willChange: 'opacity, transform' 
                }}
              >
                <h3 
                  className={`text-[#1A1A1A] font-bold mb-0.5 transition-all duration-500 ease-out ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} ${isEnglish ? 'text-[14px] md:text-[17px] font-sans' : 'text-[15px] md:text-[18px] font-tajawal'}`}
                  style={{ transitionDelay: isActive ? '100ms' : '0ms' }}
                >
                  <span dir={isEnglish ? "ltr" : "rtl"} className="inline-block">
                    {formatReviewerName(review.reviewerName, isEnglish)}
                  </span>
                </h3>

                <div 
                  className={`flex gap-[1.5px] mb-4 transition-all duration-500 ease-out ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} ${isEnglish ? 'justify-start' : 'justify-start'}`}
                  style={{ transitionDelay: isActive ? '200ms' : '0ms' }}
                >
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      size={11} 
                      className={i < (review.rating || 5) ? "fill-[#FFC107] text-[#FFC107]" : "fill-gray-200 text-gray-200"} 
                    />
                  ))}
                </div>

                <div 
                  className={`min-h-[105px] md:min-h-[115px] flex flex-col justify-start mb-5 transition-all duration-500 ease-out ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                  style={{ transitionDelay: isActive ? '300ms' : '0ms' }}
                >
                  <p className={`text-[#333333] leading-[1.7] ${!isExpanded ? 'line-clamp-4' : ''} ${isEnglish ? 'text-[13px] md:text-[15px] font-sans' : 'text-[14px] md:text-[16px] font-tajawal'}`}>
                    "{review.text}"
                  </p>
                  
                  {isLongText && (
                    <button 
                      onClick={() => toggleExpand(review.id)}
                      className={`text-[#999999] hover:text-[#1A1A1A] text-[11px] md:text-[12px] font-bold mt-1.5 underline underline-offset-4 transition-colors w-max ${isEnglish ? 'self-start' : 'self-start'}`}
                    >
                      {isExpanded ? (isEnglish ? "Show less" : "عرض أقل") : (isEnglish ? "Read more" : "اقرأ المزيد")}
                    </button>
                  )}
                </div>

                <div className="w-[98%] mx-auto h-[1px] bg-[#EEEEEE] mb-5"></div>

                <div 
                  className={`flex items-center gap-4 px-1 transition-all duration-500 ease-out ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} ${isEnglish ? 'flex-row' : 'flex-row'}`}
                  style={{ transitionDelay: isActive ? '400ms' : '0ms' }}
                >
                  
                  <button onClick={() => handleOpenQuickView(productData)} className="cursor-pointer w-14 h-18 md:w-16 md:h-20 rounded-[1px] border border-[#EEEEEE] overflow-hidden bg-white flex-none hover:opacity-80 transition-opacity">
                    {productData?.mainImage ? (
                      <img src={productData.mainImage} alt="Product" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#FAFAFA] flex items-center justify-center text-[8px] text-gray-300 font-bold uppercase">WIND</div>
                    )}
                  </button>
                  
                  <button 
                    onClick={() => handleOpenQuickView(productData)} 
                    className="group border-b border-[#CCCCCC] hover:border-[#1A1A1A] pb-0.5 transition-colors cursor-pointer"
                  >
                    <span className={`text-[#1A1A1A] font-bold line-clamp-1 ${isEnglish ? 'text-[12px] md:text-[14px] font-sans' : 'text-[13px] md:text-[15px] font-tajawal'}`}>
                      {productData?.title || "Wind Exclusive Piece"}
                    </span>
                  </button>

                </div>
              </div>
            );
          })}
        </div>

        <div className={`mt-6 flex items-center bg-white/90 backdrop-blur-sm px-6 py-2.5 rounded-full border border-white shadow-sm gap-5 transition-all duration-[1000ms] delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button onClick={prevReview} className="text-[#1A1A1A] hover:opacity-40 transition-opacity">
            <ChevronRight size={18} strokeWidth={2} />
          </button>

          <div className="flex items-center gap-3" dir="ltr">
             <span className="text-[#1A1A1A] font-bold text-[11px] font-mono opacity-80 w-4 text-center">
               {currentIndex + 1}
             </span>
             
             <div className="flex gap-1.5 items-center">
               {[...Array(5)].map((_, i) => {
                 const isActiveDot = (currentIndex % 5) === i;
                 return (
                   <div 
                     key={i} 
                     className={`h-[5px] rounded-full transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isActiveDot ? 'w-4 bg-[#1A1A1A]' : 'w-[5px] bg-[#D4D4D4]'}`}
                     style={{ willChange: 'width' }}
                   />
                 );
               })}
             </div>
          </div>

          <button onClick={nextReview} className="text-[#1A1A1A] hover:opacity-40 transition-opacity">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        </div>

      </div>

      <QuickViewModal 
        product={quickViewProduct} 
        isOpen={isQuickViewModalOpen} 
        onClose={() => setIsQuickViewModalOpen(false)} 
      />
      
    </section>
  );
};

// ==========================================================================
// 18. FLOATING IDEA & COLLECTIONS SECTION (الفكرة العائمة وكروت المجموعات)
// ==========================================================================
export const FloatingCollectionsSection = ({ data }) => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  // جلب صور الجرافيتي من الأدمن
  const floatImages = [
    data?.floatImg1 || "https://placehold.co/300x400/F5F5F5/AAAAAA?text=WIND+STYLE",
    data?.floatImg2 || "https://placehold.co/300x350/F5F5F5/AAAAAA?text=QUALITY",
    data?.floatImg3 || "https://placehold.co/300x350/F5F5F5/AAAAAA?text=DETAILS"
  ];

  // الكروت اللي تم اختيارها من الأدمن
  const cards = data?._adminItems || [];

  // مراقب التمرير (Scroll Observer) للأنيميشن الرئيسي
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 } 
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // مراقب لظهور كروت الأقسام (Posters) بتأثير الشلال
  const [visibleCards, setVisibleCards] = useState({});
  const cardsRef = useRef([]);

  useEffect(() => {
    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = entry.target.dataset.index;
            setVisibleCards(prev => ({ ...prev, [index]: true }));
            cardObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    cardsRef.current.forEach(card => {
      if (card) cardObserver.observe(card);
    });

    return () => cardObserver.disconnect();
  }, [cards]);

  return (
    <section className="w-full bg-white flex flex-col items-center justify-start overflow-hidden pt-16 md:pt-24 pb-16 md:pb-24" dir="ltr">
      
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-18px); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-25px); }
        }
        @keyframes float-fast {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        .anim-float-1 { animation: float-slow 4.5s ease-in-out infinite; }
        .anim-float-2 { animation: float-medium 5.5s ease-in-out infinite; }
        .anim-float-3 { animation: float-fast 3.8s ease-in-out infinite; }
      `}</style>

      {/* ================= الجزء الأول: الفكرة العائمة ================= */}
      <div className="relative w-full max-w-[1400px] mx-auto min-h-[45vh] md:min-h-[55vh] flex flex-col items-center justify-center mb-6 md:mb-10">
        
        {/* الصور العائمة مع تحسين الظلال */}
        <div className="absolute top-[10%] md:top-[15%] left-[4%] md:left-[6%] w-24 h-32 md:w-36 md:h-48 anim-float-1 z-0 shadow-lg border-4 border-white/50">
           <img src={floatImages[0]} alt="Style 1" className="w-full h-full object-cover" />
        </div>

        <div className="absolute top-[0%] md:top-[4%] right-[4%] md:right-[6%] w-20 h-24 md:w-28 md:h-32 anim-float-2 z-0 shadow-lg border-4 border-white/50 translate-y-8">
           <img src={floatImages[1]} alt="Style 2" className="w-full h-full object-cover" />
        </div>

        <div className="absolute bottom-[5%] md:bottom-[12%] right-[4%] md:right-[6%] w-20 h-24 md:w-28 md:h-32 anim-float-3 z-0 shadow-lg border-4 border-white/50">
           <img src={floatImages[2]} alt="Style 3" className="w-full h-full object-cover" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center flex flex-col items-center justify-center mt-10 md:mt-0">
          
          <h4 
            ref={sectionRef} 
            className={`text-[#1A1A1A] text-[14px] md:text-[16px] font-semibold mb-4 uppercase tracking-[0.2em] transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'translate-y-0 opacity-100 duration-[800ms] delay-[150ms]' : 'translate-y-10 opacity-0 duration-[300ms] delay-0'}`} 
            style={{ fontFamily: "'Cairo', sans-serif", willChange: 'opacity, transform' }}
          >
            {data?.floatingSubTitle || "The product idea"}
          </h4>

          {/* تم تصغير الخط درجتين مع زيادة المسافة السفلية */}
          <h2 
            className={`text-[#1A1A1A] text-[18px] md:text-[28px] font-semibold leading-[1.3] md:leading-[1.25] mb-10 max-w-3xl transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'translate-y-0 opacity-100 duration-[800ms] delay-[300ms]' : 'translate-y-10 opacity-0 duration-[300ms] delay-0'}`} 
            style={{ fontFamily: "'Tajawal', sans-serif", willChange: 'opacity, transform' }}
          >
            {data?.floatingTitle || "Fashion with a focus on green materials, ethical manufacturing and less-waste."}
          </h2>

          <a 
            href={data?.floatingBtnLink || "/collections/all"} 
            className={`text-[#1A1A1A] text-[15px] md:text-[17px] font-semibold border-b-[1.5px] border-[#1A1A1A] pb-1 hover:opacity-60 transition-all ease-[cubic-bezier(0.16,1,0.3,1)] uppercase tracking-widest ${isVisible ? 'translate-y-0 opacity-100 duration-[800ms] delay-[450ms]' : 'translate-y-10 opacity-0 duration-[300ms] delay-0'}`}
            style={{ fontFamily: "'Tajawal', sans-serif", willChange: 'opacity, transform' }}
          >
            {data?.floatingBtnText || "View All Collection"}
          </a>
        </div>
      </div>

      {/* ================= الجزء الثاني: كروت المجموعات (Posters) ================= */}
      <div className="w-full flex flex-col gap-8 md:gap-14 items-center px-4 md:px-6 max-w-[1400px] mx-auto">
        
        {cards.map((card, index) => {
          const imgUrl = card.customImage || card.originalImage || "https://placehold.co/800x1000/F5F5F5/AAAAAA";
          const subtitle = card.badge || "WIND COLLECTION";
          const title = card.customName || card.originalName || "Exclusive Pieces";
          const btnText = card.linkText || "تسوقي الان";
          const link = card.linkUrl || "#";
          
          const isCardVisible = visibleCards[index];

          return (
            <div 
              key={index} 
              data-index={index}
              ref={el => cardsRef.current[index] = el}
              // ✨ تأثير الشلال والنعومة للكروت
              className={`w-full relative group overflow-hidden bg-[#F9F9F9] flex flex-col justify-end transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isCardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              style={{ 
                aspectRatio: '3/4', 
                maxHeight: '85vh',
                transitionDelay: `${(index % 2) * 150}ms`, // تأخير متدرج بسيط
                willChange: 'opacity, transform'
              }}
            >
              <img 
                src={imgUrl} 
                alt={title} 
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[2000ms] ease-[cubic-bezier(0.16,1,0.3,1)]" 
              />
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-80" />

              <div className="relative z-10 w-full flex flex-col items-end justify-end pb-10 md:pb-14 text-right px-6 md:px-12">
                
                <span 
                  className="text-white text-[14px] md:text-[16px] font-semibold tracking-[0.2em] uppercase mb-4 drop-shadow-md" 
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  {subtitle}
                </span>
                
                <h3 
                  className="text-white text-[20px] md:text-[28px] font-semibold mb-5 drop-shadow-md leading-tight max-w-xl" 
                  style={{ fontFamily: "'Tajawal', sans-serif" }}
                >
                  {title}
                </h3>
                
                {/* 🎯 تم توحيد الزر ليتطابق تماماً مع زر الفاصل المرئي (px-9 py-3.5) */}
                <a 
                  href={link} 
                  className="font-tajawal inline-flex justify-center items-center bg-white text-[#1A1A1A] border border-white rounded-[3px] px-9 py-3.5 font-bold text-[13px] md:text-[14px] tracking-widest uppercase hover:bg-[#1A1A1A] hover:text-white hover:border-[#1A1A1A] transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm"
                >
                  {btnText}
                </a>

              </div>
            </div>
          );
        })}

      </div>
    </section>
  );
};