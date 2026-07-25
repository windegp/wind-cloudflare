"use client";

import { useState, useEffect } from "react";
import { getDb } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore/lite";
import { Truck, MapPin, Save, Loader2, AlertCircle, CheckCircle2 } from "@/components/icons-extra";

export const dynamic = "force-dynamic";

// نفس قائمة الـ 27 محافظة المستخدمة فعلياً في src/app/checkout/page.js (select المحافظة)
const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "القليوبية", "الشرقية", "المنوفية",
  "الغربية", "البحيرة", "دمياط", "بورسعيد", "السويس", "الإسماعيلية", "كفر الشيخ",
  "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان",
  "البحر الأحمر", "الوادي الجديد", "مطروح", "شمال سيناء", "جنوب سيناء"
];

export default function ShippingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // السعر العام الحالي (fallback) — نفس الحقل اللي بتديره صفحة admin/promotions
  const [generalShippingCost, setGeneralShippingCost] = useState(70);

  // خريطة: اسم المحافظة → سعر مخصص (فاضي/undefined = استخدام السعر العام)
  const [governorateRates, setGovernorateRates] = useState({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const db = getDb();
        const snap = await getDoc(doc(db, "settings", "siteSettings"));
        const promo = snap.exists() ? (snap.data().promotions || {}) : {};
        setGeneralShippingCost(promo.shippingCost ?? 70);
        setGovernorateRates(promo.shippingCostByGovernorate || {});
      } catch (err) {
        console.error(err);
        setToast({ ok: false, msg: "فشل تحميل الإعدادات" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleRateChange = (gov, value) => {
    setGovernorateRates((prev) => {
      const next = { ...prev };
      if (value === "" || value === null) {
        // حقل فاضي = مفيش سعر مخصص لهذه المحافظة → استخدام السعر العام
        delete next[gov];
      } else {
        next[gov] = Number(value);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (Number(generalShippingCost) < 0) {
      setToast({ ok: false, msg: "تكلفة الشحن العامة لا يمكن أن تكون سالبة" });
      return;
    }
    const invalid = Object.entries(governorateRates).find(([, v]) => Number(v) < 0);
    if (invalid) {
      setToast({ ok: false, msg: `تكلفة شحن ${invalid[0]} لا يمكن أن تكون سالبة` });
      return;
    }

    setSaving(true);
    try {
      const db = getDb();
      // نفس نمط dot-notation المستخدم في admin/promotions/page.js — بيحدّث الحقول
      // المطلوبة بس جوه promotions، وبيسيب باقي المستند زي ما هو
      await updateDoc(doc(db, "settings", "siteSettings"), {
        "promotions.shippingCost": Number(generalShippingCost),
        "promotions.shippingCostByGovernorate": governorateRates,
      });

      // 🔥 نفس مسار الكاش الموجود بالفعل — بدون أي مفتاح KV جديد
      await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "site_settings" }),
      });

      setToast({ ok: true, msg: "تم حفظ أسعار الشحن ✓" });
    } catch (err) {
      console.error(err);
      setToast({ ok: false, msg: "فشل الحفظ: " + err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <Truck size={22} />
        <h1 className="text-xl font-black text-gray-900">تكلفة الشحن حسب المحافظة</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        اسيب حقل المحافظة فاضي لو عايز يستخدم السعر العام تلقائياً. أي محافظة ليها سعر مخصص هيتم استخدامه بدل السعر العام (مش بالإضافة له).
      </p>

      {toast && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold ${
            toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="block text-xs font-bold text-gray-500 mb-2">
          السعر العام (Fallback) — يُستخدم لأي محافظة بدون سعر مخصص
        </label>
        <div className="relative w-40">
          <input
            type="number"
            min="0"
            value={generalShippingCost}
            onChange={(e) => setGeneralShippingCost(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">ج.م</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {GOVERNORATES.map((gov) => (
          <div key={gov} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <MapPin size={14} className="text-gray-400" />
              {gov}
            </div>
            <div className="relative w-32">
              <input
                type="number"
                min="0"
                placeholder={String(generalShippingCost)}
                value={governorateRates[gov] ?? ""}
                onChange={(e) => handleRateChange(gov, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-left"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">ج.م</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg py-3 text-sm font-bold disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} /> : <Save size={16} />}
        {saving ? "جارِ الحفظ..." : "حفظ أسعار الشحن"}
      </button>
    </div>
  );
}
