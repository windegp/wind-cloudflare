"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ShoppingBag, Eye, Heart, Star, X } from '@/components/icons-extra';
import { getDb } from "../../lib/firebase";
import { doc, updateDoc, increment, getDoc } from "firebase/firestore/lite";
import { mutate } from 'swr';

import QuickViewModal from "@/components/QuickViewModal";
import ProductReviews from "@/components/products/ProductReviews";

export default function ProductCard(props) {
  const [mergedProduct, setMergedProduct] = useState(props);
  const [reviewsData, setReviewsData] = useState({ 
    count: props.reviewsCount || 0, 
    rating: props.rating || 0 
  });
  const [isReviewsModalCardOpen, setReviewsModalCardOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => setMounted(true), []);

  // 🔥 استرجاع النجوم بذكاء: Props (PRIMARY) → SessionCache (fallback) → KV API (last resort)
  useEffect(() => {
    const handleToSearch = props.handle || props.seo?.handle || String(props.id);
    if (!handleToSearch) return;

    const cacheKey = `wind_stats_${handleToSearch}`;
    
    // 🔥 PRIORITY 1: Use props.reviewsCount if available (synced from /api/homepage via mutate)
    if (props.reviewsCount !== undefined && props.reviewsCount > 0) {
      const result = { 
        count: props.reviewsCount, 
        rating: props.rating || 5, 
        timestamp: Date.now() 
      };
      setReviewsData(result);
      setMergedProduct(prev => ({ ...prev, reviewsCount: props.reviewsCount, rating: props.rating }));
      // Cache for consistency but don't fetch - props are live via SWR mutation
      sessionStorage.setItem(cacheKey, JSON.stringify(result));
      return; // ✅ No API call needed - props are live!
    }

    // 🔥 PRIORITY 2: No props? Check sessionStorage
    const cachedData = sessionStorage.getItem(cacheKey);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      const cacheAge = Date.now() - (parsed.timestamp || 0);
      
      // Use cache if fresh (< 60 seconds) and no props available
      if (cacheAge < 60000) {
        setReviewsData(parsed);
        setMergedProduct(prev => ({ ...prev, reviewsCount: parsed.count, rating: parsed.rating }));
        // Silently refresh in background if old
        if (cacheAge > 30000) {
          fetchStats(handleToSearch, cacheKey, true); // silent background fetch
        }
        return;
      }
    }

    // 🔥 PRIORITY 3: No props, no fresh cache → fetch from API
    fetchStats(handleToSearch, cacheKey, false);
  }, [props.id, props.handle, props.reviewsCount, props.rating]);

  // Separate fetch function for cleaner control
  const fetchStats = async (handleToSearch, cacheKey, silent) => {
    try {
      const res = await fetch(`/api/product-stats?handle=${encodeURIComponent(handleToSearch)}`);
      if (res.ok) {
        const json = await res.json();     
        const result = { count: json.count, rating: json.rating, timestamp: Date.now() };
        setReviewsData(result);
        if (!silent) {
          setMergedProduct(prev => ({ ...prev, reviewsCount: json.count, rating: json.rating }));
        }
        sessionStorage.setItem(cacheKey, JSON.stringify(result));
      }
    } catch (error) {
      console.error("WIND Error: Product Stats fetch failed", error);
    }
  };

  const { id, handle, title, price, oldPrice, compareAtPrice, category, productCategory, 
type, folderName, mainImage, image, images, variants, colorSwatches, options, colors, collections } = 
mergedProduct;

  // 🔥 تعديل WIND لتوحيد السعر: الأولوية للسعر الرئيسي (Root Price) لضمان التحديث الفوري من الأدمن
  const displayPrice = price || (variants && variants.length > 0 ? variants[0].price : "0");
  const displayOldPrice = (compareAtPrice || oldPrice) || (variants && variants.length > 0 ? variants[0].compareAtPrice : null);
  const discount = displayOldPrice && Number(displayOldPrice) > Number(displayPrice) 
    ? Math.round(((Number(displayOldPrice) - Number(displayPrice)) / Number(displayOldPrice)) * 100) 
    : null;

  const defaultProductImage = (images && images.length > 0) ? images[0] : (image || `/images/products/${folderName}/${mainImage}`);
  
  const [activeCardImage, setActiveCardImage] = useState(null);
  const [activeColorIdx, setActiveColorIdx] = useState(null);

  // 🔥 تعديل WIND: جلب القسم من مصفوفة الأقسام بدلاً من الحقول المكررة
  const displayCategory = (collections && collections.length > 0) 
    ? collections[0].replace(/-/g, ' ') 
    : "WIND";
    
  const productLink = handle ? `/products/${handle}` : `/products/${id}`;

  let cardColors = [];
  if (options && Array.isArray(options)) {
    const colorOpt = options.find(o => o.name?.toLowerCase().includes("color") || o.name === "اللون" || o.name === "لون");
    if (colorOpt && colorOpt.values) cardColors = colorOpt.values.split(',').map(v => v.trim()).filter(Boolean);
  } else if (Array.isArray(colors)) {
    cardColors = colors.map(c => typeof c === 'string' ? c : c.name);
  } else if (variants && Array.isArray(variants)) {
    cardColors = [...new Set(variants.map(v => v.color || (v.title && v.title.includes('/') ? v.title.split('/')[0].trim() : null)).filter(Boolean))];
  }

  const maxDisplayColors = 3;
  const displayColorsList = cardColors.slice(0, maxDisplayColors);
  const remainingColorsCount = cardColors.length - maxDisplayColors;

  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isLikeProcessing, setIsLikeProcessing] = useState(false);

  useEffect(() => {
    if (id) {
      const savedWishlist = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
      setIsWishlisted(savedWishlist.includes(id.toString()));
    }
  }, [id]);

  const handleWishlistToggle = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (isLikeProcessing || !id) return;
    setIsLikeProcessing(true);
    const savedWishlist = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
    const isCurrentlyWishlisted = savedWishlist.includes(id.toString());
    let newWishlist = isCurrentlyWishlisted ? savedWishlist.filter(item => item !== id.toString()) : [...savedWishlist, id.toString()];
    setIsWishlisted(!isCurrentlyWishlisted);
    localStorage.setItem('wind_wishlist', JSON.stringify(newWishlist));
    try {
      const productRef = doc(getDb(), "products", id.toString());
      const likeChange = isCurrentlyWishlisted ? -1 : 1;
      const updatePayload = {
        likesCount: increment(likeChange),
        likesUpdatedAt: new Date().toISOString(),
        weeklyLikesCount: increment(likeChange)
      };
      await updateDoc(productRef, updatePayload);
      // 🔥 مسح KV Cache + تحديث فوري للواجهة
      const resolvedHandle = handle || mergedProduct.handle || mergedProduct.seo?.handle || String(id);
      fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'likes',
          id: id.toString(),
          handle: resolvedHandle
        })
      }).then(() => {
        sessionStorage.removeItem(`wind_stats_${resolvedHandle}`);
        mutate('homepage/data');
        mutate('homepage-products-sections');
        mutate(`product-${id}`);
      }).catch(() => {});
    } catch (e) { console.log("Like Update Failed"); } finally { setIsLikeProcessing(false); }
  };

  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

  // وظيفة لفتح النظرة السريعة وجلب الداتا "عند الطلب" فقط (توفير كوتا)
  const handleOpenQuickView = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const lacksDetails = (!mergedProduct.options?.length && !mergedProduct.variants?.length && !mergedProduct.colors?.length);
    
    if (id && lacksDetails) {
      try {
        const docRef = doc(getDb(), "products", id.toString());
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMergedProduct({ 
            ...docSnap.data(), 
            ...props,
            rating: reviewsData.rating,
            reviewsCount: reviewsData.count 
          });
        }
      } catch (error) {
        console.error("WIND Error: Details Fetch Failed", error);
      }
    }
    setIsQuickViewOpen(true);
  };

  const getImageUrl = (imgStr) => {
    let img = imgStr || defaultProductImage;
    if (!img) return "/placeholder.jpg";
    if (img.startsWith("http")) return img;
    if (img.startsWith("//")) return `https:${img}`;
    if (folderName) return `/images/products/${folderName}/${img}`;
    return "/placeholder.jpg";
  };

  const formatVariable = (val) => {
    if (!val) return '';
    return val.toString().trim().charAt(0).toUpperCase() + val.toString().trim().slice(1);
  };

  // 🔥 المنطق الذكي لاختيار اسم القسم وتنسيقه
  const getSmartCategory = () => {
    // 1. استخراج البيانات من الـ props بأمان تام
    const safeCollections = props.collections || [];
    const safeCategories = props.categories || [];
    const safeSource = props.sourceCategory || "";

    // 2. تحديد الأقسام المتاحة
    const availableCats = safeCollections.length > 0 ? safeCollections : safeCategories;
    let chosen = "";

    // 3. اختيار القسم المناسب
    if (safeSource && availableCats.includes(safeSource)) {
      chosen = safeSource;
    } else if (availableCats.length > 0) {
      const specificCats = availableCats.filter(c => c !== "shop-all" && c !== "best-sellers" && c !== "new-arrivals");
      chosen = specificCats.length > 0 ? specificCats[0] : availableCats[0];
    }

    if (!chosen) return "";

    // 4. تنسيق النص النهائي (تجنب الحروف الكبيرة بالكامل)
    return chosen
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const smartCategoryText = getSmartCategory();

  // 🔥 حماية WIND: ضمان عدم ظهور نجوم رمادية حتى لو الداتا القديمة فيها أخطاء
  const safeRating = Number(reviewsData.rating) || 5;
  const fullStarsCount = Math.round(safeRating);

  return (
    <>
      <div className="group flex flex-col h-full relative" dir="rtl">
        <div className="relative aspect-[4/5] bg-[#EFEFEF] overflow-hidden cursor-pointer" onClick={handleOpenQuickView}>
          {discount && <div className="absolute top-2.5 right-2.5 z-20 bg-[#E04040] text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm font-cairo">تخفيض</div>}
          <Link href={productLink} className="block w-full h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={getImageUrl(activeCardImage || defaultProductImage)}
              alt={title}
              onLoad={() => setImgLoaded(true)}
              className={`w-full h-full object-cover transition-all duration-1000 ease-out ${imgLoaded ? 'scale-100 opacity-100' : 'scale-[1.15] opacity-0'} group-hover:scale-105`}
              loading="lazy"
            />
          </Link>
          <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-10" dir="ltr">
            <button onClick={handleOpenQuickView} className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-colors"><ShoppingBag size={15} strokeWidth={1.5} /></button>
            <button onClick={handleWishlistToggle} disabled={isLikeProcessing} className={`w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md transition-colors ${isWishlisted ? 'text-red-500' : 'text-[#1A1A1A] hover:bg-red-500 hover:text-white'}`}><Heart size={15} strokeWidth={1.5} fill={isWishlisted ? "currentColor" : "none"} /></button>
            <button onClick={handleOpenQuickView} className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-colors"><Eye size={15} strokeWidth={1.5} /></button>
          </div>
        </div>

        <div className="flex flex-col text-right px-1 pb-6 mt-4">
          <span className="text-[#888888] text-[11px] font-bold tracking-widest mb-2 font-tajawal">{smartCategoryText}</span>
          <Link href={productLink}>
            <h3 className="text-[#1A1A1A] text-[14px] md:text-[15px] font-semibold line-clamp-1 hover:text-[#E6AE00] transition-colors mb-1.5 font-cairo">{title}</h3>
          </Link>

          {reviewsData.count > 0 && (
            <div className="flex items-center justify-end w-full mb-3 mt-[-2px]" dir="ltr">
              <div className="flex items-center gap-1.5 cursor-pointer group" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReviewsModalCardOpen(true); }}>
                <span className="text-[#888888] text-[12px] mt-0.5 underline decoration-gray-300 underline-offset-4 transition-colors font-medium">({reviewsData.count})</span>
                <span className="text-[#1A1A1A] text-[13px] font-bold mt-0.5 font-cairo">{reviewsData.rating}</span>
                <div className="flex items-center gap-[2px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className={`w-3.5 h-3.5 group-hover:scale-110 transition-transform ${i < fullStarsCount ? 'text-[#F5C518] fill-[#F5C518]' : 'text-gray-300 fill-gray-300'}`} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-baseline gap-2 mb-4">
            <span className="font-normal text-[14px] font-cairo" style={{ color: discount ? '#E04040' : '#1A1A1A' }}>{displayPrice} ج.م</span>
            {displayOldPrice && discount && <span className="text-gray-400 text-[14px] line-through font-normal font-cairo">{displayOldPrice} ج.م</span>}
          </div>

          {cardColors.length > 0 && (
            <div className="flex items-center gap-2.5">
              {displayColorsList.map((colorName, idx) => {
                const swatchValue = colorSwatches?.[colorName] || colorName;
                const isImg = swatchValue.includes('/') || swatchValue.includes('http');
                const isSelected = activeColorIdx === idx;
                return (
                  <button 
                    key={idx} 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveColorIdx(idx); if (isImg) setActiveCardImage(swatchValue); }}
                    className={`w-[34px] h-[34px] md:w-[38px] md:h-[38px] rounded-full border overflow-hidden shadow-sm p-[2px] transition-all hover:scale-110 ${isSelected ? 'border-[#1A1A1A] scale-110' : 'border-gray-300'}`} 
                    title={formatVariable(colorName)}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden" style={!isImg ? { backgroundColor: swatchValue } : {}}>
                       {isImg && <img src={getImageUrl(swatchValue)} alt={colorName} className="w-full h-full object-cover" />}
                    </div>
                  </button>
                );
              })}
              {remainingColorsCount > 0 && (
                <div className="ml-1 flex items-center justify-center cursor-pointer transition-colors" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsQuickViewOpen(true); }}>
                  <span className="text-[13px] md:text-[14px] text-gray-500 font-semibold hover:text-[#1A1A1A] font-tajawal" dir="ltr">+{remainingColorsCount}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <QuickViewModal product={mergedProduct} isOpen={isQuickViewOpen} onClose={() => setIsQuickViewOpen(false)} />

      {mounted && isReviewsModalCardOpen && createPortal(
        <div className="fixed inset-0 z-[1000000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4" dir="rtl">
          <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl border border-[#EAEAEA] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAF9F6] sticky top-0 z-10">
              <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full"></div> تقييمات العملاء</h3>
              <button onClick={() => setReviewsModalCardOpen(false)} className="bg-white border border-[#EAEAEA] hover:bg-gray-100 p-1.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={20} /></button>
            </div>
            <div className="p-0 overflow-y-auto" dir="rtl"><ProductReviews productHandle={handle || String(id)} /></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}