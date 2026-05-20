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

/**
 * LOCK: يمنع التاب الغير مسؤول من إعادة الكتابة فوق rollover
 * https://developer.mozilla.org/en-US/docs/Web/API/Storage/lock
 */
function acquireRolloverLock() {
  const lockKey = 'wind_rollover_lock';
  const lock = localStorage.getItem(lockKey);
  const nowMs = Date.now();
  
  if (lock) {
    const lockData = JSON.parse(lock);
    // Lock expires after 5 seconds — يمنع lock stuck forever
    if (nowMs - lockData.timestamp < 5000) {
      return false; // Lock acquired by another tab
    }
  }
  
  localStorage.setItem(lockKey, JSON.stringify({ timestamp: nowMs }));
  return true;
}

function releaseRolloverLock() {
  localStorage.removeItem('wind_rollover_lock');
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

  // 🔥 عداد الزوار — مع حماية rollover من التكرار بين التابات
  useEffect(() => {
    const hasBeenCounted = sessionStorage.getItem("wind_v_counted");
    
    if (!hasBeenCounted && !isAdmin) {
      const db = getDb();
      const settingsRef = doc(db, "settings", "siteSettings");
      
      getDoc(settingsRef).then(snap => {
        const counters = snap.exists() ? (snap.data().counters || {}) : {};
        const today = getTodayStr();
        
        if (counters.todayDate !== today) {
          // 🔒 محاولة أخذ الـ lock — لو تاب تاني أخذه، نتخطى rollover ونزود visitors بس
          if (acquireRolloverLock()) {
            try {
              // إعادة قراءة counters بعد الـ lock للتأكد
              const finalTodayVisitors = Number(counters.todayVisitors) || 0;
              
              updateDoc(settingsRef, {
                "counters.visitors": increment(1),
                "counters.todayDate": today,
                "counters.todayVisitors": 1,
                "counters.yesterdayVisitors": finalTodayVisitors
              }).catch(err => console.error("Counter reset failed:", err))
              .finally(() => releaseRolloverLock());
            } catch (e) {
              releaseRolloverLock();
              // Fallback: increment visitors only
              updateDoc(settingsRef, { "counters.visitors": increment(1) }).catch(() => {});
            }
          } else {
            // تاب تاني مسؤول عن rollover — نزود visitors بس
            updateDoc(settingsRef, {
              "counters.visitors": increment(1),
              "counters.todayVisitors": increment(1)
            }).catch(err => console.error("Secondary tab increment failed:", err));
          }
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