"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getDb } from "../lib/firebase";
import { updateDoc, increment, doc, getDoc } from "firebase/firestore/lite";
import { usePathname } from "next/navigation";
import useSWR from 'swr';

const SettingsContext = createContext();

function getTodayStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
}

export const SettingsProvider = ({ children }) => {
  const pathname = usePathname();
  const isAdmin = pathname && pathname.startsWith('/admin');

  const { data: settings, isLoading, mutate } = useSWR('site-settings', async () => {
    const res = await fetch("/api/site-settings");
    const result = await res.json();
    return result.success ? result.data : null;
  }, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });

  // 🔥 2. عداد الزوار اليومي (يدعم التتبع اللحظي لليوم)
  useEffect(() => {
    const hasBeenCounted = sessionStorage.getItem("wind_v_counted");
    
    if (!hasBeenCounted && !isAdmin) {
      const db = getDb();
      const settingsRef = doc(db, "settings", "siteSettings");
      
      // نقرا أولاً لنعرف إذا كان اليوم بدأ جديد
      getDoc(settingsRef).then(snap => {
        const counters = snap.exists() ? (snap.data().counters || {}) : {};
        const today = getTodayStr();
        
        if (counters.todayDate !== today) {
          // يوم جديد: reset todayVisitors = 1, update todayDate, increment total visitors
          updateDoc(settingsRef, {
            "counters.visitors": increment(1),
            "counters.todayDate": today,
            "counters.todayVisitors": 1
          }).catch(err => console.error("Counter reset failed:", err));
        } else {
          // نفس اليوم: increment both counters
          updateDoc(settingsRef, {
            "counters.visitors": increment(1),
            "counters.todayVisitors": increment(1)
          }).catch(err => console.error("Counter increment failed:", err));
        }
        
        sessionStorage.setItem("wind_v_counted", "true");
      }).catch(err => {
        console.error("Counter read failed, fallback to simple increment:", err);
        updateDoc(settingsRef, { "counters.visitors": increment(1) })
          .then(() => sessionStorage.setItem("wind_v_counted", "true"))
          .catch(e => console.error("Fallback counter failed:", e));
      });
    }
  }, [isAdmin]);

  return (
    <SettingsContext.Provider value={{ settings, loading: isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);