"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getDb } from "../lib/firebase";
import { updateDoc, increment, doc, getDoc, setDoc } from "firebase/firestore/lite";
import { usePathname } from "next/navigation";
import useSWR from 'swr';
import { getCairoDateStr, getCairoTimestamp } from '@/lib/analytics-helpers';

const SettingsContext = createContext();

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

  // 🔥 Visitor event tracking — writes an immutable event document
  // Each visitor gets one event per day per session
  // Also updates counters.visitors and counters.todayVisitors
  useEffect(() => {
    const hasBeenCounted = sessionStorage.getItem("wind_v_counted");
    
    if (!hasBeenCounted && !isAdmin) {
      const db = getDb();
      
      // Generate a unique visitor event ID from session + timestamp
      let sessionId = sessionStorage.getItem('wind_visitor_session');
      if (!sessionId) {
        sessionId = 'vis_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        sessionStorage.setItem('wind_visitor_session', sessionId);
      }
      
      const todayStr = getCairoDateStr(new Date());
      const visitorEventRef = doc(db, "visitor_events", `${sessionId}_${todayStr}`);
      
      // Write a single immutable visitor event document
      getDoc(visitorEventRef).then(snap => {
        if (!snap.exists()) {
          setDoc(visitorEventRef, {
            sessionId: sessionId,
            date: todayStr,
            visitedAt: getCairoTimestamp(),
            country: '',
            city: '',
            device: typeof window !== 'undefined' ? (window.innerWidth < 768 ? 'Mobile' : 'Desktop') : '',
            userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
            referrer: typeof document !== 'undefined' ? document.referrer : '',
            page: pathname || '/',
          }).catch(err => console.warn("Visitor event write failed:", err));
          
          // Increment counters for both all-time and today
          try {
            const settingsRef = doc(db, "settings", "siteSettings");
            const todayDateField = "counters.todayDate";
            
            // Atomically increment counters.visitors (all-time) and counters.todayVisitors
            // We also need to handle the case where todayDate changes (new day)
            getDoc(settingsRef).then(snap => {
              if (snap.exists()) {
                const currentCounters = snap.data().counters || {};
                const storedTodayDate = currentCounters.todayDate || '';
                const updates = {
                  "counters.visitors": increment(1),
                };
                
                if (storedTodayDate === todayStr) {
  // Same Cairo day
  updates["counters.todayVisitors"] = increment(1);

} else {
  // Cairo day rollover
  // Preserve previous todayVisitors into yesterdayVisitors
  const oldTodayVisitors = Number(currentCounters.todayVisitors) || 0;

  updates["counters.yesterdayVisitors"] = oldTodayVisitors;

  // IMPORTANT:
  // We initialize todayVisitors at 0 first,
  // then atomically increment by 1 to avoid race conditions
  // during simultaneous midnight visits.
  updates["counters.todayVisitors"] = increment(1);

  updates["counters.todayDate"] = todayStr;
}
                
                updateDoc(settingsRef, updates).catch(() => {});
              } else {
                // No settings doc yet — set initial values
                updateDoc(settingsRef, {
                  "counters.visitors": increment(1),
                  "counters.todayVisitors": 1,
                  "counters.todayDate": todayStr,
                }).catch(() => {});
              }
            }).catch(() => {
              // Fallback: just increment visitors
              updateDoc(settingsRef, {
                "counters.visitors": increment(1),
              }).catch(() => {});
            });
          } catch (e) {
            // Silent fail
          }
        }
      }).catch(err => {
        console.warn("Visitor event check failed:", err);
        // Fallback: simple counter increment
        const settingsRef = doc(db, "settings", "siteSettings");
        updateDoc(settingsRef, { "counters.visitors": increment(1) }).catch(() => {});
      });
      
      sessionStorage.setItem("wind_v_counted", "true");
    }
  }, [isAdmin, pathname]);

  return (
    <SettingsContext.Provider value={{ settings, loading: isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);