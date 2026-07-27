"use client";
import { useState, useEffect, useCallback } from "react";
import { useCart } from "@/context/CartContext";
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { getInventoryPresentation } from "@/lib/inventoryHelpers";
import { fbTrack } from "@/lib/fbTrack";
import { getCatalogId } from "@/lib/catalogId";

// ─── لوحة التحكم ──────────────────────────────────────────────
const DEFAULT_DISCOUNT_PERCENT    = 0;
const DEFAULT_FREE_SHIPPING_LIMIT = 1850;

// ─── Helpers ──────────────────────────────────────────────────
// أرقام إنجليزي + ج.م
const fmt = (n) =>
  Number(Math.round(n)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " ج.م";

const applyDiscount = (price, pct) =>
  pct > 0 ? price * (1 - pct / 100) : price;

// ─── Wrapper ──────────────────────────────────────────────────
export default function BundleWidget({ product }) {
  const DISCOUNT = parseFloat(product?.metafields?.bundleDiscount ?? DEFAULT_DISCOUNT_PERCENT);
  const LIMIT    = parseFloat(product?.metafields?.bundleFreeShipping ?? DEFAULT_FREE_SHIPPING_LIMIT);
  const TITLE    = product?.metafields?.bundleTitle || "منتجات يتم شراؤها معاً";
  const SUBTITLE = product?.metafields?.bundleSubtitle || "";

  const handles = (product?.metafields?.bundleProducts || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  if (!handles.length) return null;

  return (
    <BundleWidgetInner
      product={product}
      handles={handles}
      discount={DISCOUNT}
      limit={LIMIT}
      title={TITLE}
      subtitle={SUBTITLE}
    />
  );
}

// ─── Inner ────────────────────────────────────────────────────
function BundleWidgetInner({ product, handles, discount, limit, title, subtitle }) {
  const { addToCart } = useCart();

  const [upsells, setUpsells]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [zoomSrc, setZoomSrc]         = useState(null);
  const [upsellStates, setUpsellStates] = useState([]);
  const [adding, setAdding]           = useState(false);

  const mainPrice = parseFloat(String(product?.price || "0").replace(/[^0-9.]/g, ""));
  const [mainQty, setMainQty]               = useState(1);
  const [mainVariantIdx, setMainVariantIdx] = useState(0);

  // بناء variants للمنتج الأساسي
  const mainVariants = (() => {
    const d = product;
    if (!d?.options || !Array.isArray(d.options)) return [];
    const colorOpt = d.options.find(o => o.name?.toLowerCase().includes("color") || o.name?.includes("لون"));
    const sizeOpt  = d.options.find(o => o.name?.toLowerCase().includes("size")  || o.name?.includes("مقاس"));
    const colors   = colorOpt?.values?.split(",").map(s => s.trim()).filter(Boolean) || [""];
    const sizes    = sizeOpt?.values?.split(",").map(s => s.trim()).filter(Boolean)  || [""];
    const result   = [];
    colors.forEach(color => {
      sizes.forEach(size => {
        const label = [color, size].filter(Boolean).join(" / ") || "Default";
        const img   = (color && d.colorSwatches?.[color]) || d.images?.[0] || "";
        // 🔥 نفس منطق الـ upsells بالظبط: نفحص inventoryStatus الحقيقي للـ variant المطابق
        // من المنتج الحالي نفسه (product.variants) — مش بس شكل، حتى لو المنتج الرئيسي
        // نفسه هو المفتوح، لازم اختياره جوا الباقة يخضع لنفس قاعدة الشراء
        const matchedVariant = (d.variants || []).find(v => {
          const v1 = (v.option1Value || "").toLowerCase();
          const v2 = (v.option2Value || "").toLowerCase();
          const colorMatch = !color || v1 === color.toLowerCase() || v2 === color.toLowerCase();
          const sizeMatch  = !size  || v1 === size.toLowerCase()  || v2 === size.toLowerCase();
          return colorMatch && sizeMatch;
        });
        const hasRealStatus = matchedVariant?.inventoryStatus && matchedVariant.inventoryStatus !== "NEEDS_REVIEW";
        const legacyAvailable = (d.quantity > 0) || d.sellOutOfStock === "Yes";
        const presentation = matchedVariant
          ? (hasRealStatus
              ? getInventoryPresentation(matchedVariant.inventoryStatus, { quantity: matchedVariant.quantity })
              : getInventoryPresentation(legacyAvailable ? "IN_STOCK" : "OUT_OF_STOCK", {}))
          : getInventoryPresentation("IN_STOCK", {}); // بيانات غير مكتملة → افتراضي متاح
        result.push({ label, img, color, size, available: presentation.canPurchase, presentation });
      });
    });
    return result;
  })();

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
                const colorOpt = d.options.find(o =>
                  o.name?.toLowerCase().includes("color") || o.name?.includes("لون")
                );
                const sizeOpt = d.options.find(o =>
                  o.name?.toLowerCase().includes("size") || o.name?.includes("مقاس")
                );
                const colors = colorOpt?.values?.split(",").map(s => s.trim()).filter(Boolean) || [""];
                const sizes  = sizeOpt?.values?.split(",").map(s => s.trim()).filter(Boolean)  || [""];
                // Phase 6: availability من inventoryStatus لو المنتج migrated
                // الـ variants array من Firestore تحتوي inventoryStatus بعد Migration
                colors.forEach(color => {
                  sizes.forEach(size => {
                    const label = [color, size].filter(Boolean).join(" / ") || "Default";
                    const img   = (color && d.colorSwatches?.[color]) || d.images?.[0] || "";
                    // ابحث عن الـ variant المطابق في d.variants لقراءة inventoryStatus
                    const matchedVariant = (d.variants || []).find(v => {
                      const v1 = (v.option1Value || "").toLowerCase();
                      const v2 = (v.option2Value || "").toLowerCase();
                      const colorMatch = !color || v1 === color.toLowerCase() || v2 === color.toLowerCase();
                      const sizeMatch  = !size  || v1 === size.toLowerCase()  || v2 === size.toLowerCase();
                      return colorMatch && sizeMatch;
                    });
                    // 🔥 نفس فيكس ProductView/QuickView: status حقيقي (مش مفقود ومش
                    // NEEDS_REVIEW) → Fail Closed. غير كده → legacy fallback مؤقت
                    // (quantity/sellOutOfStock) لحد ما الأدمن يراجع الـ variant.
                    const hasRealStatus =
                      matchedVariant?.inventoryStatus &&
                      matchedVariant.inventoryStatus !== "NEEDS_REVIEW";
                    // 🔥 نستخدم نفس getInventoryPresentation المركزية — مش boolean بس،
                    // عشان الباقات توضّح PRE_ORDER/BACKORDER للعميل زي باقي الموقع بالظبط
                    const legacyAvailable = (d.quantity > 0) || d.sellOutOfStock === "Yes";
                    const presentation = matchedVariant
                      ? (hasRealStatus
                          ? getInventoryPresentation(matchedVariant.inventoryStatus, { quantity: matchedVariant.quantity })
                          : getInventoryPresentation(legacyAvailable ? "IN_STOCK" : "OUT_OF_STOCK", {}))
                      : getInventoryPresentation("IN_STOCK", {}); // fallback: بيانات غير مكتملة
                    const available = presentation.canPurchase;
                    variants.push({ label, img, color, size, price: parseFloat(d.price || 0), available, presentation });
                  });
                });
              }
              if (!variants.length) {
                // legacy fallback: منتجات بدون variants array (AD-2 — سيُزال لاحقاً)
                const legacyAvailable = (d.quantity > 0) || d.sellOutOfStock === "Yes";
                variants.push({
                  label: "Default",
                  img: d.images?.[0] || "",
                  color: "", size: "",
                  price: parseFloat(d.price || 0),
                  available: legacyAvailable,
                  presentation: getInventoryPresentation(legacyAvailable ? "IN_STOCK" : "OUT_OF_STOCK", {}),
                });
              }

              return { id: snap.id, title: d.title || handle, images: d.images || [], variants };
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
// لو كل الـ upsells مش checked → منتج واحد فقط → بدون خصم
  const checkedCount = upsellStates.filter(s => s?.checked).length + 1; // +1 للمنتج الأساسي
  const effectiveDiscount = checkedCount >= 2 ? discount : 0;

  // ─── حساب الإجمالي — الخصم على الكل ─────────────────────
  const total = (() => {
    let sum = applyDiscount(mainPrice, effectiveDiscount) * mainQty;
    upsells.forEach((up, i) => {
      const st = upsellStates[i];
      if (!st?.checked) return;
      const variant = up.variants[st.variantIdx];
      if (!variant?.available) return;
      sum += applyDiscount(variant.price, effectiveDiscount) * (st.qty || 1);
    });
    return Math.round(sum);
  })();

  const hasUnavailable = (
    mainVariants?.[mainVariantIdx]?.available === false ||
    upsells.some((up, i) => {
      const st = upsellStates[i];
      if (!st?.checked) return false;
      return !up.variants[st.variantIdx]?.available;
    })
  );

  const updateUpsell = useCallback((i, patch) => {
    setUpsellStates(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }, []);

  // ─── حساب الشحن المجاني — يجب أن يكون قبل useCallback ─────
  const hasFreeShippingFeature = limit > 0;
  const shippingDone = hasFreeShippingFeature && total >= limit;
  const shippingPct = hasFreeShippingFeature ? Math.min((total / limit) * 100, 100) : 0;

  // ─── إضافة للسلة — الخصم يتطبق على السعر المبعوت ─────────
  const handleAddToCart = useCallback(() => {
    if (hasUnavailable || adding) return;
    setAdding(true);

    // هل الشحن مجاني في هذه الباقة؟ (limit > 0 والإجمالي وصل للحد)
    const bundleFreeShipping = hasFreeShippingFeature && shippingDone;

    // المنتج الأساسي بسعر مخفض + الـ variant المختار
    const selectedMainVariant = mainVariants?.[mainVariantIdx];
    addToCart({
      ...product,
      selectedSize:        selectedMainVariant?.size  || product.selectedSize  || "",
      selectedColor:       selectedMainVariant?.color || product.selectedColor || "",
      image:               selectedMainVariant?.img   || product.images?.[0]   || product.mainImage || "",
      price:               Math.round(applyDiscount(mainPrice, effectiveDiscount)),
      compareAtPrice:      effectiveDiscount > 0 ? Math.round(mainPrice) : undefined,
      qty:                 mainQty,
      bundleFreeShipping:  bundleFreeShipping || undefined,
    });

    // المنتجات المقترحة
    upsells.forEach((up, i) => {
      const st = upsellStates[i];
      if (!st?.checked) return;
      const variant = up.variants[st.variantIdx];
      if (!variant?.available) return;

      addToCart({
        id:                 up.id,
        title:              up.title,
        price:              Math.round(applyDiscount(variant.price, effectiveDiscount)),
        compareAtPrice:     effectiveDiscount > 0 ? Math.round(variant.price) : undefined,
        images:             up.images,
        mainImage:          variant.img || up.images?.[0] || "",
        image:              variant.img || up.images?.[0] || "",
        selectedSize:       variant.size  || "",
        selectedColor:      variant.color || "",
        qty:                st.qty || 1,
        bundleFreeShipping: bundleFreeShipping || undefined,
      });
    });

    setTimeout(() => setAdding(false), 700);

    // 🔥 Meta tracking: حدث AddToCart واحد فقط يغطي كل ما أُضيف فعلياً في
    // هذا الإجراء (المنتج الأساسي + كل upsell محدد ومتاح بالفعل) — هذا كان
    // ناقصاً تماماً من BundleWidget منذ إنشائه (تأكدنا من تاريخ الملف بالكامل:
    // لم يُضَف عمداً ثم يُحذف، ببساطة لم يكن موجوداً إطلاقاً).
    //
    // نفس getCatalogId المستخدَمة في كل مكان آخر بالموقع، بنفس قيمة اللون
    // المُستخدَمة بالضبط في نداء addToCart المقابل لكل عنصر أعلاه — فـ
    // content_ids هنا يطابق تماماً ما سيُحسب لاحقاً في InitiateCheckout/
    // Purchase لنفس هذه العناصر بالضبط. حدث واحد مجمّع (لا حدث منفصل لكل
    // منتج) — بنفس أسلوب content_ids كمصفوفة المُتَّبع أصلاً في
    // InitiateCheckout/Purchase لعناصر السلة المتعددة.
    const trackedContentIds = [
      getCatalogId(product.handle || product.id, selectedMainVariant?.color || product.selectedColor || ""),
    ];
    let trackedNumItems = mainQty;

    upsells.forEach((up, i) => {
      const st = upsellStates[i];
      if (!st?.checked) return;
      const variant = up.variants[st.variantIdx];
      if (!variant?.available) return;
      trackedContentIds.push(getCatalogId(up.id, variant.color || ""));
      trackedNumItems += st.qty || 1;
    });

    fbTrack("AddToCart", {
      value: total,
      currency: "EGP",
      content_ids: trackedContentIds,
      content_type: "product",
      num_items: trackedNumItems,
    });
  }, [hasUnavailable, adding, product, mainPrice, mainQty, upsells, upsellStates, effectiveDiscount, hasFreeShippingFeature, shippingDone, addToCart, total]);

  // ─── Render ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.loading}>
        <span>جاري تحميل المجموعة...</span>
      </div>
    );
  }

  if (!upsells.length) return null;

  return (
    <section style={styles.root} dir="rtl" aria-label="منتجات مرتبطة أو مجموعة" data-bundle-products="true">

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
        discount={effectiveDiscount}
        mainPrice={mainPrice}
        mainQty={mainQty}
        setMainQty={setMainQty}
        onZoom={setZoomSrc}
        mainVariantIdx={mainVariantIdx}
        setMainVariantIdx={setMainVariantIdx}
        mainVariants={mainVariants}
      />

      {/* ── المنتجات المقترحة ── */}
      {upsells.map((up, i) => {
        const st      = upsellStates[i] || { checked: true, variantIdx: 0, qty: 1 };
        const variant = up.variants[st.variantIdx];
        return (
          <UpsellCard
            key={up.id}
            product={up}
            state={st}
            discount={effectiveDiscount}
            originalPrice={variant?.price || 0}
            onCheck={(v)         => updateUpsell(i, { checked: v })}
            onVariantChange={(v) => updateUpsell(i, { variantIdx: v, qty: 1 })}
            onQtyChange={(v)     => updateUpsell(i, { qty: v })}
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
        {/* شريط الشحن المجاني — يظهر فقط لو limit > 0 */}
        {hasFreeShippingFeature && (
          <>
            <div style={styles.shippingBar}>
              <div style={{
                ...styles.shippingProgress,
                width: shippingPct + "%",
                background: shippingDone ? "#28a745" : "#1a1a1a",
              }} />
            </div>
            <span style={styles.shippingText}>
              {shippingDone
                ? <>مبروك! حصلت على <strong>شحن مجاني</strong> 🎉</>
                : `باقي ${fmt(limit - total)} للشحن المجاني`}
            </span>
          </>
        )}
      </div>

      {/* ── زر الإضافة — sticky cart style ── */}
      <button
        onClick={handleAddToCart}
        disabled={hasUnavailable || adding}
        style={{
          ...styles.addBtn,
          ...(hasUnavailable || adding ? styles.addBtnDisabled : {}),
        }}
      >
        {adding ? (
          <svg
            style={{ animation: "spin 0.7s linear infinite" }}
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
          >
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : hasUnavailable ? (
          "بعض المنتجات غير متوفرة"
        ) : (
          "أضف المجموعة للسلة"
        )}
      </button>

      {/* ── Zoom Modal ── */}
      {zoomSrc && (
        <div style={styles.zoomOverlay} onClick={() => setZoomSrc(null)}>
          <span style={styles.zoomClose}>&times;</span>
          <img
            src={zoomSrc}
            style={styles.zoomImg}
            onClick={e => e.stopPropagation()}
            alt="zoom"
          />
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}

// ─── كارد المنتج الرئيسي ──────────────────────────────────────
function MainProductCard({ product, discount, mainPrice, mainQty, setMainQty, onZoom, mainVariantIdx, setMainVariantIdx, mainVariants }) {
  const discounted = applyDiscount(mainPrice, discount);
  const imgSrc     = mainVariants?.[mainVariantIdx]?.img || product?.images?.[0] || product?.mainImage || "";
  const currentVariant = mainVariants?.[mainVariantIdx];
  const presentation = currentVariant?.presentation;
  const statusNote = presentation && presentation.status !== "IN_STOCK" && presentation.status !== "LOW_STOCK"
    ? presentation.badgeText
    : null;
  const statusColor = presentation?.badgeColor === "blue" ? "#2563EB"
    : presentation?.badgeColor === "purple" ? "#9333EA"
    : "#C0392B";

  return (
    <div style={styles.card}>
      <input type="checkbox" checked disabled style={styles.checkbox} />

      <div style={styles.info}>
        {/* اسم المنتج — سطر مستقل */}
        <p style={styles.productTitle}>{product?.title}</p>
        {statusNote && (
          <span style={{ fontSize: 10, color: statusColor, fontWeight: "bold", display: "block", marginBottom: 2 }}>
            {statusNote}
          </span>
        )}

        {/* السعر الجديد ← القديم مشطوب ← بادج */}
        <div style={styles.priceRow}>
          <span style={styles.price}>{fmt(discounted)}</span>
          {discount > 0 && (
            <>
              <span style={styles.originalPrice}>{fmt(mainPrice)}</span>
              <span style={styles.badge}>{discount}%</span>
            </>
          )}
        </div>

        {/* Variant + Qty */}
        <div style={styles.qtyRow}>
          {mainVariants && mainVariants.length > 1 && (
            <div style={styles.variantBox}>
              <select
                value={mainVariantIdx}
                onChange={e => setMainVariantIdx(parseInt(e.target.value))}
                style={styles.variantSelect}
              >
                {mainVariants.map((v, i) => (
                  <option key={i} value={i}>{v.label}{!v.available ? " - (غير متوفر)" : ""}</option>
                ))}
              </select>
              <div style={styles.variantDisplay}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentVariant?.label || "اختر"}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          )}
          <QtyControls qty={mainQty} onChange={setMainQty} />
        </div>
      </div>

      {/* صورة */}
      <div style={styles.imgWrap} onClick={() => onZoom(imgSrc)}>
        <img
          src="https://cdn.shopify.com/s/files/1/0744/2726/9319/files/zoomlens_4270.ico?v=1769116302"
          style={styles.zoomIcon} alt=""
        />
        <img src={imgSrc} style={styles.productImg} alt={product?.title} loading="lazy" />
      </div>
    </div>
  );
}

// ─── كارد منتج مقترح ──────────────────────────────────────────
function UpsellCard({ product, state, discount, originalPrice, onCheck, onVariantChange, onQtyChange, onZoom }) {
  const variant        = product.variants[state.variantIdx];
  const imgSrc         = variant?.img || product.images?.[0] || "";
  const isAvail        = variant?.available !== false;
  const presentation   = variant?.presentation;
  const discountedPrice = applyDiscount(originalPrice, discount);

  // 🔥 نص واضح للعميل حسب الحالة الفعلية — مش بس متاح/غير متاح، عشان الحجز المسبق
  // وإعادة التوفير توضّح نفسها بدل ما تظهر عادية من غير أي إشارة
  const statusNote = state.checked && presentation && presentation.status !== "IN_STOCK" && presentation.status !== "LOW_STOCK"
    ? presentation.badgeText
    : null;
  const statusColor = presentation?.badgeColor === "blue" ? "#2563EB"
    : presentation?.badgeColor === "purple" ? "#9333EA"
    : "#C0392B"; // أحمر افتراضي لغير المتوفر/الحالات المعطّلة

  return (
    <div style={styles.card}>
      <input
        type="checkbox"
        checked={state.checked}
        onChange={e => onCheck(e.target.checked)}
        style={styles.checkbox}
      />

      <div style={styles.info}>
        {/* اسم المنتج — سطر مستقل */}
        <p style={styles.productTitle}>{product.title}</p>
        {statusNote && (
          <span style={{ fontSize: 10, color: statusColor, fontWeight: "bold", display: "block", marginBottom: 2 }}>
            {statusNote}
          </span>
        )}

        {/* السعر الجديد ← القديم مشطوب ← بادج */}
        <div style={styles.priceRow}>
          <span style={styles.price}>{fmt(discountedPrice)}</span>
          {discount > 0 && (
            <>
              <span style={styles.originalPrice}>{fmt(originalPrice)}</span>
              <span style={styles.badge}>{discount}%</span>
            </>
          )}
        </div>

        {/* Variant + Qty — sticky cart style */}
        <div style={styles.qtyRow}>
          {product.variants.length > 1 && (
            <div style={styles.variantBox}>
              <select
                value={state.variantIdx}
                onChange={e => onVariantChange(parseInt(e.target.value))}
                style={styles.variantSelect}
              >
                {product.variants.map((v, i) => (
                  <option key={i} value={i}>
                    {v.label}{!v.available ? " - (غير متوفر)" : ""}
                  </option>
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

      {/* صورة */}
      <div style={styles.imgWrap} onClick={() => onZoom(imgSrc)}>
        <img
          src="https://cdn.shopify.com/s/files/1/0744/2726/9319/files/zoomlens_4270.ico?v=1769116302"
          style={styles.zoomIcon} alt=""
        />
        <img src={imgSrc} style={styles.productImg} alt={product.title} loading="lazy" />
      </div>
    </div>
  );
}

// ─── Qty Controls — sticky cart style ─────────────────────────
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
    margin: "40px 0",
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
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "right",
    color: "#111",
  },
  card: {
    border: "1px solid #E0E0E0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "#fff",
    boxSizing: "border-box",
    overflow: "hidden",
    width: "100%",
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "#111",
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
  },
  // اسم المنتج — سطر مستقل كامل
  productTitle: {
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    marginBottom: 6,
    color: "#111",
    lineHeight: 1.4,
    whiteSpace: "normal",      // يكسر السطر لو محتاج
    wordBreak: "break-word",
  },
  // صف السعر: الجديد ← القديم مشطوب ← بادج
  priceRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  price: {
    color: "#C0392B",
    fontWeight: "bold",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  originalPrice: {
    fontSize: 11,
    color: "#BBBBBB",
    textDecoration: "line-through",
    whiteSpace: "nowrap",
  },
  badge: {
    background: "#fdecea",
    color: "#C0392B",
    fontSize: 10,
    fontWeight: "bold",
    padding: "2px 6px",
    borderRadius: 99,
    whiteSpace: "nowrap",
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 42,
    width: "100%",
  },
  // Variant box — sticky cart style (أبيض + border)
  variantBox: {
    background: "#fff",
    border: "1px solid #E0E0E0",
    borderRadius: 8,
    padding: "0 10px",
    cursor: "pointer",
    position: "relative",
    flex: 1,
    height: "100%",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    overflow: "visible",
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
    fontSize: 12,
    color: "#111",
    display: "flex",
    alignItems: "center",
    gap: 4,
    justifyContent: "space-between",
    width: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    pointerEvents: "none",
  },
  // Qty controls — sticky cart style (رمادي فاتح + border)
  qtyControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f9f9f9",
    border: "1px solid #E0E0E0",
    borderRadius: 8,
    overflow: "hidden",
    height: "100%",
    width: 80,
    flexShrink: 0,
    padding: "0 4px",
  },
  qtyBtn: {
    border: "none",
    background: "none",
    width: 24,
    height: "100%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#333",
    fontWeight: "bold",
    padding: 0,
    fontSize: 15,
  },
  qtyVal: {
    width: 22,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
    color: "#111",
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
  summaryLabel: { fontSize: 13, fontWeight: "bold", color: "#333" },
  summaryPrice: { fontSize: 15, fontWeight: "bold", color: "#C0392B" },
  shippingBar: {
    background: "#eee",
    height: 6,
    borderRadius: 10,
    overflow: "hidden",
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
    marginTop: 6,
    display: "block",
    textAlign: "center",
  },
  // زر الإضافة — sticky cart style
  addBtn: {
    width: "100%",
    background: "#111",
    color: "#fff",
    border: "none",
    height: 42,
    fontSize: 13,
    fontWeight: "500",
    borderRadius: 8,
    cursor: "pointer",
    marginTop: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    letterSpacing: "0.04em",
    transition: "background 0.2s",
  },
  addBtnDisabled: {
    background: "#ccc",
    cursor: "not-allowed",
    opacity: 0.8,
  },
  zoomOverlay: {
    position: "fixed",
    zIndex: 99999999,
    top: 0, left: 0,
    width: "100%", height: "100%",
    background: "rgba(0,0,0,0.9)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomClose: {
    position: "absolute",
    top: 40, right: 25,
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