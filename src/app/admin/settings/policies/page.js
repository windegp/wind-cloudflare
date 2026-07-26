"use client";

import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore/lite";
import { Settings, ShieldCheck, Truck, RefreshCw, Scale, Save, Loader2, Code2, Eye } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

const policiesList = [
  { id: 'shipping-policy', title: 'سياسة الشحن والتوصيل', icon: <Truck size={20} /> },
  { id: 'refund-policy', title: 'سياسة الاستبدال والاسترجاع', icon: <RefreshCw size={20} /> },
  { id: 'terms-of-service', title: 'الشروط والأحكام', icon: <Scale size={20} /> },
  { id: 'privacy-policy', title: 'سياسة الخصوصية', icon: <ShieldCheck size={20} /> },
];

export default function SettingsPolicies() {
  const [activeTab, setActiveTab] = useState('shipping-policy');
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // 🔥 merchantReturnDays — حقل مهيكل مستقل في settings/siteSettings.returnPolicy
  // (منفصل تمامًا عن مستند Policies الخاص بالنص الحر، ومنفصل عن دالة handleSave الحالية)
  const [merchantReturnDays, setMerchantReturnDays] = useState(14);
  const [savingReturnDays, setSavingReturnDays] = useState(false);
  const [returnDaysToast, setReturnDaysToast] = useState(null);

  // جلب البيانات من الفايربيس
  useEffect(() => {
    const fetchPolicy = async () => {
      setLoading(true);
      try {
        const db = getDb();
        const docRef = doc(db, "Policies", activeTab);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setHtmlContent(docSnap.data().htmlContent || "");
        } else {
          setHtmlContent("");
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchPolicy();
  }, [activeTab]);

  // 🔥 قراءة منفصلة لـ settings/siteSettings.returnPolicy.merchantReturnDays —
  // فقط لما تبويب "سياسة الاستبدال والاسترجاع" يكون مفتوح (مش على كل الصفحة)
  useEffect(() => {
    if (activeTab !== 'refund-policy') return;
    const fetchReturnDays = async () => {
      try {
        const db = getDb();
        const snap = await getDoc(doc(db, "settings", "siteSettings"));
        const days = snap.exists() ? snap.data()?.returnPolicy?.merchantReturnDays : null;
        setMerchantReturnDays(typeof days === 'number' ? days : 14);
      } catch (err) {
        console.error(err);
      }
    };
    fetchReturnDays();
  }, [activeTab]);

  // 🔥 حفظ مستقل لـ merchantReturnDays فقط — dot-notation، بيلمس نفس الحقل بس
  // جوه settings/siteSettings، بدون أي تأثير على باقي المستند (promotions, logoUrl, counters...)
  const handleSaveReturnDays = async () => {
    if (!Number.isFinite(Number(merchantReturnDays)) || Number(merchantReturnDays) < 0) {
      setReturnDaysToast({ ok: false, msg: "قيمة غير صحيحة" });
      return;
    }
    setSavingReturnDays(true);
    try {
      const db = getDb();
      await updateDoc(doc(db, "settings", "siteSettings"), {
        "returnPolicy.merchantReturnDays": Number(merchantReturnDays),
      });
      // نفس مسار الكاش الموجود بالفعل — بدون أي مفتاح KV جديد
      await fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'site_settings' }),
      });
      setReturnDaysToast({ ok: true, msg: "تم الحفظ ✓" });
    } catch (err) {
      console.error(err);
      setReturnDaysToast({ ok: false, msg: "فشل الحفظ" });
    } finally {
      setSavingReturnDays(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const db = getDb();
      await setDoc(doc(db, "Policies", activeTab), {
        htmlContent: htmlContent,
        updatedAt: new Date().toISOString()
      });

      // 🔥 مسح الكاش لتحديث السياسات في الفوتر وباقي الموقع فوراً
      try {
        const revalidateRes = await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET, 
            type: 'all' 
          })
        });
        
        // كشف الأخطاء الصامتة (مثل رفض الباسورد أو خطأ السيرفر)
        if (!revalidateRes.ok) {
          const errData = await revalidateRes.json();
          console.error("WIND Cache Warning: لم يتم مسح الكاش", errData);
        }
      } catch (e) {
        console.error("Cache Revalidate Network Error:", e);
      }

      alert("تم حفظ السياسة بنجاح ✅");
    } catch (error) {
      console.error("Save Error:", error);
      alert("خطأ في الحفظ");
    }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Settings className="text-[#008060]" /> إعدادات السياسات
            </h1>
            <p className="text-gray-500 text-sm font-bold">تحكم في محتوى الصفحات القانونية باستخدام HTML</p>
          </div>
          <button 
            onClick={handleSave}
            className="bg-[#008060] text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-[#006e52] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            حفظ التغييرات
          </button>
        </header>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden grid grid-cols-1 md:grid-cols-4">
          {/* القائمة الجانبية */}
          <div className="bg-gray-50 p-4 border-l border-gray-200 space-y-2">
            {policiesList.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveTab(p.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition-all ${
                  activeTab === p.id ? 'bg-white text-[#008060] shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p.icon} {p.title}
              </button>
            ))}
          </div>

          {/* محرر الـ HTML */}
          <div className="md:col-span-3 p-6">
            {activeTab === 'refund-policy' && (
              <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">
                  عدد أيام الاسترجاع (Structured Data لجوجل)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={merchantReturnDays}
                    onChange={(e) => setMerchantReturnDays(e.target.value)}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold"
                  />
                  <span className="text-xs text-gray-500">يوم</span>
                  <button
                    onClick={handleSaveReturnDays}
                    disabled={savingReturnDays}
                    className="flex items-center gap-1 bg-gray-900 text-white rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50"
                  >
                    {savingReturnDays ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    حفظ
                  </button>
                  {returnDaysToast && (
                    <span className={`text-xs font-bold ${returnDaysToast.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {returnDaysToast.msg}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  هذا الرقم يُستخدم في بيانات الموقع المهيكلة لجوجل (Structured Data) فقط — حدّثه ليطابق نص السياسة المكتوب أسفل هذا الحقل.
                </p>
              </div>
            )}
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-black text-gray-400 flex items-center gap-1 uppercase tracking-widest">
                <Code2 size={14} /> HTML Editor
              </span>
              <button 
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs font-bold text-[#005bd3] flex items-center gap-1 hover:underline"
              >
                <Eye size={14} /> {showPreview ? 'إخفاء المعاينة' : 'عرض المعاينة الحية'}
              </button>
            </div>

            {loading ? (
              <div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin text-gray-300" size={40} /></div>
            ) : (
              <div className="space-y-4">
                <textarea
                  dir="ltr"
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  placeholder="<h2>عنوان</h2> <p>محتوى السياسة...</p>"
                  className="w-full h-[400px] p-5 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm rounded-2xl outline-none focus:ring-2 ring-[#008060]/20 resize-none shadow-inner"
                />
                
                {showPreview && (
                  <div className="mt-4 p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                    <p className="text-xs font-bold text-gray-400 mb-4 text-center italic">-- معاينة سريعة (بدون ستايلات الموقع كاملة) --</p>
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}