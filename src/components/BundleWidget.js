"use client";
import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

// ─── لوحة التحكم ──────────────────────────────────────────────
const DEFAULT_DISCOUNT_PERCENT   = 0;
const DEFAULT_FREE_SHIPPING_LIMIT = 1850;

// ─── Helpers ──────────────────────────────────────────────────
// ✅ FIX 2: أرقام إنجليزية (en-EG بدل ar-EG)
const fmt = (n) =>
  Number(n).toLocaleString("en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " LE";

const applyDiscount = (price, pct) =>
  pct > 0 ? price * (1 - pct / 100) : price;

// ─── Component ────────────────────────────────────────────────
export default function BundleWidget({ product, onOpenQuickView }) {
  const DISCOUNT  = parseFloat(product?.metafields?.bundleDiscount ?? DEFAULT_DISCOUNT_PERCENT);
  const LIMIT     = parseFloat(product?.metafields?.bundleFreeShipping ?? DEFAULT_FREE_SHIPPING_LIMIT);
  const TITLE     = product?.metafields?.bundleTitle || "منتجات يتم شراؤها معاً";
  const SUBTITLE  = product?.metafields?.bundleSubtitle || "";

  const handles = (product?.metafields?.bundleProducts || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!handles.length) return null;

  return <BundleWidgetInner product={product} handles={handles} discount={DISCOUNT} limit={LIMIT} title={TITLE} subtitle={SUBTITLE} onOpenQuickView={onOpenQuickView} />;
}

// ─── Inner ──────────────────────────────────────────────────
function BundleWidgetInner({ product, handles, discount, limit, title, subtitle, onOpenQuickView }) {
  const [upsells, setUpsells]     = useState([]);
  const [loading, setLoading]     = useState(true);

  const mainPrice = parseFloat(String(product?.price || "0").replace(/[^0-9.]/g, ""));
  const [mainQty, setMainQty]     = useState(1);

  const [upsellStates, setUpsellStates] = useState([]);

  // ─── جلب بيانات المنتجات من Firebase ─────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const db = getDb();
        const results = await Promise.all(
          handles.map(async (handle) => {
            try {
              const snap = await getDoc(doc(db, "products", handle));
              if (!snap.exists()) return null;
              const d = snap.data();

              let variants = [];
              if (d.options && Array.isArray(d.options)) {
                const colorOpt = d.options.find(o => o.name?.toLowerCase().includes("color") || o.name?.includes("لون"));
                const sizeOpt  = d.options.find(o => o.name?.toLowerCase().includes("size") || o.name?.includes("مقاس"));
                const colors   = colorOpt?.values?.split(",").map(s => s.trim()).filter(Boolean) || [""];
                const sizes    = sizeOpt?.values?.split(",").map(s => s.trim()).filter(Boolean)  || [""];
                colors.forEach(color => {
                  sizes.forEach(size => {
                    const label = [color, size].filter(Boolean).join(" / ") || "Default";
                    const img   = (color && d.colorSwatches?.[color]) || d.images?.[0] || "";
                    variants.push({ label, img, price: parseFloat(d.price || 0), available: true, color, size });
                  });
                });
              }
              if (!variants.length) {
                variants.push({
                  label: "Default",
                  img: d.images?.[0] || "",
                  price: parseFloat(d.price || 0),
                  available: (d.quantity > 0) || d.sellOutOfStock === "Yes",
                  color: "",
                  size: "",
                });
              }

              // استخراج الألوان والمقاسات المتاحة للكارت
              let colors = [];
              let sizes = [];
              if (d.options && Array.isArray(d.options)) {
                const colorOpt = d.options.find(o => o.name?.toLowerCase().includes("color") || o.name?.includes("لون"));
                const sizeOpt  = d.options.find(o => o.name?.toLowerCase().includes("size") || o.name?.includes("مقاس"));
                colors = colorOpt?.values?.split(",").map(s => s.trim()).filter(Boolean) || [];
                sizes  = sizeOpt?.values?.split(",").map(s => s.trim()).filter(Boolean) || [];
              }

              return {
                id:     snap.id,
                title:  d.title || handle,
                images: d.images || [],
                variants,
                colors,
                sizes,
                colorSwatches: d.colorSwatches || {},
                rawData: d,
              };
            } catch (e) {
              console.warn("BundleWidget: فشل تحميل", handle, e);
              return null;
            }
          })
        );
        if (cancelled) return;
        const valid = results.filter(Boolean);
        setUpsells(valid);
        setUpsellStates(valid.map((up) => ({
          checked: true,
          variantIdx: 0,
          qty: 1,
          selectedColor: up.colors[0] || "",
          selectedSize:  up.sizes[0]  || "",
          isOptionsOpen: false,
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [handles.join(",")]);

  // ─── حساب الإجمالي ────────────────────────────────────────
  const total = (() => {
    let sum = applyDiscount(mainPrice, discount) * mainQty;
    upsells.forEach((up, i) => {
      const st = upsellStates[i];
      if (!st?.checked) return;
      const variant = up.variants[st.variantIdx];
      if (!variant?.available) return;
      sum += applyDiscount(variant.price, discount) * (st.qty || 1);
    });
    return Math.round(sum);
  })();

  const hasUnavailable = upsells.some((up, i) => {
    const st = upsellStates[i];
    if (!st?.checked) return false;
    return !up.variants[st.variantIdx]?.available;
  });

  // ─── handlers ─────────────────────────────────────────────
  const updateUpsell = useCallback((i, patch) => {
    setUpsellStates(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }, []);

  // ✅ FIX 1: إضافة للسلة بدون reload
  const [adding, setAdding] = useState(false);
  const { addToCart } = (() => {
    try {
      // محاولة استخدام CartContext لو متاح
      const { useCart } = require("@/context/CartContext");
      return useCart();
    } catch {
      return { addToCart: null };
    }
  })();

  const handleAddToCart = async () => {
    if (hasUnavailable || adding) return;
    setAdding(true);

    try {
      // المنتج الرئيسي
      const mainSelectedSize  = product?.selectedSize  || "";
      const mainSelectedColor = product?.selectedColor || "";

      if (addToCart) {
        // ✅ استخدام CartContext مثل صفحة المنتج
        addToCart({
          ...product,
          selectedSize:  mainSelectedSize,
          selectedColor: mainSelectedColor,
          qty: mainQty,
        });

        upsells.forEach((up, i) => {
          const st = upsellStates[i];
          if (!st?.checked) return;
          const variant = up.variants[st.variantIdx];
          if (!variant?.available) return;
          addToCart({
            ...up.rawData,
            id: up.id,
            title: up.title,
            images: up.images,
            selectedSize:  st.selectedSize  || variant.size  || "",
            selectedColor: st.selectedColor || variant.color || "",
            qty: st.qty || 1,
          });
        });
      }
    } finally {
      setTimeout(() => setAdding(false), 600);
    }
  };

  // ─── Render ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.loading}>
        <span>⏳ جاري تحميل المجموعة...</span>
      </div>
    );
  }

  if (!upsells.length) return null;

  const shippingPct = limit > 0 ? Math.min((total / limit) * 100, 100) : 100;
  const shippingDone = limit === 0 || total >= limit;

  return (
    // ✅ FIX 6: margin-top أكبر لإنزال السيكشن
    <div style={{ ...styles.root, marginTop: 32 }} dir="rtl">
      {/* عنوان */}
      <h3 style={styles.title}>{title}</h3>
      {subtitle && (
        <p style={{ fontSize: 12, color: "#888", marginBottom: 12, marginTop: -10, textAlign: "right" }}>
          {subtitle}
        </p>
      )}

      {/* ── المنتج الرئيسي ── */}
      <MainProductCard
        product={product}
        discount={discount}
        mainPrice={mainPrice}
        mainQty={mainQty}
        setMainQty={setMainQty}
        onOpenQuickView={onOpenQuickView}
      />

      {/* ── المنتجات المقترحة ── */}
      {upsells.map((up, i) => {
        const st = upsellStates[i] || { checked: true, variantIdx: 0, qty: 1, selectedColor: "", selectedSize: "", isOptionsOpen: false };
        const variant = up.variants[st.variantIdx];
        const discountedPrice = applyDiscount(variant?.price || 0, discount);
        return (
          <UpsellCard
            key={up.id}
            product={up}
            state={st}
            discount={discount}
            discountedPrice={discountedPrice}
            originalPrice={variant?.price || 0}
            onCheck={(v)         => updateUpsell(i, { checked: v })}
            onVariantChange={(v) => updateUpsell(i, { variantIdx: v, qty: 1 })}
            onQtyChange={(v)     => updateUpsell(i, { qty: v })}
            onColorChange={(v)   => updateUpsell(i, { selectedColor: v })}
            onSizeChange={(v)    => updateUpsell(i, { selectedSize: v })}
            onToggleOptions={(v) => updateUpsell(i, { isOptionsOpen: v })}
            onOpenQuickView={onOpenQuickView}
          />
        );
      })}

      {/* ── ملخص الإجمالي ── */}
      <div style={styles.summary}>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>{shippingDone ? "الإجمالي:" : "الإجمالي الفرعي:"}</span>
          <span style={styles.summaryPrice}>{fmt(total)}</span>
        </div>
        <div style={styles.shippingBar}>
          <div style={{ ...styles.shippingProgress, width: shippingPct + "%", background: shippingDone ? "#28a745" : "#1a1a1a" }} />
        </div>
        <span style={styles.shippingText}>
          {shippingDone
            ? <>مبروك! حصلت على <strong>شحن مجاني</strong> 🎉</>
            : `باقي ${fmt(limit - total)} للشحن المجاني`}
        </span>
      </div>

      {/* ── زر الإضافة ── */}
      <button
        onClick={handleAddToCart}
        disabled={hasUnavailable || adding}
        style={{ ...styles.addBtn, ...(hasUnavailable || adding ? styles.addBtnDisabled : {}) }}
      >
        {adding ? "جاري الإضافة..." : hasUnavailable ? "بعض المنتجات غير متوفرة" : "أضف المجموعة للسلة"}
      </button>
    </div>
  );
}

// ─── كارد المنتج الرئيسي ──────────────────────────────────────
function MainProductCard({ product, discount, mainPrice, mainQty, setMainQty, onOpenQuickView }) {
  const discounted = applyDiscount(mainPrice, discount);
  const imgSrc     = product?.images?.[0] || product?.mainImage || "";

  return (
    <div style={styles.card}>
      <input type="checkbox" checked disabled style={styles.checkbox} />
      <div style={styles.info}>
        {/* ✅ FIX 4: عنوان المنتج كامل أولاً */}
        <p style={styles.productTitle}>{product?.title}</p>

        {/* ✅ FIX 4: السعر والبادج في صف منفصل تحت العنوان */}
        <div style={styles.priceRow}>
          <span style={styles.price}>{fmt(discounted)}</span>
          {discount > 0 && (
            <>
              {/* ✅ FIX 3: بدون - سالب في البادج */}
              <span style={styles.badge}>{discount}%</span>
              <span style={styles.originalPrice}>{fmt(mainPrice)}</span>
            </>
          )}
        </div>

        <div style={styles.qtyRow}>
          <QtyControls qty={mainQty} onChange={setMainQty} />
        </div>
      </div>

      {/* ✅ FIX 7: الضغط على الصورة يفتح QuickView */}
      <div
        style={{ ...styles.imgWrap, cursor: onOpenQuickView ? "pointer" : "zoom-in" }}
        onClick={() => onOpenQuickView && onOpenQuickView(product, true)}
      >
        <img
          src="https://cdn.shopify.com/s/files/1/0744/2726/9319/files/zoomlens_4270.ico?v=1769116302"
          style={styles.zoomIcon}
          alt=""
        />
        <img src={imgSrc} style={styles.productImg} alt={product?.title} loading="lazy" />
      </div>
    </div>
  );
}

// ─── كارد منتج مقترح ──────────────────────────────────────────
function UpsellCard({
  product, state, discount, discountedPrice, originalPrice,
  onCheck, onVariantChange, onQtyChange, onColorChange, onSizeChange, onToggleOptions, onOpenQuickView
}) {
  const variant  = product.variants[state.variantIdx];
  const imgSrc   = variant?.img || product.images?.[0] || "";
  const isAvail  = variant?.available !== false;

  // الخيارات المتاحة
  const hasColors = product.colors && product.colors.length > 0;
  const hasSizes  = product.sizes  && product.sizes.length  > 0;
  const hasOptions = hasColors || hasSizes;

  // نص الخيار المختار
  const optionLabel = [state.selectedColor, state.selectedSize].filter(Boolean).join(" / ") || "اختر";

  return (
    <div style={styles.card}>
      <input
        type="checkbox"
        checked={state.checked}
        onChange={e => onCheck(e.target.checked)}
        style={styles.checkbox}
      />
      <div style={styles.info}>
        {/* ✅ FIX 4: عنوان كامل أولاً */}
        <p style={styles.productTitle}>{product.title}</p>
        {state.checked && !isAvail && (
          <span style={{ fontSize: 10, color: "#d93025", fontWeight: "bold", display: "block", marginBottom: 2 }}>غير متوفر حالياً</span>
        )}

        {/* ✅ FIX 4: السعر والبادج في صف منفصل */}
        <div style={styles.priceRow}>
          <span style={styles.price}>{fmt(discountedPrice)}</span>
          {discount > 0 && (
            <>
              {/* ✅ FIX 3: بدون - سالب */}
              <span style={styles.badge}>{discount}%</span>
              <span style={styles.originalPrice}>{fmt(originalPrice)}</span>
            </>
          )}
        </div>

        {/* ✅ FIX 5: صف الكميات + خانة الخيارات */}
        <div style={styles.qtyRow}>
          <QtyControls qty={state.qty} onChange={onQtyChange} />

          {/* خانة الخيارات (مقاس/لون) */}
          {hasOptions && (
            <div style={{ position: "relative", flex: 1, height: "100%" }}>
              <button
                onClick={() => onToggleOptions(!state.isOptionsOpen)}
                style={styles.optionsBtn}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {optionLabel}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d={state.isOptionsOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                </svg>
              </button>

              {/* Dropdown */}
              {state.isOptionsOpen && (
                <div style={styles.optionsDropdown}>
                  {hasColors && (
                    <div style={{ marginBottom: hasSizes ? 8 : 0 }}>
                      <span style={styles.optionLabel}>اللون</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {product.colors.map((color, ci) => {
                          const swatch = product.colorSwatches?.[color];
                          const isImg  = swatch && (swatch.startsWith("http") || swatch.includes("/"));
                          const isSel  = state.selectedColor === color;
                          return (
                            <button
                              key={ci}
                              onClick={() => { onColorChange(color); }}
                              style={{
                                ...styles.colorSwatch,
                                outline: isSel ? "2px solid #1a1a1a" : "1px solid #ddd",
                                outlineOffset: isSel ? 2 : 0,
                                transform: isSel ? "scale(1.1)" : "scale(1)",
                              }}
                              title={color}
                            >
                              {isImg
                                ? <img src={swatch} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} alt={color} />
                                : <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: swatch || "#ddd" }} />
                              }
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {hasSizes && (
                    <div>
                      <span style={styles.optionLabel}>المقاس</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {product.sizes.map((sz, si) => {
                          const isSel = state.selectedSize === sz;
                          return (
                            <button
                              key={si}
                              onClick={() => { onSizeChange(sz); }}
                              style={{
                                ...styles.sizeBtn,
                                background: isSel ? "#1a1a1a" : "#fff",
                                color:      isSel ? "#fff"    : "#333",
                                borderColor: isSel ? "#1a1a1a" : "#ddd",
                              }}
                            >
                              {sz}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ✅ FIX 7: الضغط على الصورة يفتح QuickView */}
      <div
        style={{ ...styles.imgWrap, cursor: onOpenQuickView ? "pointer" : "zoom-in" }}
        onClick={() => onOpenQuickView && onOpenQuickView({ ...product.rawData, id: product.id, title: product.title, images: product.images }, true)}
      >
        <img
          src="https://cdn.shopify.com/s/files/1/0744/2726/9319/files/zoomlens_4270.ico?v=1769116302"
          style={styles.zoomIcon}
          alt=""
        />
        <img src={imgSrc} style={styles.productImg} alt={product.title} loading="lazy" />
      </div>
    </div>
  );
}

// ─── Qty Controls ─────────────────────────────────────────────
function QtyControls({ qty, onChange }) {
  return (
    <div style={styles.qtyControls}>
      <button style={styles.qtyBtn} onClick={() => onChange(qty + 1)}>+</button>
      {/* ✅ FIX 2: الرقم بالإنجليزي */}
      <span style={styles.qtyVal}>{qty}</span>
      <button style={styles.qtyBtn} onClick={() => onChange(Math.max(1, qty - 1))}>−</button>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = {
  root: {
    margin: "24px 0",
    maxWidth: 500,
    direction: "rtl",
    fontFamily: "inherit",
  },
  loading: {
    padding: "16px 0",
    color: "#999",
    fontSize: 13,
    direction: "rtl",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "right",
    color: "#333",
  },
  card: {
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "#fff",
    boxSizing: "border-box",
    overflow: "visible",  // allow dropdown overflow
    width: "100%",
    position: "relative",
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: "#333",
    cursor: "pointer",
    flexShrink: 0,
    marginTop: 3,
  },
  info: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    gap: 4,
  },
  // ✅ FIX 4: عنوان المنتج كامل (لا truncation)
  productTitle: {
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    color: "#333",
    lineHeight: 1.4,
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  // ✅ FIX 4: صف السعر والبادج منفصل تحت العنوان
  priceRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
    marginTop: 2,
  },
  price: {
    color: "#d93025",
    fontWeight: "bold",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  // ✅ FIX 3: بدون - سالب
  badge: {
    background: "#d93025",
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
    padding: "2px 5px",
    borderRadius: 3,
    whiteSpace: "nowrap",
  },
  originalPrice: {
    fontSize: 11,
    color: "#999",
    textDecoration: "line-through",
    whiteSpace: "nowrap",
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    marginTop: 6,
    width: "100%",
    position: "relative",
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    background: "#f8f9fa",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    overflow: "hidden",
    height: "100%",
    flexShrink: 0,
  },
  qtyBtn: {
    border: "none",
    background: "none",
    width: 28,
    height: "100%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#333",
    fontWeight: "bold",
    padding: 0,
    fontSize: 16,
  },
  qtyVal: {
    width: 22,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "bold",
    color: "#333",
    fontVariantNumeric: "tabular-nums",
  },
  // ✅ FIX 5: زر خيارات المقاس/اللون
  optionsBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    justifyContent: "space-between",
    background: "#f8f9fa",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: "0 8px",
    fontSize: 10.5,
    color: "#555",
    cursor: "pointer",
    height: "100%",
    width: "100%",
    textAlign: "right",
  },
  optionsDropdown: {
    position: "absolute",
    bottom: "calc(100% + 4px)",
    right: 0,
    left: 0,
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: 10,
    zIndex: 100,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    minWidth: 160,
  },
  optionLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#888",
    display: "block",
    marginBottom: 5,
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    padding: 0,
    overflow: "hidden",
    transition: "transform 0.15s, outline 0.15s",
    background: "transparent",
    flexShrink: 0,
  },
  sizeBtn: {
    border: "1px solid #ddd",
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  imgWrap: {
    position: "relative",
    width: 65,
    height: 85,
    borderRadius: 4,
    overflow: "hidden",
    flexShrink: 0,
    background: "#f5f5f5",
    border: "1px solid #eee",
  },
  productImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  zoomIcon: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 16,
    height: 16,
    zIndex: 5,
    background: "rgba(255,255,255,0.8)",
    borderRadius: 4,
    padding: 2,
    pointerEvents: "none",
  },
  summary: {
    background: "#f9f9f9",
    border: "1px dashed #ccc",
    padding: 15,
    borderRadius: 8,
    margin: "15px 0",
    direction: "rtl",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  summaryLabel: { fontSize: 14, fontWeight: "bold", color: "#333" },
  summaryPrice: { fontSize: 16, fontWeight: "bold", color: "#d93025" },
  shippingBar: {
    background: "#eee",
    height: 8,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    marginTop: 8,
  },
  shippingProgress: {
    height: "100%",
    width: "0%",
    transition: "width 0.5s ease",
  },
  shippingText: {
    fontSize: 11,
    color: "#666",
    marginTop: 5,
    display: "block",
    textAlign: "center",
  },
  addBtn: {
    width: "100%",
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    padding: 14,
    fontSize: 15,
    fontWeight: "bold",
    borderRadius: 6,
    cursor: "pointer",
    marginTop: 5,
    transition: "0.3s",
  },
  addBtnDisabled: {
    background: "#ccc",
    cursor: "not-allowed",
    opacity: 0.8,
  },
};