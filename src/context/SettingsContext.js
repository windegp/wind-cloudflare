"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getDb } from "../lib/firebase";
import { updateDoc, increment, doc } from "firebase/firestore/lite";
import { usePathname } from "next/navigation";
import useSWR from 'swr';

const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  // 🔥 تعديل WIND: تقليل الكاش للأدمن لضمان رؤية العدادات (الزوار والتقييمات) لحظياً
  const { data: settings, isLoading, mutate } = useSWR('site-settings', async () => {
    // للأدمن: نسحب دائماً نسخة جديدة بتخطي الكاش
    const url = isAdmin ? "/api/site-settings?fresh=true" : "/api/site-settings";
    const res = await fetch(url);
    const result = await res.json();
    return result.success ? result.data : null;
  }, {
    revalidateOnFocus: isAdmin, // تحديث بمجرد رجوعك لتبويب الأدمن
    dedupingInterval: isAdmin ? 5000 : 300000,
  });

  // 🔥 2. عداد الزوار (من كودك الأصلي - مُحسن)
  useEffect(() => {
    // إحنا بنستخدم الـ sessionStorage هنا للعداد فقط (عشان ميتكررش في نفس الجلسة)
    const hasBeenCounted = sessionStorage.getItem("wind_v_counted");
    
    if (!hasBeenCounted && !isAdmin) {
      const db = getDb();
      const settingsRef = doc(db, "settings", "siteSettings");
      
      updateDoc(settingsRef, { "counters.visitors": increment(1) })
        .then(() => {
          sessionStorage.setItem("wind_v_counted", "true");
        })
        .catch(err => console.error("Quota Guard: Counter failed", err));
    }
  }, [isAdmin]);

  return (
    <SettingsContext.Provider value={{ settings, loading: isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);