"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDb } from "@/lib/firebase";
import {
  collection, doc, getDocs, setDoc, deleteDoc,
} from "firebase/firestore/lite";
import {
  Tag, Plus, Trash2, Save, ChevronLeft, Loader2,
  CheckCircle, AlertCircle, Eye, EyeOff,
} from "@/components/icons-extra";

export const dynamic = "force-dynamic";

const TYPES = [
  { value: "percent",       label: "نسبة %",         hint: "مثال: 10 تعني خصم 10% من سعر المنتجات" },
  { value: "fixed",         label: "مبلغ ثابت ج.م",  hint: "مثال: 50 تعني طرح 50 ج.م من الإجمالي" },
  { value: "free_shipping", label: "شحن مجاني",       hint: "يُلغي رسوم الشحن بالكامل" },
];

const USAGE_TYPES = [
  { value: "unlimited",         label: "غير محدود" },
  { value: "limited",           label: "عدد محدود (للكل)" },
  { value: "once_per_customer", label: "مرة لكل عميل" },
  { value: "single_use",        label: "استخدام واحد فقط" },
];

const empty = () => ({
  _key:          Math.random().toString(36).slice(2),
  code:          "",
  type:          "percent",
  value:         "",
  active:        true,
  firstOrderOnly: false,
  usageType:     "unlimited",
  maxUses:       "",
  usedCount:     0,
  label:         "",
  expiresAt:     "",
});

