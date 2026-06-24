"use client";

import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore/lite";
import {
  Tag, Plus, Trash2, Edit2, Save, AlertTriangle, CheckCircle2,
  Truck, RefreshCw, AlertCircle, Calendar, X, Search
} from "@/components/icons-extra";

export const dynamic = "force-dynamic";

const CODE_TYPES = [
  { value: "free_shipping", label: "شحن مجاني",       icon: "🚚" },
  { value: "percent",       label: "خصم نسبة %",      icon: "%" },
  { value: "fixed",         label: "خصم مبلغ ثابت",   icon: "ج.م" },
];

const USAGE_TYPES = [
  { value: "unlimited",          label: "غير محدود" },
  { value: "once_per_customer",  label: "مرة واحدة لكل عميل" },
  { value: "single_use",         label: "مرة واحدة فقط (كلي)" },
  { value: "limited",            label: "عدد محدد من الاستخدامات" },
];

const EMPTY_CODE = {
  code: "", type: "free_shipping", value: "", scope: "all",
  usageType: "unlimited", maxUses: 1, firstOrderOnly: false,
  active: true, expiresAt: "",
};

function StatusBadge({ active, expiresAt }) {
  const isExpired = expiresAt && new Date(expiresAt) < new Date();
  if (isExpired) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">منتهي</span>;
  if (!active)   return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500">معطّل</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600">نشط</span>;
}

function formatCodeValue(c) {
  if (c.type === "free_shipping") return "شحن مجاني";
  if (c.type === "percent")       return `${c.value}% خصم`;
  if (c.type === "fixed")         return `${c.value} ج.م خصم`;
  return "-";
}

function formatUsage(c) {
  if (c.usageType === "unlimited")         return "غير محدود";
  if (c.usageType === "once_per_customer") return "مرة/عميل";
  if (c.usageType === "single_use")        return `${c.usedCount || 0} / 1`;
  if (c.usageType === "limited")           return `${c.usedCount || 0} / ${c.maxUses}`;
  return "-";
}

