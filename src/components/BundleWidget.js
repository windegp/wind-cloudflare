"use client";
import { useState, useEffect, useCallback } from "react";
import { useCart } from "@/context/CartContext";
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

// ─── لوحة التحكم ──────────────────────────────────────────────
// عدّل هنا فقط — أو خليها تتقرأ من metafields (شوف الـ props)
const DEFAULT_DISCOUNT_PERCENT   = 0;     // نسبة خصم على المنتجات المقترحة (0 = بدون)
const DEFAULT_FREE_SHIPPING_LIMIT = 1850; // حد الشحن المجاني بالجنيه (0 = مجاني دايماً)

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " LE";

const applyDiscount = (price, pct) =>
  pct > 0 ? price * (1 - pct / 100) : price;

// ─── Component ────────────────────────────────────────────────
export default function BundleWidget({ product }) {
  // قراءة الإعدادات من metafields المنتج (مع fallback للـ defaults)
 const DISCOUNT  = parseFloat(product?.metafields?.bundleDiscount ?? DEFAULT_DISCOUNT_PERCENT);
  const LIMIT     = parseFloat(product?.metafields?.bundleFreeShipping ?? DEFAULT_FREE_SHIPPING_LIMIT);
  const TITLE     = product?.metafields?.bundleTitle || "منتجات يتم شراؤها معاً";
  const SUBTITLE  = product?.metafields?.bundleSubtitle || "";

  // ── parse handles ──
  const handles = (product?.metafields?.bundleProducts || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // لو مفيش منتجات محددة، ما نعرضش الويدجت
  if (!handles.length) return null;

  return <BundleWidgetInner product={product} handles={handles} discount={DISCOUNT} limit={LIMIT} title={TITLE} subtitle={SUBTITLE} />;
}

// ─── Inner (بعد التحقق من وجود handles) ──────────────────────
function BundleWidgetInner({ product, handles, discount, limit, title, subtitle }) {
  const [upsells, setUpsells]     = useState([]);   // بيانات المنتجات المقترحة
  const [loading, setLoading]     = useState(true);
  const [zoomSrc, setZoomSrc]     = useState(null); // صورة مكبّرة

  // variant و qty للمنتج الرئيسي
  const mainPrice = parseFloat(String(product?.price || "0").replace(/[^0-9.]/g, ""));
  const [mainQty, setMainQty]     = useState(1);

  // state لكل upsell: { checked, variantIdx, qty }
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

              // بناء variants من options أو من بيانات المنتج مباشرة
              let variants = [];
              if (d.options && Array.isArray(d.options)) {
                // لو عنده options، اعمل variant لكل قيمة Color × Size
                const colorOpt = d.options.find(o => o.name?.toLowerCase().includes("color"));
                const sizeOpt  = d.options.find(o => o.name?.toLowerCase().includes("size"));
                const colors   = colorOpt?.values?.split(",").map(s => s.trim()).filter(Boolean) || [""];
                const sizes    = sizeOpt?.values?.split(",").map(s => s.trim()).filter(Boolean)  || [""];
                colors.forEach(color => {
                  sizes.forEach(size => {
                    const label = [color, size].filter(Boolean).join(" / ") || "Default";
                    const img   = (color && d.colorSwatches?.[color]) || d.images?.[0] || "";
                    variants.push({ label, img, price: parseFloat(d.price || 0), available: true });
                  });
                });
              }
              // fallback: variant واحد
              if (!variants.length) {
                variants.push({
                  label: "Default",
                  img: d.images?.[0] || "",
                  price: parseFloat(d.price || 0),
                  available: (d.quantity > 0) || d.sellOutOfStock === "Yes",
                });
              }

              return {
                id:     snap.id,
                title:  d.title || handle,
                images: d.images || [],
                variants,
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
        setUpsellStates(valid.map(() => ({ checked: true, variantIdx: 0, qty: 1 })));
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

  // ─── إضافة للسلة عبر CartContext ──────────────────────────
  const { addToCart } = useCart();
  const [adding, setAdding] = useState(false);
  const handleAddToCart = useCallback(() => {
    if (hasUnavailable || adding) return;
    setAdding(true);

    // المنتج الرئيسي
    addToCart({
      ...product,
      selectedSize:  product.selectedSize  || "",
      selectedColor: product.selectedColor || "",
      image: product.images?.[0] || product.mainImage || "",
      qty: mainQty,
    });

    // المنتجات المقترحة
    upsells.forEach((up, i) => {
      const st = upsellStates[i];
      if (!st?.checked) return;
      const variant = up.variants[st.variantIdx];
      if (!variant?.available) return;

      const parts  = (variant.label || "").split("/").map(s => s.trim());
      const hasTwo = parts.length >= 2;

      addToCart({
        id:            up.id,
        title:         up.title,
        price:         applyDiscount(variant.price, discount),
        compareAtPrice: variant.price,
        images:        up.images,
        mainImage:     variant.img || up.images?.[0] || "",
        image:         variant.img || up.images?.[0] || "",
        selectedSize:  hasTwo ? parts[1] : (parts[0] || ""),
        selectedColor: hasTwo ? parts[0] : "",
        qty:           st.qty || 1,
      });
    });

    setTimeout(() => setAdding(false), 700);
  }, [hasUnavailable, adding, product, mainQty, upsells, upsellStates, discount, addToCart]);

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
    <div style={styles.root} dir="rtl">
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
        onZoom={setZoomSrc}
      />

      {/* ── المنتجات المقترحة ── */}
      {upsells.map((up, i) => {
        const st = upsellStates[i] || { checked: true, variantIdx: 0, qty: 1 };
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
            onCheck={(v)       => updateUpsell(i, { checked: v })}
            onVariantChange={(v) => updateUpsell(i, { variantIdx: v, qty: 1 })}
            onQtyChange={(v)   => updateUpsell(i, { qty: v })}
            onZoom={setZoomSrc}
          />
        );
      })}

      {/* ── ملخص الإجمالي ── */}
      <div style={styles.summary}>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>{shippingDone ? "الإجمالي:" : "الإجمالي الفرعي:"}</span>
          <span style={styles.summaryPrice}>{fmt(total)}</span>
        </div>
        {/* شريط الشحن */}
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

      {/* ── Zoom Modal ── */}
      {zoomSrc && (
        <div style={styles.zoomOverlay} onClick={() => setZoomSrc(null)}>
          <span style={styles.zoomClose}>&times;</span>
          <img src={zoomSrc} style={styles.zoomImg} onClick={e => e.stopPropagation()} alt="zoom" />
        </div>
      )}
    </div>
  );
}

