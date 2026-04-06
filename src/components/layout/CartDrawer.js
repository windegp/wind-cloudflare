"use client";
import { useEffect, useState, useRef } from "react";
import { useCart } from "../../context/CartContext";
import Link from "next/link";
import { ShoppingBag, Trash2, X, Plus, Star } from '@/components/icons-extra';
import { ZoomIn, Loader2, Minus, Info, ChevronRight, ChevronLeft } from '@/components/icons-extra';
import { getDb } from "../../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore/lite";
import { products as staticProducts } from "../../lib/products";
import SizeChartModal from "@/components/SizeChartModal"; 
import ProductReviews from "@/components/products/ProductReviews"; 

export default function CartDrawer() {
  const { cartItems, isCartOpen, toggleCart, removeFromCart, updateQty, subtotal, addToCart } = useCart();
  
  const [zoomedImage, setZoomedImage] = useState(null);
  const [suggestedProducts, setSuggestedProducts] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // حالات الـ Quick View (النظرة السريعة)
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [qvSizes, setQvSizes] = useState([]);
  const [qvColors, setQvColors] = useState([]);
  const [qvSelectedSize, setQvSelectedSize] = useState("");
  const [qvSelectedColor, setQvSelectedColor] = useState("");
  const [qvActiveImage, setQvActiveImage] = useState("");
  const [qvQuantity, setQvQuantity] = useState(1);
  
  // حالة التقييمات الفعلية المباشرة من الفايربيس
  const [qvReviewsData, setQvReviewsData] = useState({ count: 0, rating: 0 });

  // حالات النوافذ المنبثقة 
  const [isDescModalOpen, setDescModalOpen] = useState(false);
  const [isSizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [isReviewsModalOpen, setReviewsModalOpen] = useState(false);
  
  // حالات معرض الصور الكامل (Gallery)
  const [isGalleryOpen, setGalleryOpen] = useState(false);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const touchStartX = useRef(null);

  // منع السكرول
  useEffect(() => {
    if (isCartOpen || zoomedImage || quickViewProduct || isDescModalOpen || isGalleryOpen || isSizeGuideOpen || isReviewsModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isCartOpen, zoomedImage, quickViewProduct, isDescModalOpen, isGalleryOpen, isSizeGuideOpen, isReviewsModalOpen]);

  // جلب المنتجات المقترحة
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!isCartOpen || cartItems.length === 0) {
        setSuggestedProducts([]);
        return;
      }
      setIsLoadingSuggestions(true);
      try {
        let handles = [];
        cartItems.forEach(item => {
          const crossSells = item.metafields?.cartCrossSellHandles;
          if (crossSells && typeof crossSells === 'string') {
            handles.push(...crossSells.split(',').map(h => h.trim()).filter(Boolean));
          }
        });

        handles = [...new Set(handles)];
        const cartIdsAndHandles = cartItems.flatMap(item => [item.id.toString(), item.handle, item.seo?.handle]).filter(Boolean);
        handles = handles.filter(h => !cartIdsAndHandles.includes(h));

        let fetchedProducts = [];
        handles.forEach(h => {
          const sp = staticProducts.find(p => p.id.toString() === h || p.handle === h || p.seo?.handle === h);
          if (sp && !fetchedProducts.some(fp => fp.id === sp.id)) fetchedProducts.push(sp);
        });

        const missingHandles = handles.filter(h => !fetchedProducts.some(fp => fp.id.toString() === h || fp.seo?.handle === h));

        if (missingHandles.length > 0) {
          const productsRef = collection(getDb(), "products");
          const docsSnaps = await Promise.all(missingHandles.map(h => getDoc(doc(getDb(), "products", h))));
          docsSnaps.forEach(ds => {
            if (ds.exists() && !cartIdsAndHandles.includes(ds.id)) fetchedProducts.push({ id: ds.id, ...ds.data() });
          });
        }

        if (fetchedProducts.length === 0) {
          const firstItem = cartItems[0];
          const refValue = (Array.isArray(firstItem.categories) && firstItem.categories[0]) ||
                           (Array.isArray(firstItem.collections) && firstItem.collections[0]) ||
                           firstItem.type;

          if (refValue) {
            let fallbacks = staticProducts.filter(p => {
              const matchCat = Array.isArray(p.categories) ? p.categories.includes(refValue) : p.categories === refValue;
              const matchCol = Array.isArray(p.collections) ? p.collections.includes(refValue) : p.collections === refValue;
              return (matchCat || matchCol || p.type === refValue) && !cartIdsAndHandles.includes(p.id.toString());
            });
            fetchedProducts.push(...fallbacks);
          }
        }
        setSuggestedProducts(fetchedProducts.slice(0, 6));
      } catch (error) { console.error("Error fetching cart cross-sells:", error); } 
      finally { setIsLoadingSuggestions(false); }
    };
    fetchSuggestions();
  }, [isCartOpen, cartItems]);

  // دالة جلب التقييمات من الفايربيس
  useEffect(() => {
    const fetchRealReviews = async () => {
      if (!quickViewProduct) {
        setQvReviewsData({ count: 0, rating: 0 });
        return;
      }

      try {
        const handleToSearch = quickViewProduct.handle || quickViewProduct.seo?.handle || String(quickViewProduct.id);
        if (!handleToSearch) return;

        const reviewsRef = collection(getDb(), "Reviews");
        
        const q = query(
          reviewsRef, 
          where("productHandle", "==", handleToSearch),
          where("status", "==", "published") 
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          let totalStars = 0;
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            totalStars += Number(data.rating || 5);
          });

          const totalReviews = querySnapshot.size;
          const avgRating = (totalStars / totalReviews).toFixed(1);

          setQvReviewsData({ count: totalReviews, rating: avgRating });
        } else {
          setQvReviewsData({ count: 0, rating: 0 });
        }
      } catch (error) {
        console.error("Error fetching product reviews:", error);
        setQvReviewsData({ count: 0, rating: 0 });
      }
    };

    fetchRealReviews();
  }, [quickViewProduct]);

  // دالة تنسيق المتغيرات (إضافة مسافات للأقواس)
  const formatVariable = (val) => {
    if (!val) return '';
    let str = val.toString().trim();
    str = str.replace(/\[\s*/g, '[ ').replace(/\s*\]/g, ' ]');
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getImageUrl = (product, imgStr) => {
    let img = imgStr || product?.mainImage || product?.image || product?.images?.[0];
    if (!img) return "https://placehold.co/150x200";
    if (img.startsWith("http")) return img;
    if (img.startsWith("//")) return `https:${img}`;
    if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`;
    if (product?.folderName) return `/images/products/${product.folderName}/${img}`;
    return "https://placehold.co/150x200";
  };

  const openQuickView = (product) => {
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
    setQuickViewProduct(product);
  };

  const handleAddToCartFromQuickView = () => {
    if (quickViewProduct) {
      addToCart({
        ...quickViewProduct,
        selectedSize: qvSelectedSize,
        selectedColor: qvSelectedColor,
        image: getImageUrl(quickViewProduct, qvActiveImage),
        qty: qvQuantity
      });
      setQuickViewProduct(null);
    }
  };

  const qvGalleryImages = quickViewProduct?.images || (quickViewProduct?.mainImage ? [quickViewProduct.mainImage] : []);
  
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

  const closedDescriptionHTML = quickViewProduct?.description 
    ? quickViewProduct.description.replace(/<details\s+open[^>]*>/gi, '<details>') 
    : "";

  if (!isCartOpen) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&family=Tajawal:wght@400;500;700&display=swap');
        .cart-drawer * { font-family: 'Cairo', sans-serif; }

        @keyframes slideInLeft { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .cart-panel { animation: slideInLeft 0.28s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .cart-overlay { animation: fadeIn 0.2s ease forwards; }

        @keyframes qvFadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .quick-view-panel { animation: qvFadeIn 0.2s ease-out forwards; }

        .cart-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .cart-scroll::-webkit-scrollbar-track { background: transparent; }
        .cart-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

        .checkout-btn { position: relative; overflow: hidden; background-color: #F5C518 !important; color: #1A1A1A !important; }
        .checkout-btn:active { transform: scale(0.99); }
        
        .pay-btn-qv { background: #F5C518; color: #1A1A1A; }
        .pay-btn-qv:hover { background: #e6b800; }

        .suggested-item img { transition: transform 0.5s ease; }
        .suggested-item:hover img { transform: scale(1.05); }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .light-wind-tabs .wind-tabs-container details { background:#FFFFFF!important; border:1px solid #EAEAEA!important; border-radius:12px; margin-bottom:12px; padding:0 16px!important; transition:all .3s; }
        .light-wind-tabs .wind-tabs-container details[open] { border-color:#1A1A1A!important; background:#FAF9F6!important; }
        .light-wind-tabs .wind-tabs-container summary { color:#1A1A1A!important; border:none!important; padding:16px 0!important; font-family:'Cairo',sans-serif; font-weight:700; font-size: 15px; cursor:pointer; }
        .light-wind-tabs .wind-tabs-container div { color:#4B5563!important; font-family:'Tajawal',sans-serif; line-height:1.8; padding-bottom: 16px; }
      `}</style>

      {/* ════════════════════════════
          شاشة الزووم العادية
      ════════════════════════════ */}
      {zoomedImage && (
        <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setZoomedImage(null)} dir="ltr">
          <button onClick={() => setZoomedImage(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors backdrop-blur-md shadow-lg z-50"><X size={20} /></button>
          <div className="relative max-w-[95vw] max-h-[90vh] overflow-auto cursor-zoom-in hide-scrollbar rounded-xl" onClick={(e) => { e.stopPropagation(); const img = e.currentTarget.querySelector('img'); img.classList.toggle('scale-[1.7]'); e.currentTarget.classList.toggle('cursor-zoom-in'); e.currentTarget.classList.toggle('cursor-zoom-out'); }}>
            <img src={zoomedImage} alt="Zoom" className="w-auto h-auto max-w-full max-h-[85vh] object-contain transition-transform duration-300 origin-center rounded-xl" />
          </div>
        </div>
      )}

      {/* ════════════════════════════
          معرض الصور الكامل (Gallery)
      ════════════════════════════ */}
      {isGalleryOpen && quickViewProduct && (
        <div className="fixed inset-0 z-[100000] bg-[#FAF9F6]/98 flex flex-col backdrop-blur-md animate-in fade-in duration-200" onClick={() => setGalleryOpen(false)} dir="rtl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAEAEA]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-[4px] h-5 bg-[#E6AE00] rounded-full" />
              <span className="text-[#1A1A1A] font-black text-sm" style={{fontFamily:"Cairo,sans-serif"}}>{quickViewProduct.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-bold" style={{fontFamily:"Cairo,sans-serif"}}>{galleryIdx + 1} / {qvGalleryImages.length}</span>
              <button onClick={() => setGalleryOpen(false)} className="bg-white hover:bg-gray-100 border border-[#EAEAEA] p-2 rounded-full text-[#1A1A1A] transition-colors shadow-sm"><X size={18} /></button>
            </div>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center overflow-hidden" onClick={() => setGalleryOpen(false)} onTouchStart={onTouchStart} onTouchEnd={onGalleryTouchEnd}>
            <img key={galleryIdx} src={getImageUrl(quickViewProduct, qvGalleryImages[galleryIdx])} alt="Gallery" className="max-h-full max-w-full object-contain cursor-default select-none" draggable={false} onClick={(e) => e.stopPropagation()} />
            
            {qvGalleryImages.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setGalleryIdx((i) => (i + 1) % qvGalleryImages.length); }} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white backdrop-blur-sm border border-[#EAEAEA] text-[#1A1A1A] p-3 rounded-full transition-all shadow-md"><ChevronLeft size={22} /></button>
                <button onClick={(e) => { e.stopPropagation(); setGalleryIdx((i) => (i - 1 + qvGalleryImages.length) % qvGalleryImages.length); }} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white backdrop-blur-sm border border-[#EAEAEA] text-[#1A1A1A] p-3 rounded-full transition-all shadow-md"><ChevronRight size={22} /></button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════
          نافذة Quick View
      ════════════════════════════ */}
      {quickViewProduct && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm cart-overlay" onClick={() => setQuickViewProduct(null)} />
          
          <div className="quick-view-panel relative bg-white w-full max-w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden z-10 border border-gray-100">
            <button onClick={() => setQuickViewProduct(null)} className="absolute top-3 right-3 z-20 w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-[#1A1A1A] hover:bg-white shadow-sm border border-gray-100 transition-colors"><X size={16} /></button>

            <div className="overflow-y-auto cart-scroll pb-4">
              
              <div className="relative w-full h-[280px] bg-[#FAF9F6] p-2 group cursor-pointer" onClick={openQvGallery} onTouchStart={onTouchStart} onTouchEnd={onQuickViewImageTouchEnd}>
                <img src={getImageUrl(quickViewProduct, qvActiveImage)} alt={quickViewProduct.title} className="w-full h-full object-contain select-none" draggable={false} />
                
                <div className="absolute top-3 left-3 bg-white/90 p-2 rounded-full backdrop-blur-md text-[#1A1A1A] shadow-sm border border-gray-100 opacity-90 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={16} />
                </div>
                
                {qvGalleryImages.length > 1 && (
                  <>
                    <button onClick={inlineGalleryPrev} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/50 hover:bg-white/90 text-[#1A1A1A] p-1.5 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-gray-100/50"><ChevronRight size={20} /></button>
                    <button onClick={inlineGalleryNext} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/50 hover:bg-white/90 text-[#1A1A1A] p-1.5 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-gray-100/50"><ChevronLeft size={20} /></button>
                    
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 hover:bg-black/60 transition-colors backdrop-blur-md text-white px-3 py-1 rounded-full z-10" onClick={(e) => e.stopPropagation()}>
                      <button onClick={inlineGalleryPrev} className="p-0.5 hover:scale-110 transition-transform"><ChevronRight size={12} strokeWidth={3} /></button>
                      <span className="text-[11px] font-bold tracking-widest min-w-[28px] text-center" dir="ltr">
                        {qvGalleryImages.indexOf(qvActiveImage) + 1} / {qvGalleryImages.length}
                      </span>
                      <button onClick={inlineGalleryNext} className="p-0.5 hover:scale-110 transition-transform"><ChevronLeft size={12} strokeWidth={3} /></button>
                    </div>
                  </>
                )}
              </div>

              <div className="px-5 pt-4">
                
                {/* اسم المنتج */}
                <div className="flex justify-between items-start mb-1 gap-2">
                  <h3 className="text-base font-black text-[#1A1A1A] leading-tight flex-1" style={{fontFamily:"Cairo,sans-serif"}}>
                    {quickViewProduct.title}
                  </h3>
                  
                  {/* قسم التقييم بالترتيب الجديد: (عدد التقييمات) ⬅️ التقييم الفعلي ⬅️ النجمة */}
                  {qvReviewsData.count > 0 && (
                    <div 
                      onClick={() => setReviewsModalOpen(true)}
                      className="flex items-center gap-1.5 cursor-pointer group mt-0.5"
                    >
                      <span className="text-[14px] text-gray-500 font-bold mt-1 group-hover:text-[#1A1A1A] transition-colors underline decoration-transparent group-hover:decoration-gray-400 underline-offset-4">
                        ({qvReviewsData.count})
                      </span>
                      
                      <span className="text-lg font-black text-[#1A1A1A] mt-0.5" style={{fontFamily:"Cairo,sans-serif"}}>
                        {qvReviewsData.rating}
                      </span>

                      <Star className="text-[#F5C518] fill-[#F5C518] group-hover:scale-110 transition-transform" size={18} strokeWidth={2.5} />
                    </div>
                  )}
                </div>

                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-xl font-bold text-[#1A1A1A]" style={{fontFamily:"Impact, sans-serif"}}>{quickViewProduct.price}</span>
                  <span className="text-xs font-bold text-gray-500">ج.م</span>
                  {quickViewProduct.compareAtPrice && <span className="text-xs text-gray-400 line-through mr-2">{quickViewProduct.compareAtPrice} ج.م</span>}
                </div>

                {quickViewProduct.description && (
                  <button onClick={() => setDescModalOpen(true)} className="w-fit flex items-center gap-1.5 px-3 py-1.5 mb-5 rounded-full bg-[#FAF9F6] border border-[#EAEAEA] hover:bg-gray-100 transition-colors">
                    <Info size={14} className="text-[#005bd3]" />
                    <span className="text-[11px] font-bold text-[#005bd3]">عرض تفاصيل المنتج والخامات</span>
                  </button>
                )}

                {qvColors.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[11px] font-bold text-gray-500 mb-1.5 block">
                      اللون: <span className="text-[#1A1A1A] ml-1 capitalize">{qvSelectedColor}</span>
                    </span>
                    {qvColors.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {qvColors.map((color, i) => {
                          const name = typeof color === "string" ? color : color.name;
                          const swatch = quickViewProduct.colorSwatches?.[name] || (typeof color === "object" ? color.swatch : "#EAEAEA");
                          const isImg = swatch.startsWith("http") || swatch.includes("/");
                          const isSel = qvSelectedColor === name;
                          return (
                            <button key={i} onClick={() => { setQvSelectedColor(name); if (isImg) setQvActiveImage(swatch); }} className={`w-9 h-9 rounded-full overflow-hidden transition-all duration-200 bg-white flex items-center justify-center ${isSel ? "ring-2 ring-[#1A1A1A] ring-offset-2 scale-105 shadow-sm" : "ring-1 ring-gray-200 hover:scale-105"}`} title={formatVariable(name)}>
                              {isImg ? <img src={getImageUrl(quickViewProduct, swatch)} className="w-full h-full object-cover" alt={name} /> : <div style={{backgroundColor: swatch}} className="w-full h-full rounded-full border border-black/5" />}
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
                      <span className="text-[11px] font-bold text-gray-500">
                        المقاس: <span className="text-[#1A1A1A] ml-1 capitalize">{qvSelectedSize}</span>
                      </span>
                      <button onClick={() => setSizeGuideOpen(true)} className="text-[10px] text-[#1A1A1A] font-bold flex items-center gap-1 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1 rounded-full transition-colors shadow-sm">
                        <Info size={12} /> دليل القياسات
                      </button>
                    </div>
                    {qvSizes.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {qvSizes.map(sz => (
                          <button key={sz} onClick={() => setQvSelectedSize(sz)} className={`min-w-[44px] h-9 px-3 text-xs font-bold rounded-lg transition-all duration-200 capitalize ${qvSelectedSize === sz ? "border-[#1A1A1A] ring-1 ring-[#1A1A1A] text-[#1A1A1A] bg-white shadow-sm scale-105" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-[#1A1A1A]"}`}>
                            {formatVariable(sz)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 w-full mt-2">
                  <button onClick={handleAddToCartFromQuickView} className="pay-btn-qv flex-1 font-black text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-transform hover:-translate-y-0.5" style={{fontFamily:"Cairo,sans-serif"}}>
                    <ShoppingBag size={16} />
                    أضف إلي السلة — {quickViewProduct.price * qvQuantity} ج.م
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
      )}

      {/* ════════════════════════════
          نوافذ منبثقة (دليل مقاسات - تقييمات - تفاصيل)
      ════════════════════════════ */}
      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={quickViewProduct} />

      {isReviewsModalOpen && quickViewProduct && (
        <div className="fixed inset-0 z-[3000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4" dir="rtl">
          <div className="quick-view-panel bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl border border-[#EAEAEA] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAF9F6] sticky top-0 z-10">
              <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full"></div> تقييمات العملاء</h3>
              <button onClick={() => setReviewsModalOpen(false)} className="bg-white border border-[#EAEAEA] hover:bg-gray-100 p-1.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={20} /></button>
            </div>
            <div className="p-0 overflow-y-auto cart-scroll" dir="rtl">
              <ProductReviews productHandle={quickViewProduct.handle || quickViewProduct.seo?.handle || quickViewProduct.id} />
            </div>
          </div>
        </div>
      )}

      {isDescModalOpen && quickViewProduct && (
        <div className="fixed inset-0 z-[3000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4" dir="rtl">
          <div className="quick-view-panel bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl border border-[#EAEAEA] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAF9F6] sticky top-0 z-10">
              <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full"></div> معلومات المنتج والتفاصيل</h3>
              <button onClick={() => setDescModalOpen(false)} className="bg-white border border-[#EAEAEA] hover:bg-gray-100 p-1.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto ql-editor-display light-wind-tabs cart-scroll" dir="rtl">
              <div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} />
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════
          سلة التسوق (Drawer) الأساسية
      ════════════════════════════ */}
      <div className="cart-drawer fixed inset-0 z-[1000] overflow-hidden" dir="rtl">
        <div className="cart-overlay absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }} onClick={toggleCart} />
        <div className="absolute inset-y-0 left-0 flex max-w-full">
          <div className="cart-panel w-screen max-w-[400px] bg-white flex flex-col shadow-2xl">

            <div className="bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100 z-10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 bg-[#F5C518]/10 rounded-xl flex items-center justify-center"><svg className="w-5 h-5 text-[#F5C518]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg></div>
                  {cartItems.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-[#1A1A1A] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">{cartItems.reduce((acc, i) => acc + i.qty, 0)}</span>}
                </div>
                <div>
                  <h2 className="font-black text-[#1A1A1A] text-base leading-tight">حقيبة التسوق</h2>
                  <p className="text-[11px] text-gray-400 font-medium">{cartItems.length === 0 ? 'لا توجد منتجات' : `${cartItems.length} ${cartItems.length === 1 ? 'منتج' : 'منتجات'}`}</p>
                </div>
              </div>
              <button onClick={toggleCart} className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors border border-gray-100"><X size={16} className="text-gray-600" /></button>
            </div>

            <div className="flex-1 overflow-y-auto cart-scroll bg-white flex flex-col">
              <div className="px-5 py-2">
                {cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-5"><ShoppingBag className="w-10 h-10 text-gray-300" strokeWidth={1.5} /></div>
                    <p className="font-bold text-[#1A1A1A] text-base mb-1">حقيبتك فارغة</p>
                    <p className="text-sm text-gray-500 mb-6">ابدأ بإضافة بعض الأناقة لتشكيلتك!</p>
                    <button onClick={toggleCart} className="bg-[#1A1A1A] text-white px-8 py-3 rounded-full font-bold text-sm hover:bg-black transition-colors">مواصلة التسوق</button>
                  </div>
                ) : (
                  cartItems.map((item) => {
                    const imgSrc = item.image || item.images?.[0] || `/images/products/${item.folderName}/${item.mainImage}` || 'https://placehold.co/80x112';
                    return (
                      <div key={`${item.id}-${item.selectedSize}-${item.selectedColor || ''}`} className="flex gap-4 py-5 border-b border-gray-100 last:border-0">
                        <div className="relative w-20 h-28 bg-gray-50 rounded-xl overflow-hidden shrink-0 group/img cursor-zoom-in" onClick={() => setZoomedImage(imgSrc)}>
                          <img src={imgSrc} alt={item.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-[1px] pointer-events-none"><ZoomIn className="text-white drop-shadow-md" size={24} strokeWidth={1.5} /></div>
                        </div>

                        <div className="flex-1 flex flex-col justify-between py-0.5">
                          <div>
                            <h3 className="font-bold text-[#1A1A1A] text-sm leading-snug line-clamp-2 text-right" style={{fontFamily:"Cairo,sans-serif"}}>
                              {item.title}
                              {(item.selectedColor || item.selectedSize) && (
                                <span className="inline-block text-gray-500 font-medium mr-1 capitalize">
                                  {item.selectedColor && item.selectedSize 
                                    ? `- ${formatVariable(item.selectedColor)} / ${formatVariable(item.selectedSize)}`
                                    : item.selectedColor 
                                      ? `- ${formatVariable(item.selectedColor)}`
                                      : item.selectedSize 
                                        ? `- ${formatVariable(item.selectedSize)}` 
                                        : ''}
                                </span>
                              )}
                            </h3>
                            <div className="flex items-center gap-1 text-gray-500 text-sm mt-1.5 font-medium">
                              <span className="font-bold text-[#1A1A1A]">{item.price}</span><span className="text-gray-500">ج.م</span><span className="mx-1 text-xs text-gray-400">x</span><span className="text-gray-400">{item.qty}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center border border-gray-200 rounded-md bg-white h-8" dir="rtl">
                              <button onClick={() => updateQty(item.id, item.selectedSize, 1, item.selectedColor)} className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-black transition-colors text-lg leading-none pb-0.5">+</button>
                              <span className="w-8 text-center text-sm font-bold text-[#1A1A1A]">{item.qty}</span>
                              <button onClick={() => updateQty(item.id, item.selectedSize, -1, item.selectedColor)} className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-black transition-colors text-lg leading-none pb-0.5">−</button>
                            </div>
                            <button onClick={() => removeFromCart(item.id, item.selectedSize, item.selectedColor)} className="text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1.5 group">
                              <span className="text-sm font-medium underline decoration-gray-300 group-hover:decoration-red-500 underline-offset-4 pt-0.5">إزالة</span><Trash2 size={15} className="group-hover:scale-110 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {cartItems.length > 0 && suggestedProducts.length > 0 && (
                <div className="mt-auto bg-[#FAF9F6] border-t border-gray-100 pt-5 pb-6 px-5">
                  <div className="mb-4">
                    <h3 className="text-base md:text-lg font-black text-[#1A1A1A] flex items-center gap-2 leading-none" style={{fontFamily:"Cairo,sans-serif"}}><div className="w-1.5 h-5 bg-[#F5C518] rounded-full shrink-0"></div> أكمل إطلالتك</h3>
                    <p className="text-[12px] font-bold text-gray-400 mt-1.5 leading-none font-tajawal">قد يعجبك أيضاً</p>
                  </div>
                  {isLoadingSuggestions ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto cart-scroll pb-2 -mx-5 px-5">
                      {suggestedProducts.map((product) => (
                        <div key={product.id} onClick={() => openQuickView(product)} className="suggested-item w-[110px] shrink-0 group block cursor-pointer">
                          <div className="w-full h-[140px] rounded-xl overflow-hidden bg-white border border-gray-100 mb-2 relative">
                            <img src={getImageUrl(product)} alt={product.title} className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#1A1A1A] hover:text-white"><Plus size={16} /></div>
                          </div>
                          <h4 className="text-xs font-bold text-gray-800 line-clamp-1 mb-1 capitalize font-tajawal">{formatVariable(product.title)}</h4>
                          <p className="text-xs text-gray-500 font-bold">{product.price} ج.م</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="bg-white border-t border-gray-100 px-5 pt-4 pb-6 z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-base font-bold text-gray-600 font-tajawal">المجموع الفرعي</span>
                  <span className="font-black text-[#1A1A1A] text-xl">{subtotal} <span className="text-sm font-bold text-gray-400">ج.م</span></span>
                </div>
                <p className="text-[12px] text-gray-400 mb-5 font-medium font-tajawal">مصاريف الشحن تُحسب عند الدفع</p>
                <Link href="/checkout" onClick={toggleCart} className="checkout-btn block w-full text-center font-black py-4 rounded-xl text-base transition-all shadow-md">إتمام الطلب — {subtotal} ج.م</Link>
                <button onClick={toggleCart} className="block w-full text-center text-[13px] font-bold text-gray-400 hover:text-[#1A1A1A] transition-colors mt-4 font-tajawal">متابعة التسوق</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}