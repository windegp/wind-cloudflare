'use client';
import React, { useEffect, useMemo } from 'react';
import { usePageReady } from "@/context/GlobalLoaderContext";
import { DESIGN_REGISTRY } from "@/lib/designRegistry";
// استيراد الهوكات الأسطورية اللي جهزناها
import { useHomepageProductsSections, useHomepageReviews } from '@/hooks/useFirestore';
import useSWR from 'swr';

export default function HomeSectionsMainContent() {
  const { signalPageReady } = usePageReady();

  // 1. جلب التنسيق (Layout) والهيرو من ال API عبر ال KV cache
  const { data: homepageData, isLoading: isHomepageLoading } = useSWR('homepage/data', async () => {
    const response = await fetch("/api/homepage");
    const result = await response.json();
    if (!result.success) {
      throw new Error('Failed to fetch homepage data');
    }
    return result.data;
  }, { dedupingInterval: 300000 });

  // استخراج بيانات التنسيق والهيرو من ال API
  const layoutConfig = homepageData?.layout?.sections || [];
  const heroData = homepageData?.hero || { slides: [], categories: [] };
  const isLayoutLoading = isHomepageLoading;
  const isHeroLoading = isHomepageLoading;

  // 3. "الضربة الاستباقية": سحب داتا الأقسام الأربعة فوراً وحفظها في الكاش
  // ده بيخلي أي قسم جواه (Best Sellers أو Top Rated) يلاقي داته جاهزة وميطلبش تاني
  const { data: homeSectionsData, isLoading: isSectionsLoading } = useHomepageProductsSections();
  const { data: homepageReviewsData } = useHomepageReviews();

  // حساس الجاهزية: أول ما الداتا الأساسية توصل وصورة الهيرو تحمل، نلغي اللودر
  useEffect(() => {
    if (!isLayoutLoading && !isHeroLoading) {
      const preloadHeroImage = async () => {
        if (heroData?.slides?.[0]?.image) {
          const img = new window.Image();
          img.src = heroData.slides[0].image;
          img.onload = () => signalPageReady();
          img.onerror = () => signalPageReady();
        } else {
          signalPageReady();
        }
      };
      preloadHeroImage();
    }
  }, [isLayoutLoading, isHeroLoading, heroData, signalPageReady]);

  // استخدام useMemo لتجنب إعادة حساب الأقسام في كل رندر (تحسين أداء)
  const renderedSections = useMemo(() => {
    if (!layoutConfig) return null;

    return layoutConfig.map((section, index) => {
      const SectionCategory = DESIGN_REGISTRY[section.category];
      const Component = SectionCategory ? SectionCategory[section.designId] : null;
      
      if (!Component) return null;

      // توزيع البيانات: لو القسم هيرو ياخد بيانات الهيرو، لو قسم منتجات ياخد البيانات المدمجة
      let sectionData = section.data;
      if (section.category === "HERO_SECTION") {
        sectionData = heroData;
      } else if (["FEATURED_PRODUCTS", "TOP_RATED"].includes(section.category)) {
        sectionData = { ...section.data, bundle: homeSectionsData };
      } else if (section.category === "CUSTOMER_REVIEWS_SECTION") {
        sectionData = {
          ...section.data,
          reviews: homepageReviewsData?.reviews || [],
          products: homepageReviewsData?.products || {}
        };
      }

      return (
        <Component
          key={`${section.category}-${index}`}
          data={sectionData}
        />
      );
    });
  }, [layoutConfig, heroData, homeSectionsData, homepageReviewsData]); // 🔥 إضافة الديبيندينسي

  return (
    <main className="bg-white min-h-screen">
      {renderedSections}
    </main>
  );
}
