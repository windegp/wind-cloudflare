'use client';
import React, { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePageReady } from "@/context/GlobalLoaderContext";
import { DESIGN_REGISTRY } from "@/lib/designRegistry";
// استيراد الهوكات الأسطورية اللي جهزناها
import { useHomepageProductsSections, useSiteSettings } from '@/hooks/useFirestore';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import useSWR from 'swr';

const HomeSectionsMain = dynamic(() => import("@/components/HomeSectionsMain"), { 
  ssr: false,
  loading: () => <div className="bg-white min-h-screen" /> 
});

export default function HomeSectionsMainContent() {
  const { signalPageReady } = usePageReady();

  // 1. جلب التنسيق (Layout) عبر SWR لضمان الكاش
  const { data: layoutConfig, isLoading: isLayoutLoading } = useSWR('homepage/layout_config', async () => {
    const db = getDb();
    const snap = await getDoc(doc(db, "homepage", "layout_config"));
    return snap.exists() ? snap.data().sections || [] : [];
  }, { dedupingInterval: 3600000 });

  // 2. جلب الهيرو (Hero) عبر SWR
  const { data: heroData, isLoading: isHeroLoading } = useSWR('homepage/main-hero', async () => {
    const db = getDb();
    const snap = await getDoc(doc(db, "homepage", "main-hero"));
    return snap.exists() ? snap.data() : { slides: [], categories: [] };
  }, { dedupingInterval: 3600000 });

  // 3. "الضربة الاستباقية": سحب داتا الأقسام الأربعة فوراً وحفظها في الكاش
  // ده بيخلي أي قسم جواه (Best Sellers أو Top Rated) يلاقي داته جاهزة وميطلبش تاني
  const { data: homeSectionsData, isLoading: isSectionsLoading } = useHomepageProductsSections();

  // 🪄 حساس الجاهزية: أول ما الداتا الأساسية توصل وصورة الهيرو تحمل، نلغي اللودر
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
        // تمرير الداتا المجهزة مسبقاً (homeSectionsData) للقسم
        sectionData = { ...section.data, bundle: homeSectionsData };
      }

      return (
        <Component 
          key={`${section.category}-${index}`} 
          data={sectionData} 
        />
      );
    });
  }, [layoutConfig, heroData, homeSectionsData]);

  return (
    <main className="bg-white min-h-screen">
      {renderedSections}
    </main>
  );
}