// ─── كارد المنتج الرئيسي ──────────────────────────────────────
function MainProductCard({ product, discount, mainPrice, mainQty, setMainQty, onZoom }) {
  const discounted = applyDiscount(mainPrice, discount);
  const imgSrc     = product?.images?.[0] || product?.mainImage || "";

  return (
    <div style={styles.card}>
      <input type="checkbox" checked disabled style={styles.checkbox} />
      <div style={styles.info}>
        <div style={styles.titleRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={styles.productTitle}>{product?.title}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 4 }}>
            {discount > 0 && <span style={styles.badge}>-{discount}%</span>}
            <span style={styles.price}>{fmt(discounted)}</span>
          </div>
        </div>
        <div style={styles.qtyRow}>
          <QtyControls qty={mainQty} onChange={setMainQty} />
        </div>
      </div>
      <div style={styles.imgWrap} onClick={() => onZoom(imgSrc)}>
        <img src="https://cdn.shopify.com/s/files/1/0744/2726/9319/files/zoomlens_4270.ico?v=1769116302" style={styles.zoomIcon} alt="" />
        <img src={imgSrc} style={styles.productImg} alt={product?.title} loading="lazy" />
      </div>
    </div>
  );
}

// ─── كارد منتج مقترح ──────────────────────────────────────────
function UpsellCard({ product, state, discount, discountedPrice, originalPrice, onCheck, onVariantChange, onQtyChange, onZoom }) {
  const variant  = product.variants[state.variantIdx];
  const imgSrc   = variant?.img || product.images?.[0] || "";
  const isAvail  = variant?.available !== false;

  return (
    <div style={styles.card}>
      <input
        type="checkbox"
        checked={state.checked}
        onChange={e => onCheck(e.target.checked)}
        style={styles.checkbox}
      />
      <div style={styles.info}>
        <div style={styles.titleRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={styles.productTitle}>{product.title}</p>
            {state.checked && !isAvail && (
              <span style={{ fontSize: 10, color: "#d93025", fontWeight: "bold", display: "block" }}>غير متوفر حالياً</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 4 }}>
            {discount > 0 && (
              <span style={{ fontSize: 11, color: "#999", textDecoration: "line-through", whiteSpace: "nowrap" }}>
                {fmt(originalPrice)}
              </span>
            )}
            {discount > 0 && <span style={styles.badge}>-{discount}%</span>}
            <span style={styles.price}>{fmt(discountedPrice)}</span>
          </div>
        </div>
        <div style={styles.qtyRow}>
          {/* Variant selector */}
          {product.variants.length > 1 && (
            <div style={styles.variantBox}>
              <select
                value={state.variantIdx}
                onChange={e => onVariantChange(parseInt(e.target.value))}
                style={styles.variantSelect}
              >
                {product.variants.map((v, i) => (
                  <option key={i} value={i}>{v.label}{!v.available ? " - (غير متوفر)" : ""}</option>
                ))}
              </select>
              <div style={styles.variantDisplay}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {variant?.label}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          )}
          <QtyControls qty={state.qty} onChange={onQtyChange} />
        </div>
      </div>
      <div style={styles.imgWrap} onClick={() => onZoom(imgSrc)}>
        <img src="https://cdn.shopify.com/s/files/1/0744/2726/9319/files/zoomlens_4270.ico?v=1769116302" style={styles.zoomIcon} alt="" />
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
    alignItems: "center",
    gap: 10,
    background: "#fff",
    boxSizing: "border-box",
    overflow: "hidden",
    width: "100%",
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: "#333",
    cursor: "pointer",
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 5,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    color: "#333",
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  price: {
    color: "#d93025",
    fontWeight: "bold",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  badge: {
    background: "#d93025",
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
    padding: "2px 5px",
    borderRadius: 3,
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    marginTop: 5,
    width: "100%",
  },
  variantBox: {
    background: "#f8f9fa",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: "0 6px",
    cursor: "pointer",
    position: "relative",
    flex: 1,
    height: "100%",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    overflow: "hidden",
  },
  variantSelect: {
    position: "absolute",
    opacity: 0,
    width: "100%",
    height: "100%",
    top: 0,
    left: 0,
    cursor: "pointer",
    zIndex: 10,
  },
  variantDisplay: {
    fontSize: 10.5,
    color: "#555",
    display: "flex",
    alignItems: "center",
    gap: 4,
    justifyContent: "space-between",
    width: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    pointerEvents: "none",
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
  },
  imgWrap: {
    cursor: "zoom-in",
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
  zoomOverlay: {
    position: "fixed",
    zIndex: 99999999,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.9)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomClose: {
    position: "absolute",
    top: 40,
    right: 25,
    color: "white",
    fontSize: 45,
    cursor: "pointer",
    fontWeight: "bold",
    zIndex: 100000000,
  },
  zoomImg: {
    maxWidth: "90%",
    maxHeight: "85vh",
    borderRadius: 4,
    objectFit: "contain",
  },
};