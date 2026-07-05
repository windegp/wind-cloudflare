"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ChevronLeft, ShoppingBag, Plus, Star } from '@/components/icons-extra';
import { ZoomIn, Minus, Info } from '@/components/icons-extra';
import { useCart } from "@/context/CartContext"; 
import { useSiteSettings } from "@/hooks/useFirestore";
import { getInventoryPresentation, INVENTORY_STATUS } from "@/lib/inventoryHelpers";
import SizeChartModal from "@/components/SizeChartModal"; 
import ProductReviews from "@/components/products/ProductReviews";
import { fbTrack } from "@/lib/fbTrack";
import { gaAddToCart } from "@/lib/gaTrack";

export default function QuickViewModal({ product, isOpen, onClose }) {
  const { addToCart } = useCart();
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [zoomedImage, setZoomedImage] = useState(null);
  const [qvSizes, setQvSizes] = useState([]);
  const [qvColors, setQvColors] = useState([]);
  const [qvSelectedSize, setQvSelectedSize] = useState("");
  const [qvSelectedColor, setQvSelectedColor] = useState("");
  const [qvActiveImage, setQvActiveImage] = useState("");
  const [qvQuantity, setQvQuantity] = useState(1);
  const [qvReviewsData, setQvReviewsData] = useState({ 
    count: product?.reviewsCount || 0, 
    rating: product?.rating || 0 
  });

  // مزامنة التقييمات لو اتغيرت في الـ props
  useEffect(() => {
    if (product?.reviewsCount || product?.rating) {
      setQvReviewsData({
        count: product.reviewsCount || 0,
        rating: product.rating || 0
      });
    }
  }, [product?.reviewsCount, product?.rating]);
  const [isAdding, setIsAdding] = useState(false);

  const [isDescModalOpen, setDescModalOpen] = useState(false);
  const [isSizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [isReviewsModalOpen, setReviewsModalOpen] = useState(false);
  
  const [isGalleryOpen, setGalleryOpen] = useState(false);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const touchStartX = useRef(null);

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (isOpen || zoomedImage || isDescModalOpen || isGalleryOpen || isSizeGuideOpen || isReviewsModalOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "0px";
    }
    return () => { 
      document.body.style.overflow = ""; 
      document.body.style.paddingRight = "0px";
    };
  }, [isOpen, zoomedImage, isDescModalOpen, isGalleryOpen, isSizeGuideOpen, isReviewsModalOpen]);

  useEffect(() => {
    if (product && isOpen) {
      let s = [], c = [];
      if (product.options && Array.isArray(product.options)) {
        product.options.forEach(opt => {
          const n = (opt.name || "").toLowerCase();
          if (n.includes("size") || n === "المقاس" || n === "مقاس") s = opt.values.split(",").map(val => val.trim()).filter(Boolean);
          if (n.includes("color")|| n === "اللون"  || n === "لون")  c = opt.values.split(",").map(val => val.trim()).filter(Boolean);
        });
      } else {
        s = Array.isArray(product.options?.sizes) ? product.options.sizes : (Array.isArray(product.sizes) ? product.sizes : []);
        c = Array.isArray(product.options?.colors) ? product.options.colors : [];
      }

      setQvSizes(s);
      setQvColors(c);
      setQvSelectedSize(s[0] || "");
      setQvSelectedColor(typeof c[0] === 'object' ? c[0].name : (c[0] || ""));
      setQvActiveImage(product.images?.[0] || product.mainImageUrl || product.image || product.mainImage || "");
      setQvQuantity(1);

      // ✅ تحديث التقييمات من البيانات الجاهزة فوراً (initial)
      setQvReviewsData({ 
        count: product.reviewsCount || 0, 
        rating: product.rating || 0 
      });
      
      // 🔥 تعديل WIND: جلب fresh data من API عشان الـ counts تكون حية
      const handleToSearch = product.handle || product.seo?.handle || String(product.id);
      if (handleToSearch) {
        fetch(`/api/product-stats?handle=${encodeURIComponent(handleToSearch)}`)
          .then(res => res.ok ? res.json() : null)
          .then(json => {
            if (json) {
              setQvReviewsData({ count: json.count, rating: json.rating });
            }
          })
          .catch(() => {}); // خطأ صامت
      }
    }
  }, [product, isOpen]);

  // 🔥 Phase 9: نفس منطق ProductView بالظبط — مصدر واحد لقرار الشراء وعرضه
  const { data: siteSettings } = useSiteSettings();
  const lowStockThreshold = siteSettings?.inventory?.defaultLowStockThreshold ?? 5;

  const selectedVariant = useMemo(() => {
    const variants = product?.variants;
    if (!variants || !Array.isArray(variants) || variants.length === 0) return null;
    return variants.find(v => {
      const c = (v.option1Value || v.option2Value || "").toLowerCase();
      const s = (v.option2Value || v.option1Value || "").toLowerCase();
      const colorMatch = !qvSelectedColor || c === qvSelectedColor.toLowerCase() || s === qvSelectedColor.toLowerCase();
      const sizeMatch  = !qvSelectedSize  || c === qvSelectedSize.toLowerCase()  || s === qvSelectedSize.toLowerCase();
      return colorMatch && sizeMatch;
    }) || variants[0] || null;
  }, [product?.variants, qvSelectedColor, qvSelectedSize]);

  const presentation = useMemo(() => {
    if (!selectedVariant) {
      const legacy = (product?.quantity > 0) || product?.sellOutOfStock === "Yes";
      return getInventoryPresentation(legacy ? "IN_STOCK" : "OUT_OF_STOCK", { lowStockThreshold });
    }
    // 🔥 نفس فيكس ProductView.js بالظبط: status حقيقي (مش مفقود ومش NEEDS_REVIEW) → Fail Closed.
    // غير كده → legacy fallback مؤقت لحد ما الأدمن يراجع الـ variant.
    const hasRealStatus =
      selectedVariant.inventoryStatus &&
      selectedVariant.inventoryStatus !== INVENTORY_STATUS.NEEDS_REVIEW;

    if (hasRealStatus) {
      return getInventoryPresentation(selectedVariant.inventoryStatus, {
        quantity: selectedVariant.quantity,
        lowStockThreshold,
        inventoryManaged: selectedVariant.inventoryManaged !== false,
        expectedAvailabilityDate: selectedVariant.expectedAvailabilityDate || null,
      });
    }
    const legacy = (product?.quantity > 0) || product?.sellOutOfStock === "Yes";
    return getInventoryPresentation(legacy ? "IN_STOCK" : "OUT_OF_STOCK", { lowStockThreshold });
  }, [selectedVariant, product?.quantity, product?.sellOutOfStock, lowStockThreshold]);

  const canPurchase = presentation.canPurchase;

  const QV_BADGE_COLOR_MAP = {
    green:  { dot: "bg-emerald-500", text: "text-emerald-600" },
    orange: { dot: "bg-amber-500",   text: "text-amber-700"   },
    blue:   { dot: "bg-blue-500",    text: "text-blue-600"    },
    purple: { dot: "bg-purple-500",  text: "text-purple-600"  },
    yellow: { dot: "bg-yellow-500",  text: "text-yellow-700"  },
    red:    { dot: "bg-red-500",     text: "text-red-500"     },
    gray:   { dot: "bg-gray-400",    text: "text-gray-500"    },
  };
  const qvBadgeColors = QV_BADGE_COLOR_MAP[presentation.badgeColor] || QV_BADGE_COLOR_MAP.gray;

  if (!isOpen || !product || !mounted) return null;

  const formatVariable = (val) => {
    if (!val) return '';
    let str = val.toString().trim().replace(/\[\s*/g, '[ ').replace(/\s*\]/g, ' ]');
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getImageUrl = (prod, imgStr) => {
    let img = imgStr || prod?.mainImage || prod?.image || prod?.images?.[0];
    if (!img) return "https://placehold.co/150x200";
    if (img.startsWith("http")) return img;
    if (img.startsWith("//")) return `https:${img}`;
    if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`;
    if (prod?.folderName) return `/images/products/${prod.folderName}/${img}`;
    return "https://placehold.co/150x200";
  };

  const handleAddToCartFromQuickView = () => {
    if (!canPurchase) return;
    setIsAdding(true);
    addToCart({
      ...product,
      selectedSize: qvSelectedSize,
      selectedColor: qvSelectedColor,
      image: getImageUrl(product, qvActiveImage),
      qty: qvQuantity
    });

    // ── Pixel + GA tracking (مطابق لنفس المعاملات في ProductView) ──
    // productId = Firestore doc ID = handle (نفس القيمة)
    // مصادر مختلفة حسب نوع الـ section:
    //   ProductView / TopRatedWeekly: product.handle و product.id
    //   HomePage CMS sections:        product.productId (بدون handle أو id)
    const handle = String(
      product.handle || product.id || product.productId || product.title || ""
    );
    const price  = parseFloat(String(product.price).replace(/[^0-9.]/g, "")) || 0;

    fbTrack("AddToCart", {
      value:        price * qvQuantity,
      currency:     "EGP",
      content_ids:  [handle],
      content_name: product.title || "",
      content_type: "product",
      num_items:    qvQuantity,
    });

    gaAddToCart({
      id:    handle,
      title: product.title || "",
      price,
    }, qvQuantity);

    setTimeout(() => {
      setIsAdding(false);
      onClose();
    }, 600);
  };

  const qvGalleryImages = product?.images || (product?.mainImage ? [product.mainImage] : []);
  
  const inlineGalleryNext = (e) => {
    e?.stopPropagation();
    let activeIdx = qvGalleryImages.indexOf(qvActiveImage);
    if (activeIdx === -1) activeIdx = 0;
    const nextIdx = (activeIdx + 1) % qvGalleryImages.length;
    setQvActiveImage(qvGalleryImages[nextIdx]);
  };

  const inlineGalleryPrev = (e) => {
    e?.stopPropagation();
    let activeIdx = qvGalleryImages.indexOf(qvActiveImage);
    if (activeIdx === -1) activeIdx = 0;
    const prevIdx = (activeIdx - 1 + qvGalleryImages.length) % qvGalleryImages.length;
    setQvActiveImage(qvGalleryImages[prevIdx]);
  };

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  
  const onGalleryTouchEnd = (e) => {
    if (!touchStartX.current) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) { e.stopPropagation(); setGalleryIdx((i) => (i - 1 + qvGalleryImages.length) % qvGalleryImages.length); }
    else if (dx < -50) { e.stopPropagation(); setGalleryIdx((i) => (i + 1) % qvGalleryImages.length); }
    touchStartX.current = null;
  };

  const onQuickViewImageTouchEnd = (e) => {
    if (!touchStartX.current) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx > 0) inlineGalleryPrev(e); 
      else inlineGalleryNext(e);
    }
    touchStartX.current = null;
  };

  const openQvGallery = () => {
    const activeIndex = qvGalleryImages.indexOf(qvActiveImage);
    setGalleryIdx(activeIndex >= 0 ? activeIndex : 0);
    setGalleryOpen(true);
  };

  const closedDescriptionHTML = product?.description 
    ? product.description.replace(/<details\s+open[^>]*>/gi, '<details>') 
    : "";

  // 🌟 الحل السحري لدليل القياسات: 
  // عند فتح دليل القياسات، يتم خفض طبقة (z-index) النظرة السريعة تلقائياً
  // لكي يظهر دليل القياسات فوقها ولا يحدث أي تجميد للصفحة.
  const portalZIndex = isSizeGuideOpen ? "z-[10]" : "z-[999999]";

  const modalContent = (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&family=Tajawal:wght@400;500;700&display=swap');
        .quick-view-wrapper * { font-family: 'Cairo', sans-serif; }

        @keyframes qvFadeIn { from { opacity: 0; transform: scale(0.96) translate(-50%, -50%); } to { opacity: 1; transform: scale(1) translate(-50%, -50%); } }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .qv-overlay { animation: fadeIn 0.2s ease forwards; }

        .qv-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .qv-scroll::-webkit-scrollbar-track { background: transparent; }
        .qv-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

        .pay-btn-qv { background: #1A1A1A; color: #FFFFFF; }
        .pay-btn-qv:hover { background: #333333; transform: translateY(-2px); box-shadow: 0 4px 15px rgba(26,26,26,0.3); }

        .light-wind-tabs .wind-tabs-container details { background:#FFFFFF!important; border:1px solid #EAEAEA!important; border-radius:12px; margin-bottom:12px; padding:0 16px!important; transition:all .3s; }
        .light-wind-tabs .wind-tabs-container details[open] { border-color:#1A1A1A!important; background:#FAF9F6!important; }
        .light-wind-tabs .wind-tabs-container summary { color:#1A1A1A!important; border:none!important; padding:16px 0!important; font-family:'Cairo',sans-serif; font-weight:700; font-size: 15px; cursor:pointer; }
        .light-wind-tabs .wind-tabs-container div { color:#4B5563!important; font-family:'Tajawal',sans-serif; line-height:1.8; padding-bottom: 16px; }
      `}</style>

      {/* 🌟 تم ربط الـ z-index بالمتغير ليتكيف مع النوافذ الأخرى */}
      <div className={`quick-view-wrapper fixed inset-0 ${portalZIndex} flex items-center justify-center p-4`} dir="rtl">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm qv-overlay" onClick={onClose} />
        
        <div className="relative bg-white w-full max-w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden z-10 border border-gray-100 max-h-[90vh] animate-[fadeIn_0.2s_ease-out]">
          <button onClick={onClose} className="absolute top-3 right-3 z-20 w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-[#1A1A1A] hover:bg-white shadow-sm border border-gray-100 transition-colors"><X size={16} /></button>

          <div className="overflow-y-auto qv-scroll pb-4 flex-1">
            <div className="relative w-full h-[280px] bg-[#FAF9F6] p-2 group cursor-pointer" onClick={openQvGallery} onTouchStart={onTouchStart} onTouchEnd={onQuickViewImageTouchEnd}>
              <img src={getImageUrl(product, qvActiveImage)} alt={product.title} className="w-full h-full object-contain select-none" draggable={false} />
              <div className="absolute top-3 left-3 bg-white/90 p-2 rounded-full backdrop-blur-md text-[#1A1A1A] shadow-sm border border-gray-100 opacity-90 group-hover:opacity-100 transition-opacity"><ZoomIn size={16} /></div>
              {qvGalleryImages.length > 1 && (
                <>
                  <button onClick={inlineGalleryPrev} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/50 hover:bg-white/90 text-[#1A1A1A] p-1.5 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-gray-100/50"><ChevronRight size={20} /></button>
                  <button onClick={inlineGalleryNext} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/50 hover:bg-white/90 text-[#1A1A1A] p-1.5 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-gray-100/50"><ChevronLeft size={20} /></button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 hover:bg-black/60 transition-colors backdrop-blur-md text-white px-3 py-1 rounded-full z-10" onClick={(e) => e.stopPropagation()}>
                    <button onClick={inlineGalleryPrev} className="p-0.5 hover:scale-110 transition-transform"><ChevronRight size={12} strokeWidth={3} /></button>
                    <span className="text-[11px] font-bold tracking-widest min-w-[28px] text-center" dir="ltr">{qvGalleryImages.indexOf(qvActiveImage) + 1} / {qvGalleryImages.length}</span>
                    <button onClick={inlineGalleryNext} className="p-0.5 hover:scale-110 transition-transform"><ChevronLeft size={12} strokeWidth={3} /></button>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 pt-4">
              <div className="flex justify-between items-start mb-1 gap-2">
                <h3 className="text-base font-black text-[#1A1A1A] leading-tight flex-1" style={{fontFamily:"Cairo,sans-serif"}}>{product.title}</h3>
                {/* بنشيك على الداتا اللي جاية في البروبس أو في الستيت */}
  {(qvReviewsData.count > 0 || product.reviewsCount > 0) && (
    <div onClick={() => setReviewsModalOpen(true)} className="flex items-center gap-1.5 cursor-pointer group mt-0.5">
      <span className="text-[14px] text-gray-500 font-bold mt-1 group-hover:text-[#1A1A1A] transition-colors underline decoration-transparent group-hover:decoration-gray-400 underline-offset-4">
        ({qvReviewsData.count || product.reviewsCount})
      </span>
      <span className="text-lg font-black text-[#1A1A1A] mt-0.5" style={{fontFamily:"Cairo,sans-serif"}}>
        {qvReviewsData.rating || product.rating}
      </span>
      <Star className="text-[#1A1A1A] fill-[#1A1A1A] group-hover:scale-110 transition-transform" size={18} strokeWidth={2.5} />
    </div>
  )}
              </div>

              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xl font-bold text-[#1A1A1A]" style={{fontFamily:"Impact, sans-serif"}}>{product.price}</span>
                <span className="text-xs font-bold text-gray-500">ج.م</span>
                {product.compareAtPrice && <span className="text-xs text-gray-400 line-through mr-2">{product.compareAtPrice} ج.م</span>}
              </div>

              {/* Stock Status — نفس presentation المركزية المستخدمة في صفحة المنتج */}
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${qvBadgeColors.dot}`}></span>
                  <span className={`text-[12px] font-medium ${qvBadgeColors.text}`}>{presentation.badgeText}</span>
                </div>
                {presentation.showProgressBar && (
                  <div className="mt-1.5 w-full max-w-[200px] h-1.5 bg-[#eee] rounded-full overflow-hidden">
                    <div className={`h-full ${qvBadgeColors.dot} rounded-full transition-all duration-300`} style={{ width: `${presentation.progressValue}%` }}></div>
                  </div>
                )}
              </div>

              {product.description && (
                <button onClick={() => setDescModalOpen(true)} className="w-fit flex items-center gap-1.5 px-3 py-1.5 mb-5 rounded-full bg-[#FAF9F6] border border-[#EAEAEA] hover:bg-gray-100 transition-colors">
                  <Info size={14} className="text-[#005bd3]" />
                  <span className="text-[11px] font-bold text-[#005bd3]">عرض تفاصيل المنتج والخامات</span>
                </button>
              )}

              {qvColors.length > 0 && (
                <div className="mb-4">
                  <span className="text-[11px] font-bold text-gray-500 mb-1.5 block">اللون: <span className="text-[#1A1A1A] ml-1 capitalize">{qvSelectedColor}</span></span>
                  {qvColors.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {qvColors.map((color, i) => {
                        const name = typeof color === "string" ? color : color.name;
                        const swatch = product.colorSwatches?.[name] || (typeof color === "object" ? color.swatch : "#EAEAEA");
                        const isImg = swatch.startsWith("http") || swatch.includes("/");
                        const isSel = qvSelectedColor === name;
                        return (
                          <button key={i} onClick={() => { setQvSelectedColor(name); if (isImg) setQvActiveImage(swatch); }} className={`w-9 h-9 rounded-full overflow-hidden transition-all duration-200 bg-white flex items-center justify-center ${isSel ? "ring-2 ring-[#1A1A1A] ring-offset-2 scale-105 shadow-sm" : "ring-1 ring-gray-200 hover:scale-105"}`} title={formatVariable(name)}>
                            {isImg ? <img src={getImageUrl(product, swatch)} className="w-full h-full object-cover" alt={name} /> : <div style={{backgroundColor: swatch}} className="w-full h-full rounded-full border border-black/5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {qvSizes.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-gray-500">المقاس: <span className="text-[#1A1A1A] ml-1 capitalize">{qvSelectedSize}</span></span>
                    <button onClick={() => setSizeGuideOpen(true)} className="text-[10px] text-[#1A1A1A] font-bold flex items-center gap-1 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1 rounded-full transition-colors shadow-sm"><Info size={12} /> دليل القياسات</button>
                  </div>
                  {qvSizes.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {qvSizes.map(sz => (
                        <button key={sz} onClick={() => setQvSelectedSize(sz)} className={`min-w-[44px] h-9 px-3 text-xs font-bold rounded-lg transition-all duration-200 capitalize ${qvSelectedSize === sz ? "border-[#1A1A1A] ring-1 ring-[#1A1A1A] text-[#1A1A1A] bg-white shadow-sm scale-105" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-[#1A1A1A]"}`}>{formatVariable(sz)}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 w-full mt-2">
                <button
                  onClick={handleAddToCartFromQuickView}
                  disabled={!canPurchase || isAdding}
                  className="pay-btn-qv flex-1 font-black text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{fontFamily:"Cairo,sans-serif"}}
                >
                  <ShoppingBag size={16} />
                  {isAdding ? "جاري الإضافة..." : (canPurchase ? `أضف إلي السلة — ${product.price * qvQuantity} ج.م` : presentation.buttonText)}
                </button>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-1 w-[90px] shrink-0 shadow-sm">
                  <button onClick={() => setQvQuantity(q => q + 1)} className="text-gray-500 hover:text-[#1A1A1A] p-2 transition-colors"><Plus size={16} /></button>
                  <span className="text-[#1A1A1A] font-bold text-sm">{qvQuantity}</span>
                  <button onClick={() => setQvQuantity(q => q > 1 ? q - 1 : 1)} className="text-gray-500 hover:text-[#1A1A1A] p-2 transition-colors"><Minus size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {zoomedImage && (
        <div className="fixed inset-0 z-[1000000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setZoomedImage(null)} dir="ltr">
          <button onClick={() => setZoomedImage(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors backdrop-blur-md shadow-lg z-50"><X size={20} /></button>
          <div className="relative max-w-[95vw] max-h-[90vh] overflow-auto cursor-zoom-out hide-scrollbar rounded-xl" onClick={(e) => e.stopPropagation()}>
            <img src={zoomedImage} alt="Zoom" className="w-auto h-auto max-w-full max-h-[85vh] object-contain transition-transform duration-300 origin-center rounded-xl" />
          </div>
        </div>
      )}

      {isGalleryOpen && (
        <div className="fixed inset-0 z-[1000000] bg-[#FAF9F6]/98 flex flex-col backdrop-blur-md animate-in fade-in duration-200" onClick={() => setGalleryOpen(false)} dir="rtl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAEAEA]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3"><div className="w-[4px] h-5 bg-[#E6AE00] rounded-full" /><span className="text-[#1A1A1A] font-black text-sm" style={{fontFamily:"Cairo,sans-serif"}}>{product.title}</span></div>
            <div className="flex items-center gap-3"><span className="text-gray-500 text-xs font-bold" style={{fontFamily:"Cairo,sans-serif"}}>{galleryIdx + 1} / {qvGalleryImages.length}</span><button onClick={() => setGalleryOpen(false)} className="bg-white hover:bg-gray-100 border border-[#EAEAEA] p-2 rounded-full text-[#1A1A1A] transition-colors shadow-sm"><X size={18} /></button></div>
          </div>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden" onClick={() => setGalleryOpen(false)} onTouchStart={onTouchStart} onTouchEnd={onGalleryTouchEnd}>
            <img key={galleryIdx} src={getImageUrl(product, qvGalleryImages[galleryIdx])} alt="Gallery" className="max-h-full max-w-full object-contain cursor-default select-none" draggable={false} onClick={(e) => e.stopPropagation()} />
            {qvGalleryImages.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setGalleryIdx((i) => (i + 1) % qvGalleryImages.length); }} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white backdrop-blur-sm border border-[#EAEAEA] text-[#1A1A1A] p-3 rounded-full transition-all shadow-md"><ChevronLeft size={22} /></button>
                <button onClick={(e) => { e.stopPropagation(); setGalleryIdx((i) => (i - 1 + qvGalleryImages.length) % qvGalleryImages.length); }} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white backdrop-blur-sm border border-[#EAEAEA] text-[#1A1A1A] p-3 rounded-full transition-all shadow-md"><ChevronRight size={22} /></button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 🌟 دليل القياسات سيعمل الآن بامتياز دون أي تجميد */}
      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={product} />

      {isReviewsModalOpen && (
        <div className="fixed inset-0 z-[1000000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4" dir="rtl">
          <div className="quick-view-panel bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl border border-[#EAEAEA] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-[fadeIn_0.2s_ease-out]">
            <div className="p-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAF9F6] sticky top-0 z-10">
              <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full"></div> تقييمات العملاء</h3>
              <button onClick={() => setReviewsModalOpen(false)} className="bg-white border border-[#EAEAEA] hover:bg-gray-100 p-1.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={20} /></button>
            </div>
            <div className="p-0 overflow-y-auto qv-scroll" dir="rtl"><ProductReviews productHandle={product.handle || product.seo?.handle || product.id} /></div>
          </div>
        </div>
      )}

      {isDescModalOpen && (
        <div className="fixed inset-0 z-[1000000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4" dir="rtl">
          <div className="quick-view-panel bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl border border-[#EAEAEA] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-[fadeIn_0.2s_ease-out]">
            <div className="p-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAF9F6] sticky top-0 z-10">
              <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full"></div> معلومات المنتج والتفاصيل</h3>
              <button onClick={() => setDescModalOpen(false)} className="bg-white border border-[#EAEAEA] hover:bg-gray-100 p-1.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto ql-editor-display light-wind-tabs qv-scroll" dir="rtl"><div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} /></div>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(modalContent, document.body);
}