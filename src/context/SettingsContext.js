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
      
      // [DIAGNOSTIC] Before visitor_events write attempt
      console.log("[VisitorEvent] ATTEMPTING setDoc for:", visitorEventRef.id, "at", new Date().toISOString());
      
      // Write a single immutable visitor event document
      getDoc(visitorEventRef).then(snap => {
        if (!snap.exists()) {
          // ═══════════════════════════════════════════════════
          // FIX: Chain counter updates AFTER setDoc resolves
          // ═══════════════════════════════════════════════════
          // Previously, setDoc and counter updates ran in parallel
          // as separate promise chains. If setDoc failed silently,
          // counters still incremented but visitor_events never persisted.
          // Now counter updates only proceed AFTER setDoc succeeds.
          // ═══════════════════════════════════════════════════
          
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
          }).then(() => {
            // [DIAGNOSTIC] visitor_events write succeeded
            console.log("[VisitorEvent] ✅ setDoc SUCCEEDED for:", visitorEventRef.id);

            // ✅ Mark counted ONLY after visitor_events doc is successfully created
            sessionStorage.setItem("wind_v_counted", "true");

            // ═══════════════════════════════════════════════════
            // Increment counters ONLY after visitor_events is confirmed written
            // ═══════════════════════════════════════════════════
            const settingsRef = doc(db, "settings", "siteSettings");

            getDoc(settingsRef).then(snap => {
              if (snap.exists()) {
                const currentCounters = snap.data().counters || {};
                const storedTodayDate = currentCounters.todayDate || '';
                const updates = {
                  "counters.visitors": increment(1),
                };
                
                if (storedTodayDate === todayStr) {
                  updates["counters.todayVisitors"] = increment(1);
                } else {
                  const oldTodayVisitors = Number(currentCounters.todayVisitors) || 0;
                  updates["counters.yesterdayVisitors"] = oldTodayVisitors;
                  updates["counters.todayVisitors"] = increment(1);
                  updates["counters.todayDate"] = todayStr;
                }
                
                updateDoc(settingsRef, updates).catch(err => {
                  console.warn("[VisitorEvent] counter update failed:", err.message);
                });
              } else {
                updateDoc(settingsRef, {
                  "counters.visitors": increment(1),
                  "counters.todayVisitors": 1,
                  "counters.todayDate": todayStr,
                }).catch(err => {
                  console.warn("[VisitorEvent] initial counter set failed:", err.message);
                });
              }
            }).catch(err => {
              console.warn("[VisitorEvent] settings read failed:", err.message);
              updateDoc(settingsRef, {
                "counters.visitors": increment(1),
              }).catch(err2 => {
                console.warn("[VisitorEvent] fallback counter increment failed:", err2.message);
              });
            });
          }).catch(err => {
            // [DIAGNOSTIC] visitor_events write FAILED
            console.error("[VisitorEvent] ❌ setDoc FAILED:", err.message, err.code || "");
            console.error("[VisitorEvent] ❌ Full error:", JSON.stringify(err));
            // Don't mark counted — allow retry on next load
            // IMPORTANT: Do NOT increment counters if visitor_events write failed
          });
        } else {
          // Doc already exists for this session+day — just mark counted
          console.log("[VisitorEvent] Doc already exists for session+day, skipping write");
          sessionStorage.setItem("wind_v_counted", "true");
        }
      }).catch(err => {
        console.warn("[VisitorEvent] getDoc check failed:", err.message);
        // Only fallback to counter increment if we can't verify
        sessionStorage.setItem("wind_v_counted", "true");
        const settingsRef = doc(db, "settings", "siteSettings");
        updateDoc(settingsRef, { "counters.visitors": increment(1) }).catch(err2 => {
          console.warn("[VisitorEvent] fallback counter increment failed:", err2.message);
        });
      });
    }
  }, [isAdmin, pathname]);

  return (
    <SettingsContext.Provider value={{ settings, loading: isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);