function TypeBadge({ type }) {
  const map = {
    percent:       { bg: "bg-blue-50",   text: "text-blue-700",   label: "% خصم" },
    fixed:         { bg: "bg-purple-50", text: "text-purple-700", label: "ج.م خصم" },
    free_shipping: { bg: "bg-green-50",  text: "text-green-700",  label: "شحن مجاني" },
  };
  const s = map[type] || { bg: "bg-gray-100", text: "text-gray-500", label: type };
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function CodeCard({ code, onChange, onDelete }) {
  const typeInfo = TYPES.find((t) => t.value === code.type);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={code.type} />
          {code.code && (
            <span className="font-mono font-black text-sm text-gray-800 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg">
              {code.code}
            </span>
          )}
          {code.usedCount > 0 && (
            <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
              استُخدم {code.usedCount} مرة
            </span>
          )}
          {code.label && (
            <span className="text-xs text-gray-400 hidden sm:block">{code.label}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...code, active: !code.active })}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              code.active
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
            }`}
          >
            {code.active ? <Eye size={12} /> : <EyeOff size={12} />}
            {code.active ? "مفعّل" : "معطّل"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(code._key)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Main fields ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">اسم الكود *</label>
          <input
            type="text"
            placeholder="WIND10"
            value={code.code}
            onChange={(e) => onChange({ ...code, code: e.target.value.toUpperCase().replace(/\s/g, "") })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono uppercase outline-none focus:border-gray-400 bg-gray-50 transition"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">النوع *</label>
          <select
            value={code.type}
            onChange={(e) => onChange({ ...code, type: e.target.value, value: "" })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-gray-50 appearance-none transition"
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">
            {code.type === "percent" ? "النسبة %" : code.type === "fixed" ? "المبلغ ج.م" : "—"}
          </label>
          <input
            type="number"
            placeholder={code.type === "percent" ? "10" : code.type === "fixed" ? "50" : "—"}
            value={code.value}
            disabled={code.type === "free_shipping"}
            onChange={(e) => onChange({ ...code, value: e.target.value })}
            min="0"
            max={code.type === "percent" ? "100" : undefined}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">نوع الاستخدام</label>
          <select
            value={code.usageType}
            onChange={(e) => onChange({ ...code, usageType: e.target.value, maxUses: "" })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-gray-50 appearance-none transition"
          >
            {USAGE_TYPES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Extra fields ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">ملاحظة داخلية</label>
          <input
            type="text"
            placeholder="مثال: عرض أول طلب يونيو"
            value={code.label}
            onChange={(e) => onChange({ ...code, label: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-gray-50 transition"
          />
        </div>
        {["limited", "single_use"].includes(code.usageType) && (
          <div>
            <label className="text-[11px] font-bold text-gray-500 mb-1 block">الحد الأقصى</label>
            <input
              type="number"
              placeholder="100"
              value={code.maxUses}
              onChange={(e) => onChange({ ...code, maxUses: e.target.value })}
              min="1"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-gray-50 transition"
            />
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">ينتهي في</label>
          <input
            type="date"
            value={code.expiresAt}
            onChange={(e) => onChange({ ...code, expiresAt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-gray-50 transition"
          />
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={code.firstOrderOnly}
              onChange={(e) => onChange({ ...code, firstOrderOnly: e.target.checked })}
              className="w-4 h-4 accent-gray-800"
            />
            <span className="text-xs font-bold text-gray-600">أول طلب فقط</span>
          </label>
        </div>
      </div>

      {typeInfo && <p className="text-[10px] text-gray-400">{typeInfo.hint}</p>}
    </div>
  );
}

export default function DiscountsAdminPage() {
  const [codes,   setCodes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  // الكودات المحذوفة لازم تتمسح من Firestore عند الحفظ
  const [deletedCodes, setDeletedCodes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const db   = getDb();
        const snap = await getDocs(collection(db, "promoCodes"));
        const loaded = snap.docs.map((d) => ({
          _key:          d.id,
          code:          d.id,
          type:          d.data().type           || "percent",
          value:         d.data().value          != null ? String(d.data().value) : "",
          active:        d.data().active          !== false,
          firstOrderOnly: d.data().firstOrderOnly || false,
          usageType:     d.data().usageType       || "unlimited",
          maxUses:       d.data().maxUses         != null ? String(d.data().maxUses) : "",
          usedCount:     d.data().usedCount        || 0,
          label:         d.data().label            || "",
          expiresAt:     d.data().expiresAt
            ? (d.data().expiresAt.toDate
                ? d.data().expiresAt.toDate().toISOString().split("T")[0]
                : String(d.data().expiresAt).split("T")[0])
            : "",
        }));
        setCodes(loaded);
      } catch (err) {
        showToast("error", "فشل التحميل: " + err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAdd    = ()        => setCodes((p) => [...p, empty()]);
  const handleChange = (updated) => setCodes((p) => p.map((c) => (c._key === updated._key ? updated : c)));
  const handleDelete = (key) => {
    const code = codes.find((c) => c._key === key);
    // لو الكود اسمه مطابق لـ _key، معناه جديد ولم يُحفظ بعد
    if (code && code.code) setDeletedCodes((p) => [...p, code.code]);
    setCodes((p) => p.filter((c) => c._key !== key));
  };

  const handleSave = async () => {
    for (const c of codes) {
      if (!c.code.trim()) { showToast("error", "كل الكودات لازم يكون لها اسم"); return; }
      if (c.type !== "free_shipping" && (isNaN(Number(c.value)) || Number(c.value) <= 0)) {
        showToast("error", `الكود "${c.code}" محتاج قيمة أكبر من صفر`); return;
      }
    }
    const names = codes.map((c) => c.code.toLowerCase().trim());
    if (new Set(names).size !== names.length) { showToast("error", "في كودين بنفس الاسم"); return; }

    setSaving(true);
    try {
      const db = getDb();
      // حفظ / تحديث
      await Promise.all(
        codes.map((c) => {
          const data = {
            type:           c.type,
            value:          c.type === "free_shipping" ? 0 : Number(c.value),
            active:         c.active !== false,
            firstOrderOnly: c.firstOrderOnly || false,
            usageType:      c.usageType || "unlimited",
            usedCount:      c.usedCount || 0,
            label:          c.label || "",
          };
          if (["limited", "single_use"].includes(c.usageType) && c.maxUses) {
            data.maxUses = Number(c.maxUses);
          } else {
            data.maxUses = null;
          }
          data.expiresAt = c.expiresAt ? new Date(c.expiresAt + "T23:59:59") : null;
          return setDoc(doc(db, "promoCodes", c.code.toUpperCase()), data);
        })
      );
      // حذف المحذوفة
      if (deletedCodes.length > 0) {
        await Promise.all(
          deletedCodes
            .filter(Boolean)
            .map((code) => deleteDoc(doc(db, "promoCodes", code.toUpperCase())))
        );
        setDeletedCodes([]);
      }
      showToast("success", `تم حفظ ${codes.length} كود بنجاح ✅`);
    } catch (err) {
      showToast("error", "حدث خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const stats = {
    total:    codes.length,
    active:   codes.filter((c) => c.active !== false).length,
    percent:  codes.filter((c) => c.type === "percent").length,
    freeShip: codes.filter((c) => c.type === "free_shipping").length,
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-4xl mx-auto">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}>
            {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <Link href="/admin/settings" className="p-2 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition">
              <ChevronLeft size={18} className="text-gray-600" />
            </Link>
            <div className="p-2 bg-white rounded-xl shadow-sm">
              <Tag className="text-[#008060]" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">كودات الخصم</h1>
              <p className="text-gray-400 text-xs font-bold">أضف وعدّل كودات الخصم — تُطبّق فوراً على الـ checkout</p>
            </div>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "إجمالي",    value: stats.total,    color: "text-gray-800" },
            { label: "مفعّلة",    value: stats.active,   color: "text-green-600" },
            { label: "خصم %",     value: stats.percent,  color: "text-blue-600" },
            { label: "شحن مجاني", value: stats.freeShip, color: "text-emerald-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 font-bold mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <Loader2 size={22} className="animate-spin" />
            <span className="font-bold text-sm">جاري التحميل...</span>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {codes.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
                <Tag size={36} className="text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-400">لا يوجد كودات بعد</p>
                <p className="text-xs text-gray-300 mt-1">اضغط «إضافة كود» لإنشاء أول كود</p>
              </div>
            )}
            {codes.map((code) => (
              <CodeCard key={code._key} code={code} onChange={handleChange} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl border-2 border-dashed border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 text-gray-600 font-bold text-sm transition-all"
          >
            <Plus size={16} />
            إضافة كود خصم جديد
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 sm:flex-none sm:min-w-[180px] flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-[#008060] hover:bg-[#006b52] text-white font-black text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
          </button>
        </div>

        {/* Info */}
        <div className="mt-6 bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm space-y-1 text-amber-800">
          <p className="font-black text-amber-900 mb-2">📌 ملاحظات</p>
          <p>• <strong>نسبة %</strong> — يُطرح من سعر المنتجات (لا يشمل الشحن)</p>
          <p>• <strong>مبلغ ثابت</strong> — يُطرح مبلغ محدد من إجمالي المنتجات</p>
          <p>• <strong>شحن مجاني</strong> — يُلغي رسوم الشحن بالكامل</p>
          <p>• <strong>مرة لكل عميل</strong> — يتحقق من الإيميل أو رقم الهاتف</p>
          <p>• <strong>أول طلب فقط</strong> — يتحقق من سجل العميل في Firestore</p>
          <p>• الكودات تعمل فوراً بعد الحفظ دون إعادة نشر</p>
        </div>

      </div>
    </div>
  );
}
