'use client';
import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { DESIGN_REGISTRY } from "@/lib/designRegistry";

export default function HomeSectionsMain() {
  const [layout, setLayout] = useState([]); 
  const [heroData, setHeroData] = useState({ slides: [], categories: [] });
  const [dataReady, setDataReady] = useState(false);

  // --- 1. جلب البيانات (المحرك الذكي) ---
  useEffect(() => {
    console.log("🚀 Fetching layout_config and main-hero...");

    const fetchData = async () => {
      try {
        // أ. جلب ترتيب الأقسام والمحتوى
        const layoutSnap = await getDoc(doc(getDb(), "homepage", "layout_config"));
        if (layoutSnap.exists()) {
          setLayout(layoutSnap.data().sections || []);
          setDataReady(true);
        }

        // ب. جلب بيانات قسم الهيرو
        const heroSnap = await getDoc(doc(getDb(), "homepage", "main-hero"));
        if (heroSnap.exists()) {
          setHeroData(heroSnap.data());
        }
      } catch (error) {
        console.error("Error fetching homepage data:", error);
      }
    };
    fetchData();
  }, []);

  return (
    <main className="bg-[#121212] min-h-screen">
      {/* --- 2. محرك العرض الديناميكي (Loop) --- */}
      {layout.map((section, index) => {
        const SectionCategory = DESIGN_REGISTRY[section.category];
        const Component = SectionCategory ? SectionCategory[section.designId] : null;
        
        // لو التصميم مش موجود لسبب ما، نتجاهله عشان الصفحة متضربش
        if (!Component) return null;

        // تحديد البيانات اللي هتتبعت للتصميم 
        // (لو القسم هيرو نبعتله بيانات الهيرو، لو غيره نبعتله بياناته الخاصة اللي جياله من لوحة التحكم)
        const sectionData = section.category === "HERO_SECTION" ? heroData : section.data;

        return (
          <Component 
            key={index} 
            data={sectionData} 
          />
        );
      })}
    </main>
  );
}
