"use client";

import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore/lite";
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const db = getDb();
      await setDoc(doc(db, "Policies", activeTab), {
        htmlContent: htmlContent,
        lastUpdate: new Date().toISOString(),
        title: policiesList.find(p => p.id === activeTab).title
      }, { merge: true });
      alert("تم حفظ كود HTML بنجاح!");
    } catch (err) { alert("خطأ في الحفظ"); }
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