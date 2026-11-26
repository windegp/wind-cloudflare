"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getDb } from "../lib/firebase";
import { updateDoc, increment, doc, getDoc, setDoc } from "firebase/firestore/lite";
import { usePathname } from "next/navigation";
import useSWR from 'swr';
import { shouldRefreshSettingsOnPath } from '@/lib/settingsRefreshPolicy';
import { getCairoDateStr, getCairoTimestamp } from '@/lib/analytics-helpers';
import { createVisitorRecorder } from '@/lib/visitorTracking';

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

  // Fresh promotion settings: refreshed on navigation only at checkout, and after a
  // successful subscription on any page. Other pages use the cached settings, which
  // avoids a fresh read (KV write + Firestore read) on every navigation.
  // The server quote still reads Firestore directly and owns checkout pricing.
  const refreshFresh = useCallback(async () => {
    try {
      const response = await fetch("/api/site-settings?fresh=true", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.success) mutate(result.data, false);
    } catch (_) {}
  }, [mutate]);

  useEffect(() => {
    if (shouldRefreshSettingsOnPath(pathname)) refreshFresh();
  }, [pathname, refreshFresh]);

  useEffect(() => {
    window.addEventListener("wind:subscribed", refreshFresh);
    return () => window.removeEventListener("wind:subscribed", refreshFresh);
  }, [refreshFresh]);

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
      const recordVisitor = createVisitorRecorder({
        db, doc, getDoc, setDoc, updateDoc, increment,
        now: getCairoTimestamp,
      });
      recordVisitor({
        sessionId,
        todayStr,
        page: pathname || '/',
        context: {
          device: typeof window !== 'undefined' ? (window.innerWidth < 768 ? 'Mobile' : 'Desktop') : '',
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
          referrer: typeof document !== 'undefined' ? document.referrer : '',
        },
        markCounted: () => {
          sessionStorage.setItem("wind_v_counted", "true");
          console.log("[VisitorEvent] wind_v_counted set (prevents retry loop)");
        },
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