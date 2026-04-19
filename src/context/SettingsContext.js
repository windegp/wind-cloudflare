"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getDb } from "../lib/firebase";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore/lite";
import { usePathname } from "next/navigation";
import useSWR from 'swr';

const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  // 🔥 1. SWR مع نظام "الذاكرة الحديدية"
  const { data: settings, isLoading } = useSWR('site-settings', async () => {
    const db = getDb();
    const settingsDoc = await getDoc(doc(db, "settings", "siteSettings"));
    const data = settingsDoc.exists() ? settingsDoc.data() : null;
    return data;
  }, {
    revalidateOnFocus: false, 
    dedupingInterval: 3600000, // ساعة كاملة "هدوء" للكوتا
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