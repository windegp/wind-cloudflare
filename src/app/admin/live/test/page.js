"use client";

/**
 * صفحة اختبار onDisconnect
 * ─────────────────────────
 * الهدف: إثبات أن onDisconnect يُسجَّل وينفَّذ عند إغلاق التاب أو المتصفح.
 *
 * طريقة الاختبار:
 *  1. افتح هذه الصفحة في تاب.
 *  2. افتح /admin/live في تاب آخر وراقب "مراقب الاختبار".
 *  3. أغلق تاب الاختبار (أو المتصفح كله).
 *  4. لو ظهر "✅ onDisconnect نُفِّذ" في خلال 5-10 ثوانٍ → يعمل.
 *     لو بقي "⏳ في انتظار الانقطاع..." → لا يعمل.
 *
 * المسار في RTDB: _onDisconnectTest/{testId}
 * يُحذف تلقائياً بعد 60 ثانية من /admin/live/test لتنظيف البيانات.
 */

import { useEffect, useRef, useState } from "react";
import { getRtdb } from "@/lib/firebase";
import { ref, set, onDisconnect, onValue, serverTimestamp } from "firebase/database";
import Link from "next/link";
import { ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from "@/components/icons-extra";

export const dynamic = "force-dynamic";

export default function OnDisconnectTestPage() {
  const [testId]        = useState(() => "test_" + Math.random().toString(36).substr(2, 8));
  const [status,        setStatus]        = useState("idle");      // idle | registered | waiting | done | failed
  const [log,           setLog]           = useState([]);
  const [nodeValue,     setNodeValue]     = useState(null);
  const [elapsedSec,    setElapsedSec]    = useState(0);
  const registeredAt    = useRef(null);
  const timerRef        = useRef(null);
  const testRef         = useRef(null);
  const listenerUnsub   = useRef(null);

  const addLog = (msg, type = "info") => {
    const ts = new Date().toLocaleTimeString("ar-EG");
    setLog(prev => [...prev, { ts, msg, type }]);
  };

  const runTest = () => {
    setStatus("registering");
    setLog([]);
    setElapsedSec(0);
    setNodeValue(null);

    try {
      const rtdb = getRtdb();
      testRef.current = ref(rtdb, `_onDisconnectTest/${testId}`);

      // 1. اكتب node الاختبار
      set(testRef.current, {
        createdAt:       serverTimestamp(),
        createdAtClient: Date.now(),
        status:          "connected",
        testId,
      }).then(() => {
        addLog("✅ كتابة node الاختبار نجحت", "success");

        // 2. سجّل onDisconnect.remove()
        onDisconnect(testRef.current).remove()
          .then(() => {
            registeredAt.current = Date.now();
            setStatus("registered");
            addLog("✅ تم تسجيل onDisconnect.remove() على Firebase server", "success");
            addLog("👉 الآن أغلق هذا التاب أو المتصفح وراقب هذه الصفحة في تاب الأدمن", "info");
            addLog("⏳ في انتظار تنفيذ onDisconnect...", "info");
          })
          .catch(err => {
            setStatus("failed");
            addLog(`❌ فشل تسجيل onDisconnect: ${err.message} (${err.code || "no-code"})`, "error");
          });

        // 3. راقب الـ node في real-time — لو اتحذف معناه onDisconnect شتغل
        listenerUnsub.current = onValue(testRef.current, snap => {
          const val = snap.val();
          setNodeValue(val);

          if (val === null && registeredAt.current) {
            const elapsed = ((Date.now() - registeredAt.current) / 1000).toFixed(1);
            setStatus("done");
            addLog(`✅ Node اتحذف! onDisconnect نُفِّذ بعد ${elapsed} ثانية من التسجيل`, "success");
            if (timerRef.current) clearInterval(timerRef.current);
          }
        });

        // 4. عدّاد الوقت
        timerRef.current = setInterval(() => {
          if (registeredAt.current) {
            setElapsedSec(Math.floor((Date.now() - registeredAt.current) / 1000));
          }
        }, 1000);

      }).catch(err => {
        setStatus("failed");
        addLog(`❌ فشل كتابة node الاختبار: ${err.message}`, "error");
      });

    } catch (err) {
      setStatus("failed");
      addLog(`❌ خطأ في تهيئة RTDB: ${err.message}`, "error");
    }
  };

  // تنظيف عند مغادرة الصفحة
  // cleanup: يوقف العداد والـ listener فقط — لا يحذف الـ node أبداً
  // الجهة الوحيدة المسموح لها بالحذف هي onDisconnect على Firebase server
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (listenerUnsub.current) listenerUnsub.current();
    };
  }, [status]);

  const statusColor = {
    idle:         "bg-gray-100 text-gray-600",
    registering:  "bg-blue-50 text-blue-700",
    registered:   "bg-amber-50 text-amber-700",
    done:         "bg-emerald-50 text-emerald-700",
    failed:       "bg-red-50 text-red-700",
  }[status];

  const statusLabel = {
    idle:         "في انتظار البدء",
    registering:  "جارٍ التسجيل...",
    registered:   `⏳ في انتظار الانقطاع — ${elapsedSec}s`,
    done:         "✅ onDisconnect نُفِّذ",
    failed:       "❌ فشل",
  }[status];

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/admin/live" className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition">
              <ArrowRight size={18} className="text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-black text-gray-900">اختبار onDisconnect</h1>
              <p className="text-xs text-gray-500 mt-0.5">إثبات عملي — هل Firebase ينفّذ onDisconnect عند إغلاق التاب؟</p>
            </div>
          </div>

          {/* Test ID */}
          <div className="bg-gray-50 rounded-xl p-3 mb-4">
            <p className="text-[10px] text-gray-400 font-bold mb-1">مسار الاختبار في RTDB</p>
            <code className="text-xs text-gray-700 font-mono">_onDisconnectTest/{testId}</code>
          </div>

          {/* Status badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold mb-4 ${statusColor}`}>
            {status === "registering" && <RefreshCw size={14} className="animate-spin"/>}
            {status === "registered"  && <span className="text-sm">⏱</span>}
            {status === "done"        && <CheckCircle2 size={14}/>}
            {status === "failed"      && <AlertCircle size={14}/>}
            {statusLabel}
          </div>

          {/* Start button */}
          {(status === "idle" || status === "failed" || status === "done") && (
            <button onClick={runTest}
              className="block w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition">
              {status === "idle" ? "ابدأ الاختبار" : "إعادة الاختبار"}
            </button>
          )}

          {/* Instructions */}
          {status === "registered" && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-black text-amber-800 mb-2">📋 الخطوات:</p>
              <ol className="text-xs text-amber-700 space-y-1 font-medium list-decimal list-inside">
                <li>افتح <strong>/admin/live</strong> في تاب منفصل</li>
                <li>أغلق هذا التاب (أو المتصفح كله)</li>
                <li>راقب هذه الصفحة في التاب الآخر</li>
                <li>لو ظهر ✅ في خلال 10 ثوانٍ → onDisconnect يعمل</li>
              </ol>
            </div>
          )}
        </div>

        {/* Node value monitor */}
        {nodeValue !== null && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-600 mb-2">قيمة الـ Node الحالية في RTDB</p>
            <pre className="text-xs bg-gray-50 p-3 rounded-xl overflow-auto text-gray-700 font-mono">
              {JSON.stringify(nodeValue, null, 2)}
            </pre>
          </div>
        )}

        {nodeValue === null && status === "done" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-2"/>
            <p className="font-black text-emerald-800">Node = null ✅</p>
            <p className="text-xs text-emerald-700 mt-1">Firebase نفّذ onDisconnect.remove() بنجاح</p>
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-600 mb-3">سجل الاختبار</p>
            <div className="space-y-2">
              {log.map((entry, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                  entry.type === "success" ? "bg-emerald-50 text-emerald-800" :
                  entry.type === "error"   ? "bg-red-50 text-red-800" :
                  "bg-gray-50 text-gray-700"
                }`}>
                  <span className="font-mono text-gray-400 shrink-0">{entry.ts}</span>
                  <span className="font-medium">{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result interpretation */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <p className="text-xs font-black text-blue-800 mb-2">كيف تقرأ النتيجة</p>
          <div className="space-y-1.5 text-xs text-blue-700">
            <p>✅ <strong>Node اختفى في ≤ 10 ثوانٍ:</strong> onDisconnect يعمل — نعيد الكود الأصلي</p>
            <p>⏳ <strong>Node بقي موجوداً بعد 60 ثانية:</strong> onDisconnect لا يعمل — نحقق في السبب</p>
            <p>❌ <strong>فشل التسجيل نفسه:</strong> مشكلة في RTDB Rules أو الاتصال</p>
          </div>
        </div>

      </div>
    </div>
  );
}