export default function PromotionsPage() {
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [toast,          setToast]          = useState(null);
  const [search,         setSearch]         = useState("");

  const [shippingCost,            setShippingCost]            = useState(70);
  const [freeShippingThreshold,   setFreeShippingThreshold]   = useState(0);
  const [firstOrderEnabled,       setFirstOrderEnabled]       = useState(false);
  const [firstOrderDiscount,      setFirstOrderDiscount]      = useState(10);
  const [origSettings,            setOrigSettings]            = useState(null);

  const [codes,          setCodes]          = useState([]);
  const [showForm,       setShowForm]       = useState(false);
  const [editingCode,    setEditingCode]    = useState(null);
  const [form,           setForm]           = useState(EMPTY_CODE);
  const [formError,      setFormError]      = useState("");
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);
  const [conflicts,      setConflicts]      = useState([]);

  // ── جلب البيانات مباشرة من Firestore ────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();

      // إعدادات الشحن
      const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const promo = settingsData.promotions || { shippingCost: 70, freeShippingThreshold: 0 };
      setShippingCost(promo.shippingCost ?? 70);
      setFreeShippingThreshold(promo.freeShippingThreshold ?? 0);
      setFirstOrderEnabled(promo.firstOrderEnabled ?? false);
      setFirstOrderDiscount(promo.firstOrderDiscount ?? 10);
      setOrigSettings(promo);

      // الأكواد
      const codesSnap = await getDocs(collection(db, "promoCodes"));
      const list = codesSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        expiresAt: d.data().expiresAt
          ? (d.data().expiresAt.toDate
              ? d.data().expiresAt.toDate().toISOString().split("T")[0]
              : d.data().expiresAt)
          : null,
      }));
      setCodes(list);
    } catch (err) {
      showToast("فشل تحميل البيانات: " + err.message, false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── تحذيرات التعارض ──────────────────────────────────────────
  useEffect(() => {
    const warns = [];
    const activePct = codes.filter(c => c.active && c.type === "percent");
    if (activePct.length > 1)
      warns.push(`يوجد ${activePct.length} أكواد خصم نسبة% نشطة — سيُطبَّق الأعلى فقط عند الدفع`);
    if (Number(freeShippingThreshold) > 0) {
      const unlimitedFree = codes.filter(c => c.active && c.type === "free_shipping" && c.usageType === "unlimited");
      if (unlimitedFree.length > 0)
        warns.push("حد الشحن المجاني مفعّل مع كود شحن مجاني غير محدود — العميل سيحصل على الشحن مجاناً دائماً تقريباً");
    }
    setConflicts(warns);
  }, [codes, freeShippingThreshold]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── حفظ إعدادات الشحن مباشرة في Firestore ───────────────────
  const saveSettings = async () => {
    if (Number(shippingCost) < 0)            return showToast("تكلفة الشحن لا يمكن أن تكون سالبة", false);
    if (Number(freeShippingThreshold) < 0)   return showToast("الحد الأدنى للشحن المجاني لا يمكن أن يكون سالباً", false);
    setSaving(true);
    try {
      const db = getDb();
      // تحقق منطقي على خصم الطلب الأول
      if (firstOrderEnabled && (Number(firstOrderDiscount) <= 0 || Number(firstOrderDiscount) > 100)) {
        return showToast("نسبة خصم الطلب الأول يجب أن تكون بين 1% و100%", false);
      }
      await updateDoc(doc(db, "settings", "siteSettings"), {
        "promotions.shippingCost":          Number(shippingCost),
        "promotions.freeShippingThreshold": Number(freeShippingThreshold),
        "promotions.firstOrderEnabled":     Boolean(firstOrderEnabled),
        "promotions.firstOrderDiscount":    Number(firstOrderDiscount),
      });
      setOrigSettings({
        shippingCost: Number(shippingCost),
        freeShippingThreshold: Number(freeShippingThreshold),
        firstOrderEnabled: Boolean(firstOrderEnabled),
        firstOrderDiscount: Number(firstOrderDiscount),
      });
      // مسح KV cache عشان التغييرات تنعكس فوراً على الموقع
      await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "site_settings" }),
      });
      showToast("تم حفظ إعدادات الشحن ✓");
    } catch (err) {
      showToast("فشل الحفظ: " + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  // ── نموذج الكود ──────────────────────────────────────────────
  const openNewForm = () => {
    setEditingCode(null);
    setForm(EMPTY_CODE);
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (c) => {
    setEditingCode(c.id);
    setForm({
      code:           c.id,
      type:           c.type,
      value:          c.value,
      scope:          Array.isArray(c.scope) ? c.scope.join(", ") : c.scope,
      usageType:      c.usageType,
      maxUses:        c.maxUses || 1,
      firstOrderOnly: c.firstOrderOnly || false,
      active:         c.active !== false,
      expiresAt:      c.expiresAt || "",
    });
    setFormError("");
    setShowForm(true);
  };

  const validateForm = () => {
    if (!form.code.trim())                                      return "الكود مطلوب";
    if (!/^[A-Z0-9_-]+$/i.test(form.code.trim()))             return "الكود يحتوي على حروف غير مسموح بها (أحرف إنجليزية وأرقام فقط)";
    if (form.type !== "free_shipping" && (!form.value || Number(form.value) <= 0))
                                                                return "قيمة الخصم يجب أن تكون أكبر من صفر";
    if (form.type === "percent" && Number(form.value) > 100)    return "نسبة الخصم لا يمكن أن تتجاوز 100%";
    if ((form.usageType === "single_use" || form.usageType === "limited") && Number(form.maxUses) < 1)
                                                                return "عدد الاستخدامات يجب أن يكون 1 على الأقل";
    return null;
  };

  // ── حفظ الكود مباشرة في Firestore ───────────────────────────
  const saveCode = async () => {
    const err = validateForm();
    if (err) return setFormError(err);
    setFormError("");
    setSaving(true);

    const normalizedCode = form.code.trim().toUpperCase();
    const rawScope = form.scope.trim();
    const scope = rawScope === "all" || !rawScope
      ? "all"
      : rawScope.split(",").map(s => s.trim()).filter(Boolean);

    try {
      const db = getDb();

      // تحقق من الكود موجود مسبقاً عند الإنشاء
      if (!editingCode) {
        const existing = await getDoc(doc(db, "promoCodes", normalizedCode));
        if (existing.exists()) {
          setFormError("هذا الكود موجود بالفعل");
          setSaving(false);
          return;
        }
      }

      const promoData = {
        type:           form.type,
        value:          Number(form.value) || 0,
        scope,
        usageType:      form.usageType || "unlimited",
        maxUses:        Number(form.maxUses) || 1,
        firstOrderOnly: Boolean(form.firstOrderOnly),
        active:         Boolean(form.active),
        expiresAt:      form.expiresAt || null,
        updatedAt:      new Date().toISOString(),
      };

      if (!editingCode) {
        promoData.usedCount = 0;
        promoData.usedBy    = [];
        promoData.createdAt = new Date().toISOString();
        await setDoc(doc(db, "promoCodes", normalizedCode), promoData);
      } else {
        await updateDoc(doc(db, "promoCodes", normalizedCode), promoData);
      }

      showToast(editingCode ? "تم تعديل الكود ✓" : "تم إنشاء الكود ✓");
      setShowForm(false);
      fetchData();
    } catch (err) {
      showToast("فشل الحفظ: " + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  // ── حذف كود مباشرة من Firestore ─────────────────────────────
  const deleteCode = async (id) => {
    setSaving(true);
    try {
      const db = getDb();
      await deleteDoc(doc(db, "promoCodes", id));
      showToast("تم حذف الكود ✓");
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      showToast("فشل الحذف: " + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  const filteredCodes = codes.filter(c =>
    !search || c.id.toLowerCase().includes(search.toLowerCase())
  );

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const settingsChanged = origSettings &&
    (Number(shippingCost)           !== Number(origSettings.shippingCost)           ||
     Number(freeShippingThreshold)  !== Number(origSettings.freeShippingThreshold)  ||
     Boolean(firstOrderEnabled)     !== Boolean(origSettings.firstOrderEnabled)     ||
     Number(firstOrderDiscount)     !== Number(origSettings.firstOrderDiscount));

  return (
    <div className="min-h-screen bg-[#f4f6f8] font-sans" dir="rtl">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 ${
          toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* نافذة تأكيد الحذف */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" dir="rtl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                <Trash2 size={18} className="text-red-500"/>
              </div>
              <h3 className="font-black text-gray-900">حذف الكود</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              هل أنت متأكد من حذف الكود <strong className="text-gray-800">{deleteConfirm}</strong>؟ لا يمكن التراجع.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteCode(deleteConfirm)} disabled={saving}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition disabled:opacity-60">
                {saving ? "جاري الحذف..." : "حذف"}
              </button>
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إنشاء/تعديل كود */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4" dir="rtl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900">
                {editingCode ? `تعديل: ${editingCode}` : "إنشاء كود جديد"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X size={18} className="text-gray-500"/>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* الكود */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">الكود *</label>
                <input
                  value={form.code}
                  onChange={e => setField("code", e.target.value.toUpperCase())}
                  disabled={!!editingCode}
                  placeholder="مثال: SUMMER20"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold tracking-wider uppercase focus:outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {/* نوع الكود */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">نوع الخصم *</label>
                <div className="grid grid-cols-3 gap-2">
                  {CODE_TYPES.map(t => (
                    <button key={t.value} onClick={() => setField("type", t.value)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition ${
                        form.type === t.value
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* القيمة */}
              {form.type !== "free_shipping" && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    {form.type === "percent" ? "نسبة الخصم (%)" : "مبلغ الخصم (ج.م)"} *
                  </label>
                  <input
                    type="number" min="1" max={form.type === "percent" ? 100 : undefined}
                    value={form.value}
                    onChange={e => setField("value", e.target.value)}
                    placeholder={form.type === "percent" ? "مثال: 15" : "مثال: 50"}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                  />
                </div>
              )}

              {/* نطاق المنتجات */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">نطاق التطبيق</label>
                <input
                  value={form.scope}
                  onChange={e => setField("scope", e.target.value)}
                  placeholder='all = كل المنتجات   أو   handle1, handle2 لمنتجات محددة'
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  اكتب <code className="bg-gray-100 px-1 rounded">all</code> لكل المنتجات، أو handles مفصولة بفاصلة للمنتجات المحددة
                </p>
              </div>

              {/* نوع الاستخدام */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">قيود الاستخدام</label>
                <select
                  value={form.usageType}
                  onChange={e => setField("usageType", e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 bg-white"
                >
                  {USAGE_TYPES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>

              {/* عدد الاستخدامات */}
              {(form.usageType === "single_use" || form.usageType === "limited") && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">عدد الاستخدامات المسموحة</label>
                  <input
                    type="number" min="1"
                    value={form.maxUses}
                    onChange={e => setField("maxUses", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                  />
                </div>
              )}

              {/* أول طلب فقط */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setField("firstOrderOnly", !form.firstOrderOnly)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center ${form.firstOrderOnly ? "bg-emerald-500" : "bg-gray-200"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${form.firstOrderOnly ? "translate-x-[-4px] mr-auto ml-1" : ""}`}/>
                </div>
                <span className="text-sm font-bold text-gray-700">للطلب الأول فقط (عميل جديد)</span>
              </label>

              {/* تاريخ الانتهاء */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">تاريخ انتهاء الصلاحية (اختياري)</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={e => setField("expiresAt", e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">اتركه فارغاً للكود الدائم</p>
              </div>

              {/* نشط/معطل */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setField("active", !form.active)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center ${form.active ? "bg-emerald-500" : "bg-gray-300"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${form.active ? "translate-x-[-4px] mr-auto ml-1" : ""}`}/>
                </div>
                <span className="text-sm font-bold text-gray-700">الكود نشط</span>
              </label>

              {formError && (
                <div className="flex items-center gap-2 text-red-600 text-xs font-bold bg-red-50 p-3 rounded-xl">
                  <AlertCircle size={14}/> {formError}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={saveCode} disabled={saving}
                className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition flex items-center justify-center gap-2 disabled:opacity-60">
                <Save size={15}/>
                {saving ? "جاري الحفظ..." : editingCode ? "حفظ التعديلات" : "إنشاء الكود"}
              </button>
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ المحتوى الرئيسي ══ */}
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-200">
              <Tag className="text-[#008060]" size={22}/>
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">العروض والخصومات</h1>
              <p className="text-xs text-gray-500 font-medium mt-0.5">إدارة أكواد الخصم وإعدادات الشحن</p>
            </div>
          </div>
          <button onClick={fetchData} className="p-2 hover:bg-white rounded-xl transition text-gray-400 hover:text-gray-700">
            <RefreshCw size={16}/>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2"/> جاري التحميل...
          </div>
        ) : (
          <>
            {/* تحذيرات التعارض */}
            {conflicts.length > 0 && (
              <div className="space-y-2">
                {conflicts.map((w, i) => (
                  <div key={i} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0"/>
                    <p className="text-sm text-amber-800 font-medium">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── إعدادات الشحن ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Truck size={18} className="text-gray-500"/>
                <h2 className="font-black text-gray-800">إعدادات الشحن العامة</h2>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-2">تكلفة الشحن الثابتة (ج.م)</label>
                  <input
                    type="number" min="0"
                    value={shippingCost}
                    onChange={e => setShippingCost(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-gray-400"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">المبلغ الثابت المضاف على كل طلب</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-2">شحن مجاني عند الطلبات فوق (ج.م)</label>
                  <input
                    type="number" min="0"
                    value={freeShippingThreshold}
                    onChange={e => setFreeShippingThreshold(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-gray-400"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {Number(freeShippingThreshold) === 0
                      ? "🚫 معطّل — لا يوجد شحن مجاني تلقائي"
                      : `✅ الطلبات فوق ${freeShippingThreshold} ج.م تحصل على شحن مجاني`}
                  </p>
                </div>
              </div>

              {/* ── خصم الطلب الأول ── */}
              <div className="sm:col-span-2 border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold text-gray-700">خصم الطلب الأول (عملاء جدد)</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">يُطبَّق تلقائياً على أي عميل طلبه الأول بناءً على الإيميل أو التليفون</p>
                  </div>
                  <div onClick={() => setFirstOrderEnabled(p => !p)}
                    className={`w-11 h-6 rounded-full transition-colors cursor-pointer flex items-center ${firstOrderEnabled ? "bg-emerald-500" : "bg-gray-200"}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${firstOrderEnabled ? "translate-x-[-4px] mr-auto ml-1" : ""}`}/>
                  </div>
                </div>
                {firstOrderEnabled && (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">نسبة الخصم %</label>
                      <input
                        type="number" min="1" max="100"
                        value={firstOrderDiscount}
                        onChange={e => setFirstOrderDiscount(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-gray-400"
                        placeholder="مثال: 10"
                      />
                    </div>
                    <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <p className="text-[10px] text-emerald-700 font-bold">✅ نشط</p>
                      <p className="text-xs text-emerald-800 font-black mt-0.5">{firstOrderDiscount}% خصم للعملاء الجدد</p>
                      <p className="text-[10px] text-emerald-600 mt-1">يُتحقق عبر الإيميل والتليفون</p>
                    </div>
                  </div>
                )}
              </div>

              {Number(freeShippingThreshold) > 0 && Number(freeShippingThreshold) <= Number(shippingCost) && (
                <div className="mx-6 mb-4 flex items-center gap-2 text-amber-700 text-xs font-bold bg-amber-50 border border-amber-200 p-3 rounded-xl">
                  <AlertTriangle size={13}/> حد الشحن المجاني أقل من أو يساوي تكلفة الشحن — الشحن سيكون مجانياً دائماً تقريباً
                </div>
              )}

              <div className="px-6 pb-6">
                <button onClick={saveSettings} disabled={saving || !settingsChanged}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition disabled:opacity-40 disabled:cursor-not-allowed">
                  <Save size={14}/>
                  {saving ? "جاري الحفظ..." : "حفظ إعدادات الشحن"}
                </button>
                {!settingsChanged && origSettings && (
                  <p className="text-[10px] text-gray-400 mt-2">لا توجد تغييرات للحفظ</p>
                )}
              </div>
            </div>

            {/* ── أكواد الخصم ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={18} className="text-gray-500"/>
                  <h2 className="font-black text-gray-800">أكواد الخصم</h2>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-bold">{codes.length} كود</span>
                </div>
                <button onClick={openNewForm}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition">
                  <Plus size={14}/> كود جديد
                </button>
              </div>

              {codes.length > 4 && (
                <div className="px-6 py-3 border-b border-gray-100">
                  <div className="relative">
                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالكود..."
                      className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"/>
                  </div>
                </div>
              )}

              {filteredCodes.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Tag size={32} className="mx-auto mb-3 opacity-30"/>
                  <p className="text-sm font-bold">{search ? "لا توجد نتائج" : "لا توجد أكواد — أضف كوداً جديداً"}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredCodes.map(c => (
                    <div key={c.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-black text-gray-900 tracking-wider">{c.id}</code>
                          <StatusBadge active={c.active} expiresAt={c.expiresAt}/>
                          {c.firstOrderOnly && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600">أول طلب</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>{formatCodeValue(c)}</span>
                          <span className="text-gray-300">·</span>
                          <span>{formatUsage(c)}</span>
                          {c.scope !== "all" && Array.isArray(c.scope) && (
                            <><span className="text-gray-300">·</span><span className="text-blue-500">{c.scope.length} منتج محدد</span></>
                          )}
                          {c.expiresAt && (
                            <><span className="text-gray-300">·</span>
                            <span className="flex items-center gap-1"><Calendar size={10}/> {c.expiresAt}</span></>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => openEditForm(c)}
                          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="تعديل">
                          <Edit2 size={15}/>
                        </button>
                        <button onClick={() => setDeleteConfirm(c.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="حذف">
                          <Trash2 size={15}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ملاحظة الأولوية */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
              <h3 className="text-sm font-black text-blue-800 mb-3 flex items-center gap-2">
                <AlertCircle size={15}/> ترتيب الأولوية عند تطبيق الخصومات
              </h3>
              <div className="space-y-2 text-xs text-blue-700 font-medium">
                {[
                  "كود شحن مجاني — يلغي تكلفة الشحن دائماً",
                  "شحن مجاني الباقة (bundleFreeShipping في المنتج) — مستقل تماماً",
                  "حد الشحن المجاني العام (الطلبات فوق X ج.م) — يُطبَّق تلقائياً",
                  "كود خصم نسبة% أو مبلغ ثابت — يُطبَّق على المنتجات المحددة في نطاقه",
                  "خصم الباقة (bundleDiscount في المنتج) — مستقل ولا يتجمع مع كود الخصم%",
                ].map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center font-black text-[10px] shrink-0">{i + 1}</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
