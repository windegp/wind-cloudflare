"use client";

/**
 * WIND Shopping — Admin Inventory Panel
 * Phase 6 · Step 2 of 4
 *
 * الواجهة الكاملة لإدارة المخزون على مستوى الـ Variant (Color × Size).
 *
 * المبادئ المطبَّقة:
 *  - inventoryStatus هو مصدر الحقيقة الوحيد (Golden Rule)
 *  - لا يُشتق أي status من quantity تلقائياً
 *  - NEEDS_REVIEW تُعرَض كتحذير، الأدمن يعيّن الـ status الحقيقي
 *  - كل تغيير يُسجَّل في inventoryHistory subcollection
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { getDb } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  limit,
  getDoc,
} from "firebase/firestore/lite";
import {
  INVENTORY_STATUS,
  FINAL_BUSINESS_STATUSES,
  ADMIN_STATUS_LABELS,
  ADMIN_STATUS_COLORS,
  ADMIN_SELECTABLE_STATUSES,
  STATUSES_WITH_DATE,
  getVariantBehavior,
} from "@/lib/inventoryHelpers";
import {
  Search,
  Package,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  X,
  Check,
  Info,
  Edit,
  RotateCcw,
  AlertCircle,
  Filter,
} from "@/components/icons-extra";

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────
const REASON_OPTIONS = [
  { value: "restock",             label: "استلام بضاعة جديدة" },
  { value: "correction",          label: "تصحيح يدوي" },
  { value: "damage",              label: "تلف / فقدان" },
  { value: "return_resaleable",   label: "مرتجع — قابل للبيع" },
  { value: "return_damaged",      label: "مرتجع — تالف" },
  { value: "warehouse_adjustment",label: "تسوية مستودع" },
  { value: "other",               label: "سبب آخر" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildVariantKey(v) {
  return v.variantId || `${v.option1Value || ""}__${v.option2Value || ""}`;
}

function getColorValue(v, productOptions) {
  const n1 = (v.option1Name || "").toLowerCase();
  const n2 = (v.option2Name || "").toLowerCase();
  const isColor = (n) => n.includes("color") || n.includes("colour") || n.includes("لون");
  if (isColor(n1) && v.option1Value) return v.option1Value;
  if (isColor(n2) && v.option2Value) return v.option2Value;
  // fallback: product-level options
  const opts = productOptions || [];
  const colorIdx = opts.findIndex((o) => isColor((o.name || "").toLowerCase()));
  if (colorIdx === 0 && v.option1Value) return v.option1Value;
  if (colorIdx === 1 && v.option2Value) return v.option2Value;
  return v.option1Value || "—";
}

function getSizeValue(v, productOptions) {
  const n1 = (v.option1Name || "").toLowerCase();
  const n2 = (v.option2Name || "").toLowerCase();
  const isSize = (n) => n.includes("size") || n.includes("مقاس") || n.includes("حجم");
  if (isSize(n2) && v.option2Value) return v.option2Value;
  if (isSize(n1) && v.option1Value) return v.option1Value;
  const opts = productOptions || [];
  const sizeIdx = opts.findIndex((o) => isSize((o.name || "").toLowerCase()));
  if (sizeIdx === 0 && v.option1Value) return v.option1Value;
  if (sizeIdx === 1 && v.option2Value) return v.option2Value;
  return v.option2Value || "One Size";
}

function timeAgo(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, small = false }) {
  const colors = ADMIN_STATUS_COLORS[status] || ADMIN_STATUS_COLORS[INVENTORY_STATUS.OUT_OF_STOCK];
  const label = ADMIN_STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center rounded-full border font-medium
      ${small ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}
      ${colors.bg} ${colors.text} ${colors.border}`}>
      {label}
    </span>
  );
}

// ─── Variant Edit Drawer ──────────────────────────────────────────────────────
function VariantEditDrawer({ variant, product, onSave, onClose, lowStockThreshold }) {
  const [status, setStatus] = useState(
    FINAL_BUSINESS_STATUSES.has(variant.inventoryStatus)
      ? variant.inventoryStatus
      : INVENTORY_STATUS.OUT_OF_STOCK
  );
  const [qtyMode, setQtyMode] = useState("set"); // set | add | sub
  const [qtyAmount, setQtyAmount] = useState("");
  const [expectedDate, setExpectedDate] = useState(variant.expectedAvailabilityDate || "");
  const [note, setNote] = useState(variant.inventoryNote || "");
  const [reason, setReason] = useState("restock");
  const [saving, setSaving] = useState(false);

  const currentQty = typeof variant.quantity === "number" ? variant.quantity : 0;
  const showDate = STATUSES_WITH_DATE.has(status);

  const computedNewQty = useMemo(() => {
    const amt = parseInt(qtyAmount) || 0;
    if (qtyMode === "set") return Math.max(0, amt);
    if (qtyMode === "add") return Math.max(0, currentQty + amt);
    if (qtyMode === "sub") return Math.max(0, currentQty - amt);
    return currentQty;
  }, [qtyMode, qtyAmount, currentQty]);

  const qtyChanged = qtyAmount !== "" && computedNewQty !== currentQty;
  const showLowStockHint =
    qtyChanged &&
    variant.inventoryManaged !== false &&
    computedNewQty <= lowStockThreshold &&
    computedNewQty > 0 &&
    status === INVENTORY_STATUS.IN_STOCK;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        variant,
        newStatus: status,
        qtyChanged,
        newQty: qtyChanged ? computedNewQty : currentQty,
        qtyMode: qtyChanged ? qtyMode : null,
        qtyAmount: qtyChanged ? (parseInt(qtyAmount) || 0) : 0,
        reason: qtyChanged ? reason : null,
        expectedDate: showDate ? (expectedDate || null) : null,
        note,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const colorValue = getColorValue(variant, product.options);
  const sizeValue = getSizeValue(variant, product.options);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-black text-gray-900 text-sm">{product.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {colorValue} · {sizeValue}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* NEEDS_REVIEW Warning */}
          {variant.inventoryStatus === INVENTORY_STATUS.NEEDS_REVIEW && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex gap-2">
              <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-yellow-800 text-xs font-medium">
                هذا الـ variant لم يُراجَع بعد. عيّن الـ status الصحيح وسيختفي هذا التحذير.
              </p>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">حالة المخزون</label>
            <div className="grid grid-cols-2 gap-2">
              {ADMIN_SELECTABLE_STATUSES.map((s) => {
                const colors = ADMIN_STATUS_COLORS[s];
                const isSelected = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`text-right px-3 py-2.5 rounded-xl border text-xs font-medium transition-all
                      ${isSelected
                        ? `${colors.bg} ${colors.text} ${colors.border} ring-2 ring-offset-1 ring-current`
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}
                  >
                    {ADMIN_STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expected Date */}
          {showDate && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                تاريخ التوفر المتوقع (اختياري)
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">
              الكمية الحالية: <span className="text-black font-black">{currentQty}</span>
            </label>
            <div className="flex gap-2 mb-2">
              {[
                { v: "set", label: "تعيين" },
                { v: "add", label: "+ إضافة" },
                { v: "sub", label: "− خصم" },
              ].map((m) => (
                <button
                  key={m.v}
                  onClick={() => { setQtyMode(m.v); setQtyAmount(""); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all
                    ${qtyMode === m.v
                      ? "bg-black text-white border-black"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="0"
              value={qtyAmount}
              onChange={(e) => setQtyAmount(e.target.value)}
              placeholder={qtyMode === "set" ? "الكمية الجديدة" : "المقدار"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            {qtyChanged && (
              <p className="text-xs text-gray-500 mt-1.5">
                الكمية الجديدة: <span className="font-black text-black">{computedNewQty}</span>
              </p>
            )}
            {showLowStockHint && (
              <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex gap-2">
                <Info size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-yellow-800 text-xs">
                  الكمية وصلت حد التنبيه ({lowStockThreshold}).
                  هل تريد تغيير الحالة إلى <strong>كمية محدودة</strong>؟
                </p>
                <button
                  onClick={() => setStatus(INVENTORY_STATUS.LOW_STOCK)}
                  className="text-yellow-700 font-bold text-xs underline whitespace-nowrap"
                >
                  تغيير
                </button>
              </div>
            )}
          </div>

          {/* Reason (only if qty changed) */}
          {qtyChanged && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">سبب التغيير *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
              >
                {REASON_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Internal Note */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">
              ملاحظة داخلية (لا تظهر للعميل)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ملاحظة اختيارية..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Edit Panel ──────────────────────────────────────────────────────────
function BulkEditPanel({ product, selectedKeys, onSave, onClose, lowStockThreshold }) {
  const [status, setStatus] = useState("");
  const [qtyMode, setQtyMode] = useState("set");
  const [qtyAmount, setQtyAmount] = useState("");
  const [reason, setReason] = useState("restock");
  const [saving, setSaving] = useState(false);

  const count = selectedKeys.size;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        selectedKeys,
        newStatus: status || null,
        qtyMode: qtyAmount !== "" ? qtyMode : null,
        qtyAmount: qtyAmount !== "" ? (parseInt(qtyAmount) || 0) : 0,
        reason: qtyAmount !== "" ? reason : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900 text-sm">تعديل جماعي</h3>
            <p className="text-xs text-gray-500">{count} variant محدد</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">
              الحالة (اتركه فارغاً للإبقاء على الحالة الحالية)
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="">— لا تغيير —</option>
              {ADMIN_SELECTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>{ADMIN_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">الكمية</label>
            <div className="flex gap-2 mb-2">
              {[
                { v: "set", label: "تعيين" },
                { v: "add", label: "+ إضافة" },
                { v: "sub", label: "− خصم" },
              ].map((m) => (
                <button key={m.v} onClick={() => { setQtyMode(m.v); setQtyAmount(""); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all
                    ${qtyMode === m.v ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <input type="number" min="0" value={qtyAmount}
              onChange={(e) => setQtyAmount(e.target.value)}
              placeholder="اتركه فارغاً للإبقاء على الكمية الحالية"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          {qtyAmount !== "" && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">سبب التغيير *</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10">
                {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          )}

          {!status && qtyAmount === "" && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
              حدد تغييراً واحداً على الأقل (حالة أو كمية).
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
            إلغاء
          </button>
          <button onClick={handleSave} disabled={saving || (!status && qtyAmount === "")}
            className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-900 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            تطبيق على {count} variant
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Matrix Card ──────────────────────────────────────────────────────
function ProductCard({
  product, selectedKeys, onSelectKey, onEditVariant, onBulkAction, lowStockThreshold
}) {
  const [expanded, setExpanded] = useState(false);
  const variants = product.variants || [];

  const needsReviewCount = variants.filter(
    (v) => !FINAL_BUSINESS_STATUSES.has(v.inventoryStatus)
  ).length;

  // Group variants by color
  const colorGroups = useMemo(() => {
    const groups = {};
    variants.forEach((v) => {
      const color = getColorValue(v, product.options);
      if (!groups[color]) groups[color] = [];
      groups[color].push(v);
    });
    return groups;
  }, [variants, product.options]);

  const allKeys = variants.map(buildVariantKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Product Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => {
            e.stopPropagation();
            allKeys.forEach((k) => onSelectKey(k, e.target.checked));
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-black"
        />

        {product.images?.[0] && (
          <img src={product.images[0]} alt={product.title}
            className="w-10 h-10 object-cover rounded-lg border border-gray-100" />
        )}

        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{product.title}</p>
          <p className="text-xs text-gray-400">{variants.length} variant</p>
        </div>

        {needsReviewCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded-full">
            <AlertTriangle size={11} />
            {needsReviewCount} تحتاج مراجعة
          </span>
        )}

        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </div>

      {/* Variant Matrix */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Bulk Actions Bar */}
          {allKeys.some((k) => selectedKeys.has(k)) && (
            <div className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs">
              <span>{allKeys.filter((k) => selectedKeys.has(k)).length} محدد</span>
              <button
                onClick={() => onBulkAction(product, new Set(allKeys.filter((k) => selectedKeys.has(k))))}
                className="mr-auto bg-white text-black font-bold px-3 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                تعديل المحددين
              </button>
            </div>
          )}

          {/* Color groups */}
          {Object.entries(colorGroups).map(([color, colorVariants]) => {
            const allColorKeys = colorVariants.map(buildVariantKey);
            const allColorSelected = allColorKeys.every((k) => selectedKeys.has(k));

            return (
              <div key={color} className="border-t border-gray-50 first:border-t-0">
                {/* Color row header */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50/50">
                  <input
                    type="checkbox"
                    checked={allColorSelected}
                    onChange={(e) => allColorKeys.forEach((k) => onSelectKey(k, e.target.checked))}
                    className="w-3.5 h-3.5 accent-black"
                  />
                  {product.colorSwatches?.[color.toLowerCase()] && (
                    <img
                      src={product.colorSwatches[color.toLowerCase()]}
                      alt={color}
                      className="w-4 h-4 rounded-full object-cover border border-gray-200"
                    />
                  )}
                  <span className="text-xs font-bold text-gray-700 capitalize">{color}</span>
                </div>

                {/* Size rows */}
                {colorVariants.map((v) => {
                  const key = buildVariantKey(v);
                  const size = getSizeValue(v, product.options);
                  const qty = typeof v.quantity === "number" ? v.quantity : 0;
                  const status = v.inventoryStatus;
                  const isNeedsReview = !FINAL_BUSINESS_STATUSES.has(status);
                  const colors = ADMIN_STATUS_COLORS[status] ||
                    ADMIN_STATUS_COLORS[INVENTORY_STATUS.OUT_OF_STOCK];

                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-3 px-4 py-2.5 border-t border-gray-50
                        hover:bg-gray-50/50 transition-colors group
                        ${isNeedsReview ? "bg-yellow-50/30" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={(e) => onSelectKey(key, e.target.checked)}
                        className="w-3.5 h-3.5 accent-black"
                      />

                      {/* Size */}
                      <span className="text-xs text-gray-700 font-medium w-20 shrink-0">{size}</span>

                      {/* Status badge */}
                      <div className="flex-1">
                        <StatusBadge status={status} small />
                      </div>

                      {/* Qty */}
                      <span className="text-xs font-bold text-gray-900 w-10 text-center tabular-nums">
                        {qty}
                      </span>

                      {/* Updated */}
                      <span className="text-[10px] text-gray-400 w-20 text-left hidden sm:block">
                        {timeAgo(v.inventoryUpdatedAt)}
                      </span>

                      {/* Edit button */}
                      <button
                        onClick={() => onEditVariant(v, product)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 rounded-lg transition-all"
                      >
                        <Edit size={13} className="text-gray-600" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* No-variant products */}
          {variants.length === 0 && (
            <div className="px-4 py-4 text-center text-xs text-gray-400">
              <Info size={14} className="mx-auto mb-1 text-gray-300" />
              منتج بدون variants — يعتمد على product.quantity (legacy)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState(""); // "" | status value
  const [showOnlyNeedsReview, setShowOnlyNeedsReview] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editingVariant, setEditingVariant] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [bulkProduct, setBulkProduct] = useState(null);
  const [bulkKeys, setBulkKeys] = useState(new Set());
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [toast, setToast] = useState(null);

  // Stats
  const stats = useMemo(() => {
    let total = 0, needsReview = 0, inStock = 0, outOfStock = 0;
    products.forEach((p) => {
      (p.variants || []).forEach((v) => {
        total++;
        if (!FINAL_BUSINESS_STATUSES.has(v.inventoryStatus)) needsReview++;
        else if (getVariantBehavior(v.inventoryStatus).canPurchase) inStock++;
        else outOfStock++;
      });
    });
    return { total, needsReview, inStock, outOfStock };
  }, [products]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load products + siteSettings
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      const [productsSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, "products"), orderBy("createdAt", "desc"))),
        getDoc(doc(db, "settings", "siteSettings")),
      ]);

      const activeProducts = productsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.status === "Active");

      setProducts(activeProducts);

      const threshold = settingsSnap.data()?.inventory?.defaultLowStockThreshold;
      if (threshold != null) setLowStockThreshold(threshold);
    } catch (err) {
      showToast("خطأ في تحميل البيانات: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = !search ||
        p.title?.toLowerCase().includes(search.toLowerCase()) ||
        p.id?.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      const variants = p.variants || [];

      if (showOnlyNeedsReview) {
        return variants.some((v) => !FINAL_BUSINESS_STATUSES.has(v.inventoryStatus));
      }

      if (filterStatus) {
        return variants.some((v) => v.inventoryStatus === filterStatus);
      }

      return true;
    });
  }, [products, search, filterStatus, showOnlyNeedsReview]);

  // 🔥 Bug 2 Fix: بعد أي تحديث لـ inventoryStatus/quantity في Firestore،
  // لازم نمسح الـ KV cache الخاص بالمنتج (product_{id} مخزّن بدون TTL = يفضل قديم للأبد
  // لو محدش مسحه صراحة). بدون الاستدعاء ده، صفحة المنتج بتفضل تعرض النسخة القديمة
  // من الـ KV حتى لو Firestore اتحدّث فعلاً.
  const revalidateProduct = useCallback(async (productId) => {
    try {
      const res = await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "product", id: productId }),
      });
      if (!res.ok) {
        console.error("[Inventory] Revalidate failed:", res.status);
      }
    } catch (err) {
      // لا نمنع نجاح الحفظ في Firestore بسبب فشل الـ revalidate،
      // لكن نُظهر تحذيراً واضحاً للأدمن لأن صفحة المنتج قد تفضل قديمة.
      console.error("[Inventory] Revalidate request failed:", err);
      showToast("تم الحفظ لكن فشل تحديث الكاش — الصفحة قد تفضل قديمة", "error");
    }
  }, [showToast]);

  // Write history record
  const writeHistory = useCallback(async (productId, variantId, field, prev, next, changeType, reason) => {
    const db = getDb();
    await addDoc(collection(db, "products", productId, "inventoryHistory"), {
      variantId,
      fieldChanged: field,
      previousValue: prev,
      newValue: next,
      changeType: changeType || "set",
      reason: reason || null,
      changedAt: new Date().toISOString(),
    });
  }, []);

  // Save single variant
  const handleSaveVariant = useCallback(async ({
    variant, newStatus, qtyChanged, newQty, qtyMode, qtyAmount, reason, expectedDate, note,
  }) => {
    const product = editingProduct;
    const db = getDb();
    const productRef = doc(db, "products", product.id);
    const now = new Date().toISOString();
    const variantKey = buildVariantKey(variant);

    const updatedVariants = (product.variants || []).map((v) => {
      if (buildVariantKey(v) !== variantKey) return v;
      const updated = { ...v };

      // Status
      if (newStatus && newStatus !== v.inventoryStatus) {
        updated.inventoryStatus = newStatus;
        updated.inventoryUpdatedAt = now;
      }

      // Quantity
      if (qtyChanged) {
        updated.quantity = newQty;
        updated.inventoryUpdatedAt = now;
      }

      // Expected date
      updated.expectedAvailabilityDate = expectedDate !== undefined ? expectedDate : v.expectedAvailabilityDate;

      // Note
      if (note !== undefined) updated.inventoryNote = note;

      return updated;
    });

    await updateDoc(productRef, { variants: updatedVariants });

    // History records
    const vid = variant.variantId || variantKey;
    if (newStatus && newStatus !== variant.inventoryStatus) {
      await writeHistory(product.id, vid, "inventoryStatus", variant.inventoryStatus, newStatus, "set", null);
    }
    if (qtyChanged) {
      await writeHistory(product.id, vid, "quantity", variant.quantity, newQty, qtyMode, reason);
    }

    // 🔥 Bug 2 Fix: امسح KV cache بعد الحفظ عشان صفحة المنتج تتحدث فوراً
    await revalidateProduct(product.id);

    // Update local state
    setProducts((prev) => prev.map((p) =>
      p.id === product.id ? { ...p, variants: updatedVariants } : p
    ));

    showToast("تم الحفظ بنجاح ✓");
  }, [editingProduct, writeHistory, showToast, revalidateProduct]);

  // Save bulk
  const handleSaveBulk = useCallback(async ({ selectedKeys: keys, newStatus, qtyMode, qtyAmount, reason }) => {
    const product = bulkProduct;
    const db = getDb();
    const productRef = doc(db, "products", product.id);
    const now = new Date().toISOString();

    const updatedVariants = (product.variants || []).map((v) => {
      const key = buildVariantKey(v);
      if (!keys.has(key)) return v;
      const updated = { ...v };

      if (newStatus) {
        updated.inventoryStatus = newStatus;
        updated.inventoryUpdatedAt = now;
      }

      if (qtyMode && qtyAmount !== undefined) {
        const current = typeof v.quantity === "number" ? v.quantity : 0;
        const newQty =
          qtyMode === "set" ? Math.max(0, qtyAmount) :
          qtyMode === "add" ? Math.max(0, current + qtyAmount) :
          Math.max(0, current - qtyAmount);
        updated.quantity = newQty;
        updated.inventoryUpdatedAt = now;
      }

      return updated;
    });

    await updateDoc(productRef, { variants: updatedVariants });

    // History (one record per changed variant)
    for (const v of (product.variants || [])) {
      const key = buildVariantKey(v);
      if (!keys.has(key)) continue;
      const vid = v.variantId || key;
      if (newStatus && newStatus !== v.inventoryStatus) {
        await writeHistory(product.id, vid, "inventoryStatus", v.inventoryStatus, newStatus, "set", null);
      }
      if (qtyMode) {
        const current = typeof v.quantity === "number" ? v.quantity : 0;
        const newQty =
          qtyMode === "set" ? Math.max(0, qtyAmount) :
          qtyMode === "add" ? Math.max(0, current + qtyAmount) :
          Math.max(0, current - qtyAmount);
        await writeHistory(product.id, vid, "quantity", current, newQty, qtyMode, reason);
      }
    }

    // 🔥 Bug 2 Fix: امسح KV cache بعد الحفظ الجماعي كمان
    await revalidateProduct(product.id);

    setProducts((prev) => prev.map((p) =>
      p.id === product.id ? { ...p, variants: updatedVariants } : p
    ));
    setSelectedKeys(new Set());
    showToast(`تم تحديث ${keys.size} variant بنجاح ✓`);
  }, [bulkProduct, writeHistory, showToast, revalidateProduct]);

  const handleSelectKey = useCallback((key, checked) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f6f8] pb-20" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-2xl shadow-lg text-sm font-bold flex items-center gap-2
          ${toast.type === "error" ? "bg-red-500 text-white" : "bg-black text-white"}`}>
          {toast.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <Package size={24} className="text-[#008060]" />
              إدارة المخزون
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {stats.total} variant · {stats.needsReview > 0 && (
                <span className="text-yellow-600 font-bold">{stats.needsReview} تحتاج مراجعة · </span>
              )}
              {stats.inStock} متوفر · {stats.outOfStock} غير متوفر
            </p>
          </div>
          <button onClick={loadData} disabled={loading}
            className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
            <RefreshCw size={18} className={`text-gray-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Stats Bar */}
        {stats.needsReview > 0 && (
          <div
            className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4 flex items-center gap-3 cursor-pointer hover:bg-yellow-100 transition-colors"
            onClick={() => setShowOnlyNeedsReview((v) => !v)}
          >
            <AlertTriangle size={20} className="text-yellow-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-yellow-800 text-sm">
                {stats.needsReview} variant تحتاج مراجعة بعد الـ Migration
              </p>
              <p className="text-yellow-700 text-xs">اضغط لعرض هذه المنتجات فقط</p>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              showOnlyNeedsReview ? "bg-yellow-600 text-white" : "bg-yellow-200 text-yellow-800"
            }`}>
              {showOnlyNeedsReview ? "تصفية مفعّلة" : "تصفية"}
            </span>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="w-full pr-9 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setShowOnlyNeedsReview(false); }}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          >
            <option value="">كل الحالات</option>
            {ADMIN_SELECTABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{ADMIN_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Products List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="font-bold">لا توجد منتجات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                selectedKeys={selectedKeys}
                onSelectKey={handleSelectKey}
                onEditVariant={(v, prod) => { setEditingVariant(v); setEditingProduct(prod); }}
                onBulkAction={(prod, keys) => { setBulkProduct(prod); setBulkKeys(keys); }}
                lowStockThreshold={lowStockThreshold}
              />
            ))}
          </div>
        )}
      </div>

      {/* Single Edit Drawer */}
      {editingVariant && editingProduct && (
        <VariantEditDrawer
          variant={editingVariant}
          product={editingProduct}
          onSave={handleSaveVariant}
          onClose={() => { setEditingVariant(null); setEditingProduct(null); }}
          lowStockThreshold={lowStockThreshold}
        />
      )}

      {/* Bulk Edit Panel */}
      {bulkProduct && (
        <BulkEditPanel
          product={bulkProduct}
          selectedKeys={bulkKeys}
          onSave={handleSaveBulk}
          onClose={() => { setBulkProduct(null); setBulkKeys(new Set()); }}
          lowStockThreshold={lowStockThreshold}
        />
      )}
    </div>
  );
}
