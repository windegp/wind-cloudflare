"use client";

import React, { useEffect, useState } from 'react';
// 🔥 1. استدعاء getRtdb 
import { getRtdb } from "@/lib/firebase";
// 🔥 2. استدعاء دوال RTDB
import { ref, onValue, get } from "firebase/database";
import { Users, ShoppingCart, CreditCard, CheckCircle, Globe, Activity, ArrowRight, Package } from '@/components/icons-extra';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function LiveViewPage() {
  const [sessions, setSessions] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [debugInfo, setDebugInfo] = useState({
    rtdbInit: false,
    refCreated: false,
    listenerAttached: false,
    snapshotReceived: false,
    data: null,
    error: null,
    manualGetResult: null
  });

  useEffect(() => {
    let unsubscribe = null;
    let rtdb;

    // STEP 1: Verify environment
    console.log("[DEBUG] typeof window:", typeof window);
    console.log("[DEBUG] typeof document:", typeof document);

    // STEP 2: Verify RTDB Initialization
    try {
      console.log("[DEBUG] Attempting getRtdb()...");
      rtdb = getRtdb();
      console.log("[DEBUG] RTDB initialized:", !!rtdb);
      console.log("[DEBUG] RTDB object keys:", Object.keys(rtdb || {}));
      setDebugInfo(prev => ({ ...prev, rtdbInit: !!rtdb }));
    } catch (error) {
      console.error("[DEBUG] RTDB INIT ERROR:", error.message);
      console.error("[DEBUG] RTDB INIT ERROR STACK:", error.stack);
      setDebugInfo(prev => ({ ...prev, rtdbInit: false, error: error.message }));
      return;
    }

    // STEP 3: Verify Reference Creation
    let liveSessionsRef;
    try {
      console.log("[DEBUG] Creating ref to LiveSessions...");
      liveSessionsRef = ref(rtdb, 'LiveSessions');
      console.log("[DEBUG] Reference created:", !!liveSessionsRef);
      console.log("[DEBUG] Ref path:", liveSessionsRef?.toString?.() || 'N/A');
      setDebugInfo(prev => ({ ...prev, refCreated: !!liveSessionsRef }));
    } catch (error) {
      console.error("[DEBUG] REF CREATION ERROR:", error);
      setDebugInfo(prev => ({ ...prev, refCreated: false, error: error.message }));
      return;
    }

    // 🛡️ Safe timestamp helper - FIXED for Firebase serverTimestamp
    const getValidTimestamp = (session) => {
      if (!session) return Date.now(); // Never return 0 - prevents filtering bugs

      const serverTime = session.lastActive;
      const clientTime = session.lastActiveClient;

      // Guard 1: Check if serverTime is a valid number (not object placeholder, not undefined)
      if (typeof serverTime === "number" && Number.isFinite(serverTime) && serverTime > 0) {
        return serverTime;
      }

      // Guard 2: Fallback to client timestamp
      if (typeof clientTime === "number" && Number.isFinite(clientTime) && clientTime > 0) {
        return clientTime;
      }

      // Guard 3: If both invalid (e.g., serverTimestamp still resolving), use NOW
      // This prevents sessions from being filtered out due to timestamp bugs
      return Date.now();
    };

    // STEP 4: Verify Listener Attachment
    const startListening = () => {
      if (unsubscribe) {
        console.log("[DEBUG] Already subscribed, skipping");
        return;
      }

      console.log("[DEBUG] Attaching onValue listener...");
      setDebugInfo(prev => ({ ...prev, listenerAttached: true }));

      unsubscribe = onValue(
        liveSessionsRef,
        (snapshot) => {
          console.log("[DEBUG] SNAPSHOT RECEIVED - EXISTS:", snapshot.exists());
          console.log("[DEBUG] SNAPSHOT RAW VAL:", snapshot.val());

          const data = snapshot.val();
          const now = Date.now();

          setDebugInfo(prev => ({
            ...prev,
            snapshotReceived: true,
            data: data ? Object.keys(data).length + ' sessions' : 'null/empty'
          }));

          if (data) {
            console.log("[DEBUG] Session count:", Object.keys(data).length);
            const activeSessions = [];
            Object.keys(data).forEach(key => {
              const session = data[key];
              const lastActive = getValidTimestamp(session);
              const ageMs = now - lastActive;
              const ageMin = Math.floor(ageMs / 60000);
              console.log(`[DEBUG] Session ${key}: lastActive=${lastActive}, age=${ageMs}ms (${ageMin}min)`);
              // EXTENDED: 2 hours (7200000ms) to show visitors despite onDisconnect issues
              if (now - lastActive < 7200000) {
                activeSessions.push({ id: key, ...session, _lastActiveComputed: lastActive, _ageMinutes: ageMin });
              }
            });
            console.log("[DEBUG] Active sessions after filter:", activeSessions.length);
            activeSessions.sort((a, b) => (b._lastActiveComputed || 0) - (a._lastActiveComputed || 0));
            setSessions(activeSessions);
          } else {
            console.log("[DEBUG] No data in snapshot");
            setSessions([]);
          }
          setLastUpdate(new Date());
        },
        (error) => {
          console.error("[DEBUG] ONVALUE ERROR:", error);
          console.error("[DEBUG] ONVALUE ERROR CODE:", error?.code);
          console.error("[DEBUG] ONVALUE ERROR MESSAGE:", error?.message);
          setDebugInfo(prev => ({ ...prev, error: error.message, snapshotReceived: false }));
        }
      );

      console.log("[DEBUG] onValue returned, subscription active:", !!unsubscribe);
    };

    // STEP 5: Manual GET test (one-time read)
    const testManualGet = async () => {
      try {
        console.log("[DEBUG] Testing manual get()...");
        const snapshot = await get(liveSessionsRef);
        console.log("[DEBUG] MANUAL GET - EXISTS:", snapshot.exists());
        console.log("[DEBUG] MANUAL GET - VAL:", snapshot.val());
        setDebugInfo(prev => ({
          ...prev,
          manualGetResult: snapshot.exists() ? Object.keys(snapshot.val() || {}).length + ' sessions' : 'null/empty'
        }));
      } catch (error) {
        console.error("[DEBUG] MANUAL GET ERROR:", error);
        setDebugInfo(prev => ({ ...prev, manualGetResult: 'ERROR: ' + error.message }));
      }
    };

    // Execute tests
    startListening();
    testManualGet();

    // Cleanup
    return () => {
      console.log("[DEBUG] Cleanup - unsubscribing");
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  }, []);

  // باقي الكود كما هو بدون أي تغيير في الواجهة
  const stats = {
    browsing: sessions.filter(s => s.status === 'browsing').length,
    activeCarts: sessions.filter(s => s.status === 'active_cart').length,
    checkout: sessions.filter(s => s.status === 'checkout').length,
    purchased: sessions.filter(s => s.status === 'purchased').length,
    totalCartValue: sessions.reduce((acc, s) => acc + (s.cartValue || 0), 0)
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#202223] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
              <ArrowRight size={20} className="text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-black flex items-center gap-2">
                مباشر (Live View)
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#008060]"></span>
                </span>
              </h1>
              <p className="text-xs text-gray-500 mt-1 font-bold">تحديث تلقائي • آخر إشارة: {lastUpdate.toLocaleTimeString('ar-EG')}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 bg-gray-50 px-6 py-3 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs text-gray-500 font-bold mb-0.5">الزوار النشطون</p>
              <p className="text-3xl font-black text-[#008060]">{sessions.length}</p>
            </div>
            <div className="w-px h-10 bg-gray-200"></div>
            <div>
              <p className="text-xs text-gray-500 font-bold mb-0.5">قيمة السلات</p>
              <p className="text-xl font-black text-[#202223]">{stats.totalCartValue.toLocaleString()} <span className="text-xs text-gray-400">ج.م</span></p>
            </div>
          </div>
        </div>

        {/* DEBUG PANEL - Network Diagnostics */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 font-mono text-xs">
          <h3 className="font-bold text-yellow-800 mb-2">🔍 RTDB DIAGNOSTICS (Auto-refresh)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-yellow-900">
            <div className={`px-2 py-1 rounded ${debugInfo.rtdbInit ? 'bg-green-200' : 'bg-red-200'}`}>
              1. RTDB Init: {debugInfo.rtdbInit ? '✅' : '❌'}
            </div>
            <div className={`px-2 py-1 rounded ${debugInfo.refCreated ? 'bg-green-200' : 'bg-red-200'}`}>
              2. Ref Created: {debugInfo.refCreated ? '✅' : '❌'}
            </div>
            <div className={`px-2 py-1 rounded ${debugInfo.listenerAttached ? 'bg-green-200' : 'bg-red-200'}`}>
              3. Listener: {debugInfo.listenerAttached ? '✅' : '❌'}
            </div>
            <div className={`px-2 py-1 rounded ${debugInfo.snapshotReceived ? 'bg-green-200' : 'bg-red-200'}`}>
              4. Snapshot: {debugInfo.snapshotReceived ? '✅' : '❌'}
            </div>
            <div className="px-2 py-1 bg-gray-100 rounded col-span-2">
              onValue Data: {debugInfo.data || 'waiting...'}
            </div>
            <div className="px-2 py-1 bg-gray-100 rounded col-span-1">
              Manual GET: {debugInfo.manualGetResult || 'waiting...'}
            </div>
          </div>
          {debugInfo.error && (
            <div className="mt-2 p-2 bg-red-100 text-red-800 rounded">
              ❌ ERROR: {debugInfo.error}
            </div>
          )}
          <p className="mt-2 text-gray-500">Check DevTools Console for detailed logs. Look for WebSocket requests to *.firebaseio.com</p>
        </div>

        {/* Funnel Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute left-0 bottom-0 top-0 w-1 bg-blue-500 rounded-r-full"></div>
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-gray-600">يتصفحون المتجر</p>
              <Users size={18} className="text-blue-500" />
            </div>
            <p className="text-3xl font-black">{stats.browsing}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute left-0 bottom-0 top-0 w-1 bg-yellow-500 rounded-r-full"></div>
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-gray-600">سلات نشطة</p>
              <ShoppingCart size={18} className="text-yellow-500" />
            </div>
            <p className="text-3xl font-black">{stats.activeCarts}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute left-0 bottom-0 top-0 w-1 bg-orange-500 rounded-r-full"></div>
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-gray-600">إتمام الدفع</p>
              <CreditCard size={18} className="text-orange-500" />
            </div>
            <p className="text-3xl font-black">{stats.checkout}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#008060]/30 shadow-sm flex flex-col justify-between relative overflow-hidden bg-green-50/30">
            <div className="absolute left-0 bottom-0 top-0 w-1 bg-[#008060] rounded-r-full"></div>
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-[#008060]">اشتروا الآن</p>
              <CheckCircle size={18} className="text-[#008060]" />
            </div>
            <p className="text-3xl font-black text-[#008060]">{stats.purchased}</p>
          </div>
        </div>

        {/* Activity List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="text-base font-bold flex items-center gap-2"><Activity size={18} className="text-gray-500" /> سجل نشاط الزوار</h2>
          </div>
          
          <div className="flex-1 p-5">
            {sessions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                <Globe size={48} className="mb-4 text-gray-200" />
                <p className="font-bold">لا يوجد زوار نشطون في هذه اللحظة</p>
                <p className="text-sm mt-1">يتم تحديث هذه الصفحة تلقائياً</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map(session => (
                  <div key={session.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        session.status === 'browsing' ? 'bg-blue-50 text-blue-500' :
                        session.status === 'active_cart' ? 'bg-yellow-50 text-yellow-500' :
                        session.status === 'checkout' ? 'bg-orange-50 text-orange-500' :
                        'bg-green-50 text-[#008060]'
                      }`}>
                        {session.status === 'browsing' && <Users size={18} />}
                        {session.status === 'active_cart' && <ShoppingCart size={18} />}
                        {session.status === 'checkout' && <CreditCard size={18} />}
                        {session.status === 'purchased' && <CheckCircle size={18} />}
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md" dir="ltr">{session.id.replace('sess_', 'Vis-')}</span>
                          <span className="text-[10px] font-bold text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">{session.device || 'Web'}</span>
                          {session._ageMinutes !== undefined && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${session._ageMinutes < 15 ? 'bg-green-100 text-green-700' : session._ageMinutes < 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {session._ageMinutes}m ago
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 max-w-[180px] sm:max-w-[250px] truncate" dir="ltr">{session.path}</p>
                      </div>
                    </div>
                    
                    <div className="text-left shrink-0">
                      {session.cartValue > 0 ? (
                        <>
                          <p className="text-sm font-black text-[#202223]">{session.cartValue} ج.م</p>
                          <p className="text-[10px] text-gray-500 font-bold bg-gray-50 px-1.5 py-0.5 rounded mt-1 text-center">{session.itemsCount} منتج</p>
                        </>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 bg-gray-50 text-gray-400 rounded-lg border border-gray-100">تصفح</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}