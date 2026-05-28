"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { products as staticProducts } from "../../../lib/products";
import { useCart } from "../../../context/CartContext";
import { usePageReady, useGlobalLoader } from "../../../context/GlobalLoaderContext";
import { getDb } from "../../../lib/firebase";
import { doc, updateDoc, increment } from "firebase/firestore/lite";
import { mutate } from 'swr'; 
import SizeChartModal from "@/components/SizeChartModal";
import ProductReviews from "@/components/products/ProductReviews";
// استدعاء الهوكات الجديدة لتقليل استهلاك الكوتا
import { useProduct, useRelatedProducts } from "@/hooks/useFirestore";
import { Plus, Minus, Star, Info, Share2, Heart, ImageIcon, X, Truck, Eye, ShieldCheck, ChevronLeft, Search, ChevronRight, ChevronDown, ChevronUp, CreditCard, Banknote } from '@/components/icons-extra';

export default function ProductView({ initialProduct, sourceCategory }) {
  const { id } = useParams();
  const pathname = usePathname();

  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();
  
  const [product, setProduct]               = useState(initialProduct || null);
  const [loading, setLoading]               = useState(!initialProduct);
  const { addToCart }                       = useCart();
  const [activeImage, setActiveImage]       = useState(initialProduct?.images?.[0] || initialProduct?.mainImage || "");
  const [activeIdx, setActiveIdx]           = useState(0);
  const [selectedSize, setSelectedSize]     = useState("");
  const [selectedColor, setSelectedColor]   = useState("");
  const [quantity, setQuantity]             = useState(1);
  const [isSizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [isWishlisted, setIsWishlisted]     = useState(false);
  
  // 🔥 حالة الإعجابات الفعلية المربوطة بالفايربيس 🔥
  const [realLikesCount, setRealLikesCount] = useState(0);
  const [isLikeProcessing, setIsLikeProcessing] = useState(false);

  const [isGalleryOpen, setGalleryOpen]     = useState(false);
  const [galleryIdx, setGalleryIdx]         = useState(0);
  const [isZoomed, setIsZoomed]             = useState(false); 
  const [isImageZoomModalOpen, setImageZoomModalOpen] = useState(false); 
  const [isDescModalOpen, setDescModalOpen] = useState(false); 
  
  const [relatedProducts, setRelatedProducts] = useState([]);
  
  const [realRating, setRealRating] = useState(0);
  const [realReviewsCount, setRealReviewsCount] = useState(0);

  const [isSwipingHero, setIsSwipingHero]   = useState(false);
  const heroTouchStartX                     = useRef(null);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const colorsRef   = useRef(null);
  const thumbScrollRef = useRef(null);

  // 🔥 مراجع السحر لمنع السبام وتقليل الكتابة في فايربيز
  const likeTimeoutRef = useRef(null);
  const pendingActionRef = useRef(0);

  const [thumbScrollTop, setThumbScrollTop] = useState(0);
  const THUMB_HEIGHT = 80; // w-[90px] aspect-[3/4] => ~120px height + 10px gap
  const VISIBLE_THUMBS = 6;
  const maxScroll = Math.max(0, gallery.length - VISIBLE_THUMBS);

  useEffect(() => {
    if (product?.id) {
      const savedWishlist = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
      setIsWishlisted(savedWishlist.includes(product.id));
      // ضبط عدد الإعجابات من بيانات المنتج الأساسية
      setRealLikesCount(product.likesCount || 0);
    }
  }, [product?.id, product?.likesCount]);

  // 🔥 دالة مساعدة للحصول على رقم الأسبوع الحالي 🔥
  const getCurrentWeekString = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };

  // --- إعادة دالة المشاركة التي فُقدت ---
  const handleShare = async (e) => {
    e.stopPropagation();
    const shareData = {
      title: product?.title || 'WIND Shopping',
      text: 'تسوق هذا المنتج الرائع من WIND',
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('تم نسخ الرابط بنجاح!');
      }
    } catch (err) {
      console.log('Share canceled or failed');
    }
  };

  // 🔥 دالة الإعجاب الذكية (Optimistic Update + Debounce) 🔥
  const handleWishlistToggle = (e) => {
    e.stopPropagation();
    if (!product?.id) return;

    const savedWishlist = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
    const isCurrentlyWishlisted = savedWishlist.includes(product.id);
    const currentWeekIdStr = getCurrentWeekString();

    // 1. تحديث الواجهة فوراً بصاروخ (بدون انتظار فايربيز)
    let newWishlist;
    if (isCurrentlyWishlisted) {
      newWishlist = savedWishlist.filter(item => item !== product.id);
      setRealLikesCount(prev => Math.max(0, prev - 1));
      setIsWishlisted(false);
      pendingActionRef.current -= 1; // تسجيل نية الإلغاء
    } else {
      newWishlist = [...savedWishlist, product.id];
      setRealLikesCount(prev => prev + 1);
      setIsWishlisted(true);
      pendingActionRef.current += 1; // تسجيل نية الإعجاب
    }
    localStorage.setItem('wind_wishlist', JSON.stringify(newWishlist));

    // 2. تجميع الطلبات (Debouncing) لمنع استنزاف الكوتا
    // هنستنى 1.5 ثانية، لو العميل داس لاיק ושال اللايك بسرعة (الصافي صفر)، مش هنكلم فايربيز أصلاً!
    if (likeTimeoutRef.current) clearTimeout(likeTimeoutRef.current);

    likeTimeoutRef.current = setTimeout(async () => {
      const netChange = pendingActionRef.current;
      if (netChange === 0) return; // العميل بيلعب في الزرار، وفرنا الكوتا!

      try {
        const productRef = doc(getDb(), "products", product.id.toString());
        const updateData = {
          likesCount: increment(netChange),
          likesUpdatedAt: new Date().toISOString()
        };

        // منطق الأسبوع الذكي
        if (product.currentWeekId === currentWeekIdStr) {
          updateData.weeklyLikesCount = increment(netChange);
        } else if (netChange > 0) {
          updateData.weeklyLikesCount = 1;
          updateData.currentWeekId = currentWeekIdStr;
        }

       // 1. استنى فايربيز يخلص حفظ الأول
        await updateDoc(productRef, updateData);
        pendingActionRef.current = 0; 

        // 2. 🔥 هنا مكان الإضافة الصح! بعد التأكد إن الداتا الجديدة بقت في فايربيز
        fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'likes',
            id: product.id,
            handle: product.handle || product.id
          })
        }).then(() => {
          sessionStorage.removeItem(`wind_stats_${product.handle || product.id}`);
          mutate('homepage/data');
          mutate('homepage-products-sections');
          mutate(`product-${product.id}`);
        }).catch(() => {});

      } catch (error) {
        console.log("Firebase Update Error:", error);
        pendingActionRef.current = 0;
      }
    }, 1500);
  };

  useEffect(() => {
    if (isGalleryOpen || isImageZoomModalOpen || isDescModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isGalleryOpen, isImageZoomModalOpen, isDescModalOpen]);

  // 1. جلب بيانات المنتج الأساسية (أو استخدام الـ Static لو موجود)
  const staticProd = useMemo(() => staticProducts.find(p => p.id.toString() === id?.toString()), [id]);
  const { data: fbProduct, isLoading: productLoading } = useProduct(id);
  
  // دمج البيانات (الأولوية لفايربيز ثم الثابت ثم الـ Initial)
  const activeProduct = fbProduct || staticProd || initialProduct;

  // 2. جلب المنتجات ذات الصلة عبر SWR
  const { data: swrRelated, isLoading: relatedLoading } = useRelatedProducts(activeProduct);

  // تحديث حالة الصفحة والمنتج
  useEffect(() => {
    if (activeProduct) {
      setProduct(activeProduct);
      setRealLikesCount(activeProduct.likesCount || 0);
      
      // ضبط الصور والخيارات الافتراضية مرة واحدة فقط عند تحميل المنتج
      if (!selectedSize || !selectedColor) {
        setActiveImage(activeProduct.images?.[0] || activeProduct.mainImage || activeProduct.image);
        
        let iS = "", iC = "";
        if (activeProduct.options && Array.isArray(activeProduct.options)) {
          activeProduct.options.forEach(opt => {
            const n = (opt.name || "").toLowerCase();
            if ((n.includes("size") || n.includes("مقاس")) && opt.values) iS = opt.values.split(",")[0].trim();
            if ((n.includes("color") || n.includes("لون")) && opt.values) iC = opt.values.split(",")[0].trim();
          });
        }
        setSelectedSize(iS || (activeProduct.sizes?.[0]) || "");
        setSelectedColor(iC || (activeProduct.colors?.[0]?.name || activeProduct.colors?.[0]) || "");
      }
      setLoading(false);
    }
  }, [activeProduct, id]);

  // تحديث المنتجات ذات الصلة عند جاهزيتها
  useEffect(() => {
    if (swrRelated) setRelatedProducts(swrRelated);
  }, [swrRelated]);

  useEffect(() => {
    if (!loading && product) {
      signalPageReady();
    }
  }, [loading, product, pathname, signalPageReady]);

  useEffect(() => {
    setQuantity(1);
  }, [id, selectedSize, selectedColor]);

  const shortDescription = useMemo(() => {
    if (!product?.description) return "";
    let clean = product.description.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "");
    let text = clean.replace(/<[^>]+>/g, '') || "";
    const keywordsToRemove = [/^\s*عن المنتج\s*[:\-\s]*/i, /^\s*الوصف\s*[:\-\s]*/i, /^\s*وصف المنتج\s*[:\-\s]*/i];
    keywordsToRemove.forEach(regex => { text = text.replace(regex, ""); });
    return text.trim().substring(0, 110) + "... ";
  }, [product?.description]);

  const closedDescriptionHTML = useMemo(() => {
    if (!product?.description) return "";
    return product.description.replace(/<details\s+open[^>]*>/gi, '<details>');
  }, [product?.description]);

  if (loading && !product) return null; 
  if (!product) return null;

  const getImageUrl = img => {
    if (!img) return "/placeholder.png";
    if (img.startsWith("http")) return img;
    if (img.startsWith("//")) return `https:${img}`;
    if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`; 
    return `/images/products/${product.folderName || 'default'}/${img}`;
  };

  const getRelatedImageUrl = (rp) => {
    let img = rp.mainImage || rp.image || rp.images?.[0];
    if (!img) return "/placeholder.png";
    if (img.startsWith("http")) return img;
    if (img.startsWith("//")) return `https:${img}`;
    if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`;
    if (rp.folderName) return `/images/products/${rp.folderName}/${img}`;
    return "/placeholder.png";
  };

  const gallery = product.images || [product.mainImage, ...Array.from({length: product.imagesCount || 0}, (_, i) => `${i+1}.webp`)];

  const openGallery = idx => { setGalleryIdx(idx); setIsZoomed(false); setGalleryOpen(true); };
  const galleryNext = () => { setGalleryIdx(i => (i + 1) % gallery.length); setIsZoomed(false); };
  const galleryPrev = () => { setGalleryIdx(i => (i - 1 + gallery.length) % gallery.length); setIsZoomed(false); };
  
  const handleHeroTouchStart = (e) => {
    heroTouchStartX.current = e.touches[0].clientX;
    setIsSwipingHero(true);
  };
  const handleHeroTouchMove = (e) => {
    if (heroTouchStartX.current) setIsSwipingHero(true);
  };
  const handleHeroTouchEnd = (e) => {
    if (!heroTouchStartX.current) return;
    const dx = e.changedTouches[0].clientX - heroTouchStartX.current;
    if (Math.abs(dx) > 40) {
      const currentIndex = gallery.indexOf(activeImage);
      if (dx > 0) {
        const prevIndex = (currentIndex - 1 + gallery.length) % gallery.length;
        setActiveImage(gallery[prevIndex]);
        setActiveIdx(prevIndex);
      } else {
        const nextIndex = (currentIndex + 1) % gallery.length;
        setActiveImage(gallery[nextIndex]);
        setActiveIdx(nextIndex);
      }
    }
    heroTouchStartX.current = null;
    setTimeout(() => {
      setIsSwipingHero(false);
    }, 150);
  };

  const onTouchStart = e => { 
    touchStartX.current = e.touches[0].clientX; 
    touchStartY.current = e.touches[0].clientY; 
  };
  const onTouchEnd   = e => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    
    if (Math.abs(dy) > 100 && Math.abs(dy) > Math.abs(dx)) {
      setGalleryOpen(false);
    } else if (Math.abs(dx) > 50) {
      dx > 0 ? galleryPrev() : galleryNext();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  let safeSizes = [], safeColors = [];
  if (product.options && Array.isArray(product.options)) {
    product.options.forEach(opt => {
      const n = (opt.name || "").toLowerCase();
      if (n.includes("size") || n === "المقاس" || n === "مقاس") safeSizes  = opt.values.split(",").map(s => s.trim()).filter(Boolean);
      if (n.includes("color")|| n === "اللون"  || n === "لون")  safeColors = opt.values.split(",").map(c => c.trim()).filter(Boolean);
    });
  }
  if (!safeSizes.length)  safeSizes  = Array.isArray(product.options?.sizes)  ? product.options.sizes  : (Array.isArray(product.sizes)  ? product.sizes  : []);
  if (!safeColors.length) safeColors = Array.isArray(product.options?.colors) ? product.options.colors : [];

  const currentColorImage = () => {
    if (!selectedColor) return gallery[1] || activeImage;
    const hi = product.colorSwatches?.[selectedColor];
    if (hi && (hi.startsWith("http") || hi.includes("/"))) return hi;
    return gallery[1] || activeImage;
  };

  const scrollToReviews = (e) => {
    e.preventDefault();
    const reviewsElement = document.getElementById("reviews-section");
    if (reviewsElement) {
      reviewsElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const renderCustomHtml = (position) => {
    if (product?.metafields?.customHtmlSnippet && product?.metafields?.customHtmlPosition === position) {
      return (
        <div 
          className={`w-full custom-html-snippet ${position === 'below_cart' ? 'mt-6' : 'mb-6'}`}
          dangerouslySetInnerHTML={{ __html: product.metafields.customHtmlSnippet }} 
        />
      );
    }
    return null;
  };

  const thumbScrollUp = () => setThumbScrollTop(prev => Math.max(0, prev - 1));
  const thumbScrollDown = () => setThumbScrollTop(prev => Math.min(maxScroll, prev + 1));

  // ---------- RENDER ----------
  return (
    <div className="bg-white min-h-screen text-[#111111] pb-10 selection:bg-black selection:text-white">

      {/* ===== MOBILE VIEW ===== */}
      <div className="lg:hidden">

        {/* Hero Image Gallery */}
        <div 
          className="relative w-full aspect-[3/4] bg-[#F5F5F5] group overflow-hidden"
          onClick={() => openGallery(activeIdx)}
          onTouchStart={handleHeroTouchStart}
          onTouchMove={handleHeroTouchMove}
          onTouchEnd={handleHeroTouchEnd}
        >
          <img 
            key={activeImage}
            src={getImageUrl(activeImage)} 
            alt={product.title} 
            className="w-full h-full object-cover transition-all duration-500 ease-out"
          />

          <button 
            onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }} 
            className="absolute top-4 right-4 z-10 bg-white/80 p-2.5 rounded-full border border-[#DDDDDD] text-[#111111] hover:bg-white transition-all duration-300 cursor-zoom-in"
          >
            <Search size={18} />
          </button>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 text-[#111111]/60 text-[10px] tracking-[0.08em] pointer-events-none z-10 bg-white/80 px-3 py-1.5 rounded-full border border-[#DDDDDD]">
            <span>{activeIdx + 1} / {gallery.length}</span>
          </div>
        </div>

        {/* Mobile Gallery Thumbnails - edge-aligned */}
        <div className="overflow-x-auto hide-scrollbar-horizontal">
          <div className="flex gap-2 px-5 pt-3 pb-2" dir="rtl">
            {gallery.map((img, idx) => (
              <button
                key={idx}
                onClick={() => { setActiveImage(img); setActiveIdx(idx); }}
                className={`flex-shrink-0 w-[60px] h-[80px] overflow-hidden border transition-all duration-300 ${
                  activeIdx === idx
                    ? 'border-black opacity-100'
                    : 'border-[#DDDDDD] opacity-60 hover:opacity-90'
                }`}
              >
                <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* === MOBILE CONTENT === */}
        <div className="px-5 pt-2 pb-4" dir="rtl">

          {/* Action Bar */}
          <div className="mb-4 flex items-center gap-5">
            <button onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }} className="flex items-center gap-1.5 text-[#666666] hover:text-[#111111] transition-all duration-300">
              <ImageIcon size={17} />
              <span className="text-[11px] font-medium tracking-[0.08em]">{gallery.length} صور</span>
            </button>
            
            <button onClick={handleWishlistToggle} className="flex items-center gap-1.5 transition-all duration-300 hover:text-black text-[#666666]">
              <Heart size={17} fill={isWishlisted ? "#111111" : "none"} color={isWishlisted ? "#111111" : "currentColor"} className="transition-all duration-300" />
              <span className={`text-[11px] font-medium tracking-[0.08em] transition-colors ${isWishlisted ? 'text-black' : 'text-[#666666]'}`}>
                {realLikesCount > 0 ? (realLikesCount > 999 ? (realLikesCount/1000).toFixed(1) + 'K' : realLikesCount) : "إعجاب"}
              </span>
            </button>

            <button onClick={handleShare} className="flex items-center gap-1.5 text-[#666666] hover:text-[#111111] transition-all duration-300">
              <Share2 size={17} />
              <span className="text-[11px] font-medium tracking-[0.08em]">مشاركة</span>
            </button>
          </div>

          {renderCustomHtml('above_title')}

          {/* Category */}
          {(() => {
            const safeCollections = product?.collections || [];
            const safeCategories = product?.categories || [];
            const availableCats = safeCollections.length > 0 ? safeCollections : safeCategories;
            let displayCategory = sourceCategory;
            if (!displayCategory && availableCats.length > 0) {
              const generalTerms = ['shop-all', 'best-sellers', 'new-arrivals', 'sale'];
              const specificPaths = availableCats.filter(c => typeof c === 'string' && !generalTerms.some(term => c.includes(term)));
              displayCategory = specificPaths.length > 0 ? specificPaths[0] : availableCats[0];
            }
            if (displayCategory) {
              const cleanName = String(displayCategory)
                .replace(/^\//, '')
                .replace(/-/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ')
                .trim();
              return <p className="text-[11px] text-[#666666] tracking-[0.08em] uppercase mb-2 font-medium">{cleanName}</p>;
            }
            return null;
          })()}

          {/* Title */}
          <h1 className="text-xl font-medium text-[#111111] tracking-tight leading-[1.1] mb-1">{product.title}</h1>

          {/* Stars between title and price */}
          <a href="#reviews-section" onClick={scrollToReviews} className="flex items-center gap-2 group w-fit hover:opacity-80 transition-opacity mt-2 mb-2">
            <div className="flex gap-0.5 text-[#FDBA12]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={13} fill={i < Math.round(realRating) ? "currentColor" : "none"} className={i >= Math.round(realRating) ? "text-[#DDDDDD]" : ""} />
              ))}
            </div>
            <span className="text-[11px] text-[#666666] group-hover:text-black transition-colors">
              {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
            </span>
          </a>

          {/* Price + متوفر inline */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-normal text-[#E04040] tracking-[0.02em]">{product.price}</span>
            <span className="text-xs text-[#666666]">ج.م</span>
            {product.compareAtPrice && (
              <span className="text-xs text-[#999999] line-through mr-1">{product.compareAtPrice} ج.م</span>
            )}
            <span className="mr-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-[11px] text-[#666666]">
                {product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? "متوفر" : "غير متوفر"}
              </span>
            </span>
          </div>

          {/* Short Description */}
          {product.description && (
            <div className="mt-4">
              <p className="text-sm leading-relaxed text-[#666666]">
                {shortDescription}
              </p>
              <button 
                onClick={() => setDescModalOpen(true)}
                className="text-[#111111] text-[11px] font-medium flex items-center gap-1 hover:underline underline-offset-4 mt-1"
              >
                <Info size={12} />
                عرض تفاصيل المنتج والخامات
              </button>
            </div>
          )}

          {/* Unified Selectors Area (NO separator between color & size) */}
          <div className="mt-6 border-t border-[#DDDDDD] pt-6">
            {/* Color Selector - larger boxed */}
            {safeColors.length > 0 && (
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-[11px] text-[#666666] tracking-[0.08em] uppercase font-medium">
                    {safeColors.length > 1 ? "اختر اللون" : "اللون"}
                  </span>
                  {selectedColor && <span className="text-[#111111] text-[12px] font-medium capitalize">{selectedColor}</span>}
                </div>
                <div ref={colorsRef} className="flex flex-wrap gap-3">
                  {safeColors.map((ci, i) => {
                    const name  = typeof ci === "string" ? ci : ci.name;
                    const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#DDDDDD");
                    const isImg = hi.startsWith("http") || hi.includes("/");
                    const isSel = selectedColor === name;
                    return (
                      <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name} className="transition-all duration-200">
                        <div className={`w-11 h-11 flex items-center justify-center border transition-all duration-200 bg-white ${isSel ? "border-black ring-1 ring-black" : "border-[#DDDDDD] hover:border-black/40"}`}>
                          {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover" /> : <div style={{backgroundColor:hi}} className="w-full h-full" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size Selector - larger */}
            {safeSizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-[#666666] tracking-[0.08em] uppercase font-medium">
                      {safeSizes.length > 1 ? "اختر المقاس" : "المقاس"}
                    </span>
                    {selectedSize && <span className="text-[#111111] text-[12px] font-medium capitalize">{selectedSize}</span>}
                  </div>
                  <button onClick={() => setSizeGuideOpen(true)} className="text-[11px] text-[#111111] font-medium flex items-center gap-1.5 border border-[#DDDDDD] bg-white hover:border-black px-3 py-0.5 transition-all">
                    <Info size={11} /> دليل القياسات
                  </button>
                </div>
                {safeSizes.length > 1 && (
                  <div className="flex flex-wrap gap-3">
                    {safeSizes.map(sz => (
                      <button key={sz} onClick={() => setSelectedSize(sz)} className={`min-w-[58px] h-10 text-sm font-medium border transition-all duration-200 capitalize ${selectedSize===sz ? "bg-black text-white border-black" : "bg-white text-[#666666] border-[#DDDDDD] hover:border-black hover:text-black"}`}>{sz}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* === MOBILE ADD TO CART === */}
          <div className="mt-6 border-t border-[#DDDDDD] pt-6">
            <div className="sticky bottom-0 pb-4 bg-white pt-2">
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  addToCart({...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity});
                  setQuantity(1);
                }} 
                className="flex-1 text-base font-medium py-[18px] flex items-center justify-center transition-all duration-200 relative overflow-hidden btn-breathe"
                style={{background:'#000', color:'#fff', border:'1px solid #000', letterSpacing:'0.02em'}}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <span className="relative z-10">أضف إلى السلة</span>
                <span className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity"></span>
              </button>
              
              <div className="flex items-center justify-between bg-white border border-[#DDDDDD] px-2 w-[85px] shrink-0">
                <button onClick={() => setQuantity(q => q + 1)} className="text-[#666666] hover:text-black p-1 transition-colors"><Plus size={15} /></button>
                <span className="text-[#111111] text-sm font-medium">{quantity}</span>
                <button onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)} className="text-[#666666] hover:text-black p-1 transition-colors"><Minus size={15} /></button>
              </div>
            </div>
            {renderCustomHtml('below_cart')}
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-6 grid grid-cols-3 gap-px bg-[#E5E5E5]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#666666] justify-center bg-white py-3">
              <Truck size={12} className="text-[#111111]" />
              <span>شحن سريع</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#666666] justify-center bg-white py-3">
              <Eye size={12} className="text-[#111111]" />
              <span>معاينة للطلب</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#666666] justify-center bg-white py-3">
              <ShieldCheck size={12} className="text-[#111111]" />
              <span>استرجاع سهل</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between bg-[#FAFAFA] py-3 px-4 border border-[#E5E5E5]">
            <div className="flex items-center gap-2 text-[11px] text-[#666666]">
              <ShieldCheck size={13} className="text-[#111111]" />
              <span>دفع آمن 100%</span>
            </div>
            <div className="flex items-center gap-3 text-[#999999]">
              <CreditCard size={16} className="hover:text-black transition-colors"/>
              <Banknote size={16} className="hover:text-black transition-colors"/>
              <div className="bg-[#FAFAFA] px-1.5 py-0.5 text-[9px] border border-[#DDDDDD] text-[#111111]">INSTAPAY</div>
              <div className="bg-[#FAFAFA] px-1.5 py-0.5 text-[9px] border border-[#DDDDDD] text-[#111111]">VISA</div>
            </div>
          </div>

          {/* Premium Accordion Section */}
          {product.description && (
            <div className="mt-6 border-t border-[#DDDDDD] pt-5">
              <div className="space-y-0">
                <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                  <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                    <span className="font-medium">عن المنتج</span>
                    <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                  </summary>
                  <div className="pb-5 text-[13px] text-[#666666] leading-relaxed ql-editor-display" dir="rtl">
                    <div dangerouslySetInnerHTML={{__html: closedDescriptionHTML}} />
                  </div>
                </details>
                <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                  <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                    <span className="font-medium">الخامات</span>
                    <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                  </summary>
                  <div className="pb-5 text-[13px] text-[#666666] leading-relaxed">
                    <p>خامات عالية الجودة. يرجى مراجعة ملصق العناية المرفق بالمنتج للحصول على تعليمات الغسيل والاستخدام.</p>
                  </div>
                </details>
                <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                  <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                    <span className="font-medium">المواصفات</span>
                    <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                  </summary>
                  <div className="pb-5 text-[13px] text-[#666666] leading-relaxed">
                    <p>رمز المنتج: {product.id || product.handle || "—"}</p>
                    {product.metafields?.specifications && <p>{product.metafields.specifications}</p>}
                  </div>
                </details>
                <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                  <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                    <span className="font-medium">الشحن والاسترجاع</span>
                    <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                  </summary>
                  <div className="pb-5 text-[13px] text-[#666666] leading-relaxed">
                    <p>شحن سريع خلال 3-7 أيام عمل. إرجاع مجاني خلال 14 يوم من تاريخ الاستلام.</p>
                  </div>
                </details>
              </div>
              {renderCustomHtml('below_description')}
            </div>
          )}

        </div>
      </div>

      {/* ===== DESKTOP VIEW ===== */}
      <div className="hidden lg:block min-h-screen bg-white">
        <div className="max-w-[1440px] mx-auto flex flex-row-reverse" dir="ltr">
          
          {/* RIGHT: Gallery (now on LEFT visually due to flex-row-reverse, but in DOM order: first = right side) */}
          <div className="w-[60%] flex gap-5 p-8 pr-0" dir="rtl">
            {/* Vertical Thumbnails - scrollable carousel */}
            <div className="w-[90px] flex-shrink-0 flex flex-col items-center gap-1.5 relative">
              {thumbScrollTop > 0 && (
                <button onClick={thumbScrollUp} className="w-full py-1 flex items-center justify-center border border-[#DDDDDD] bg-white hover:border-black transition-all duration-300 text-[#666666] hover:text-black">
                  <ChevronUp size={14} />
                </button>
              )}
              <div className="flex flex-col gap-2.5 overflow-hidden" style={{height: `${VISIBLE_THUMBS * 130}px`}}>
                {gallery.slice(thumbScrollTop, thumbScrollTop + VISIBLE_THUMBS).map((img, relIdx) => {
                  const idx = thumbScrollTop + relIdx;
                  return (
                    <button
                      key={idx}
                      onClick={() => { setActiveImage(img); setActiveIdx(idx); }}
                      className={`w-full aspect-[3/4] overflow-hidden border transition-all duration-300 flex-shrink-0 ${
                        activeIdx === idx 
                          ? 'border-black scale-[1.02]' 
                          : 'border-[#E5E5E5] hover:border-[#999999]'
                      }`}
                    >
                      <img 
                        src={getImageUrl(img)} 
                        alt="" 
                        className="w-full h-full object-cover transition-all duration-300"
                      />
                    </button>
                  );
                })}
              </div>
              {thumbScrollTop < maxScroll && (
                <button onClick={thumbScrollDown} className="w-full py-1 flex items-center justify-center border border-[#DDDDDD] bg-white hover:border-black transition-all duration-300 text-[#666666] hover:text-black">
                  <ChevronDown size={14} />
                </button>
              )}
            </div>

            {/* Main Image */}
            <div className="flex-1 relative bg-[#F5F5F5] aspect-[3/4] cursor-zoom-in group overflow-hidden"
              onClick={() => openGallery(activeIdx)}
            >
              <img 
                key={activeImage}
                src={getImageUrl(activeImage)} 
                alt={product.title} 
                className="w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/[0.02] transition-colors"></div>
              <button 
                onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }} 
                className="absolute top-4 right-4 z-10 bg-white/80 p-2 rounded-full border border-[#DDDDDD] text-[#111111] hover:bg-white transition-all duration-300 opacity-0 group-hover:opacity-100"
              >
                <Search size={16} />
              </button>
            </div>
          </div>

          {/* LEFT: Product Info (now on RIGHT visually due to flex-row-reverse) */}
          <div className="w-[40%] p-8 pr-0 flex flex-col justify-start pt-8" dir="rtl">
            {renderCustomHtml('above_title')}

            {/* Category */}
            {(() => {
              const safeCollections = product?.collections || [];
              const safeCategories = product?.categories || [];
              const availableCats = safeCollections.length > 0 ? safeCollections : safeCategories;
              let displayCategory = sourceCategory;
              if (!displayCategory && availableCats.length > 0) {
                const generalTerms = ['shop-all', 'best-sellers', 'new-arrivals', 'sale'];
                const specificPaths = availableCats.filter(c => typeof c === 'string' && !generalTerms.some(term => c.includes(term)));
                displayCategory = specificPaths.length > 0 ? specificPaths[0] : availableCats[0];
              }
              if (displayCategory) {
                const cleanName = String(displayCategory)
                  .replace(/^\//, '')
                  .replace(/-/g, ' ')
                  .split(' ')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(' ')
                  .trim();
                return <p className="text-[11px] text-[#666666] tracking-[0.08em] uppercase mb-2 font-medium">{cleanName}</p>;
              }
              return null;
            })()}

            {/* Title */}
            <h1 className="text-[24px] font-medium text-[#111111] tracking-tight leading-[1.1] mb-3">{product.title}</h1>

            {/* Stars between title and price */}
            <a href="#reviews-section" onClick={scrollToReviews} className="flex items-center gap-2 group w-fit hover:opacity-80 transition-opacity mb-3">
              <div className="flex gap-0.5 text-[#FDBA12]">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} fill={i < Math.round(realRating) ? "currentColor" : "none"} className={i >= Math.round(realRating) ? "text-[#DDDDDD]" : ""} />
                ))}
              </div>
              <span className="text-xs text-[#666666] group-hover:text-black transition-colors">
                {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
              </span>
            </a>

            {/* Price + متوفر inline */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[24px] font-normal text-[#E04040] tracking-[0.02em]">{product.price}</span>
              <span className="text-sm text-[#666666]">ج.م</span>
              {product.compareAtPrice && (
                <span className="text-sm text-[#999999] line-through mr-1">{product.compareAtPrice} ج.م</span>
              )}
              <span className="mr-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="text-xs text-[#666666]">
                  {product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? "متوفر" : "غير متوفر"}
                </span>
              </span>
            </div>

            {/* Short Description */}
            {product.description && (
              <div className="mt-5">
                <p className="text-sm leading-relaxed text-[#666666]">
                  {shortDescription}
                </p>
                <button 
                  onClick={() => setDescModalOpen(true)}
                  className="text-[#111111] text-xs font-medium flex items-center gap-1 hover:underline underline-offset-4 mt-1"
                >
                  <Info size={13} />
                  عرض تفاصيل المنتج والخامات
                </button>
              </div>
            )}

            {/* Unified Selectors Area */}
            <div className="mt-8 border-t border-[#DDDDDD] pt-6">
              {/* Color Selector - larger boxed */}
              {safeColors.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-xs text-[#666666] tracking-[0.08em] uppercase font-medium">
                      {safeColors.length > 1 ? "اختر اللون" : "اللون"}
                    </span>
                    {selectedColor && <span className="text-[#111111] text-sm font-medium capitalize">{selectedColor}</span>}
                  </div>
                  <div ref={colorsRef} className="flex flex-wrap gap-3">
                    {safeColors.map((ci, i) => {
                      const name  = typeof ci === "string" ? ci : ci.name;
                      const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#DDDDDD");
                      const isImg = hi.startsWith("http") || hi.includes("/");
                      const isSel = selectedColor === name;
                      return (
                        <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name} className="transition-all duration-200">
                          <div className={`w-12 h-12 flex items-center justify-center border transition-all duration-200 bg-white ${isSel ? "border-black ring-1 ring-black" : "border-[#DDDDDD] hover:border-black/40"}`}>
                            {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover" /> : <div style={{backgroundColor:hi}} className="w-full h-full" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selector - larger */}
              {safeSizes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-[#666666] tracking-[0.08em] uppercase font-medium">
                        {safeSizes.length > 1 ? "اختر المقاس" : "المقاس"}
                      </span>
                      {selectedSize && <span className="text-[#111111] text-sm font-medium capitalize">{selectedSize}</span>}
                    </div>
                    <button onClick={() => setSizeGuideOpen(true)} className="text-xs text-[#111111] font-medium flex items-center gap-1.5 border border-[#DDDDDD] bg-white hover:border-black px-3 py-0.5 transition-all">
                      <Info size={11} /> دليل القياسات
                    </button>
                  </div>
                  {safeSizes.length > 1 && (
                    <div className="flex flex-wrap gap-3">
                      {safeSizes.map(sz => (
                        <button key={sz} onClick={() => setSelectedSize(sz)} className={`min-w-[60px] h-11 text-sm font-medium border transition-all duration-200 capitalize ${selectedSize===sz ? "bg-black text-white border-black" : "bg-white text-[#666666] border-[#DDDDDD] hover:border-black hover:text-black"}`}>{sz}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ADD TO CART - clean, "أضف إلى السلة" only */}
            <div className="mt-8 border-t border-[#DDDDDD] pt-6">
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    addToCart({...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity});
                    setQuantity(1);
                  }} 
                  className="flex-1 text-base font-medium py-[19px] flex items-center justify-center transition-all duration-200 relative overflow-hidden btn-breathe"
                  style={{background:'#000', color:'#fff', border:'1px solid #000', letterSpacing:'0.02em'}}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  <span className="relative z-10">أضف إلى السلة</span>
                  <span className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity"></span>
                </button>
                
                <div className="flex items-center justify-between bg-white border border-[#DDDDDD] px-2 w-[85px] shrink-0">
                  <button onClick={() => setQuantity(q => q + 1)} className="text-[#666666] hover:text-black p-2 transition-colors"><Plus size={15} /></button>
                  <span className="text-[#111111] text-sm font-medium">{quantity}</span>
                  <button onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)} className="text-[#666666] hover:text-black p-2 transition-colors"><Minus size={15} /></button>
                </div>
              </div>
              {renderCustomHtml('below_cart')}
            </div>

            {/* Trust Badges */}
            <div className="mt-6 grid grid-cols-3 gap-px bg-[#E5E5E5]">
              <div className="flex items-center gap-1.5 text-[11px] text-[#666666] justify-center bg-white py-4">
                <Truck size={13} className="text-[#111111]" />
                <span>شحن سريع</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#666666] justify-center bg-white py-4">
                <Eye size={13} className="text-[#111111]" />
                <span>معاينة للطلب</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#666666] justify-center bg-white py-4">
                <ShieldCheck size={13} className="text-[#111111]" />
                <span>استرجاع سهل</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between bg-[#FAFAFA] py-3 px-4 border border-[#E5E5E5]">
              <div className="flex items-center gap-2 text-xs text-[#666666]">
                <ShieldCheck size={14} className="text-[#111111]" />
                <span>دفع آمن 100%</span>
              </div>
              <div className="flex items-center gap-3 text-[#999999]">
                <CreditCard size={17} className="hover:text-black transition-colors"/>
                <Banknote size={17} className="hover:text-black transition-colors"/>
                <div className="bg-[#FAFAFA] px-1.5 py-0.5 text-[9px] border border-[#DDDDDD] text-[#111111]">INSTAPAY</div>
                <div className="bg-[#FAFAFA] px-1.5 py-0.5 text-[9px] border border-[#DDDDDD] text-[#111111]">VISA</div>
              </div>
            </div>

            {/* Premium Accordion Section Desktop */}
            {product.description && (
              <div className="mt-8 border-t border-[#DDDDDD] pt-5">
                <div className="space-y-0">
                  <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                    <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                      <span className="font-medium">عن المنتج</span>
                      <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                    </summary>
                    <div className="pb-5 text-[13px] text-[#666666] leading-relaxed ql-editor-display" dir="rtl">
                      <div dangerouslySetInnerHTML={{__html: closedDescriptionHTML}} />
                    </div>
                  </details>
                  <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                    <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                      <span className="font-medium">الخامات</span>
                      <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                    </summary>
                    <div className="pb-5 text-[13px] text-[#666666] leading-relaxed">
                      <p>خامات عالية الجودة. يرجى مراجعة ملصق العناية المرفق بالمنتج للحصول على تعليمات الغسيل والاستخدام.</p>
                    </div>
                  </details>
                  <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                    <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                      <span className="font-medium">المواصفات</span>
                      <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                    </summary>
                    <div className="pb-5 text-[13px] text-[#666666] leading-relaxed">
                      <p>رمز المنتج: {product.id || product.handle || "—"}</p>
                      {product.metafields?.specifications && <p>{product.metafields.specifications}</p>}
                    </div>
                  </details>
                  <details className="group border-b border-[#E5E5E5] transition-all duration-500">
                    <summary className="flex items-center justify-between cursor-pointer text-sm text-[#111111] py-4 transition-all duration-300 list-none">
                      <span className="font-medium">الشحن والاسترجاع</span>
                      <span className="text-[#999999] group-open:rotate-45 transition-transform duration-500 text-sm">+</span>
                    </summary>
                    <div className="pb-5 text-[13px] text-[#666666] leading-relaxed">
                      <p>شحن سريع خلال 3-7 أيام عمل. إرجاع مجاني خلال 14 يوم من تاريخ الاستلام.</p>
                    </div>
                  </details>
                </div>
                {renderCustomHtml('below_description')}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ===== BOTTOM SECTIONS (Both Mobile & Desktop) ===== */}
      <div className="max-w-[1440px] mx-auto px-5 lg:px-8" dir="rtl">

        {/* Reviews */}
        <div id="reviews-section" className="py-8 lg:py-12 mt-6 border-t border-[#DDDDDD]">
          <ProductReviews 
            productHandle={product.handle || product.id} 
            onReviewStatsUpdate={(rating, count) => {
               setRealRating(rating);
               setRealReviewsCount(count);
            }}
          />
        </div>

        {/* Related Products */}
        {product.metafields?.hideRelatedSection !== "Yes" && relatedProducts.length > 0 && (
          <div className="py-12 lg:py-16 border-t border-[#DDDDDD]">
            <h2 className="text-sm lg:text-base font-medium text-[#111111] tracking-[0.08em] uppercase mb-8 lg:mb-10">
              منتجات قد تعجبك
            </h2>
            
            <div className="flex gap-5 lg:gap-8 overflow-x-auto hide-scrollbar-horizontal pb-4 -mx-5 px-5 lg:mx-0 lg:px-0" dir="rtl">
              {relatedProducts.map(rp => (
                <Link 
                  href={`/products/${rp.id}`} 
                  key={rp.id} 
                  className="flex-shrink-0 w-[130px] lg:w-[180px] group cursor-pointer block transition-all duration-500"
                >
                  <div className="relative aspect-[3/4] bg-[#F5F5F5] overflow-hidden border border-[#E5E5E5] mb-3 group-hover:border-black/30 transition-all duration-500">
                    <img 
                      src={getRelatedImageUrl(rp)} 
                      alt={rp.title} 
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" 
                    />
                  </div>
                  
                  <div className="px-0.5">
                    <h3 className="text-[12px] lg:text-sm text-[#111111] font-medium line-clamp-2 mb-1 transition-colors group-hover:text-[#666666]">
                      {rp.title}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#111111] font-medium text-xs lg:text-sm">
                        {rp.price}
                      </span>
                      <span className="text-[#666666] text-[9px] lg:text-[11px]">ج.م</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {renderCustomHtml('bottom_page')}

      </div>

      {/* ===== GALLERY MODAL - Refined ===== */}
      {isGalleryOpen && (
        <div 
          className="fixed inset-0 z-[99999] bg-white flex flex-col gallery-enter"
          onClick={() => setGalleryOpen(false)} 
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="text-[#111111] text-sm">{product.title}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#666666] text-xs">{galleryIdx+1} / {gallery.length}</span>
              <button onClick={() => setGalleryOpen(false)} className="bg-white hover:bg-gray-100 border border-[#DDDDDD] p-2 rounded-full text-[#111111] transition-all duration-300">
                <X size={18} />
              </button>
            </div>
          </div>
          
          <div 
            className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#F5F5F5]" 
            onTouchStart={onTouchStart} 
            onTouchEnd={onTouchEnd}
            onClick={e => e.stopPropagation()} 
          >
            <img 
              key={galleryIdx} 
              src={getImageUrl(gallery[galleryIdx])} 
              alt="" 
              onClick={() => setIsZoomed(!isZoomed)}
              className={`max-h-[90vh] max-w-[90vw] object-contain gallery-img-enter transition-transform duration-500 ease-out ${isZoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"}`} 
            />
            
            {!isZoomed && (
              <>
                <button onClick={galleryPrev} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white border border-[#DDDDDD] text-[#111111] p-3 rounded-full transition-all duration-300 hover:border-black"><ChevronRight size={22} strokeWidth={1.5} /></button>
                <button onClick={galleryNext} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white border border-[#DDDDDD] text-[#111111] p-3 rounded-full transition-all duration-300 hover:border-black"><ChevronLeft size={22} strokeWidth={1.5} /></button>
              </>
            )}
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none items-center bg-white/90 px-3 py-1.5 rounded-full border border-[#DDDDDD]">
              {gallery.map((_,i) => <span key={i} className={`rounded-full bg-black transition-all duration-400 ease-out ${galleryIdx===i ? "w-5 h-1.5 opacity-100" : "w-1.5 h-1.5 opacity-25"}`} />)}
            </div>
          </div>
        </div>
      )}

      {/* ===== COLOR ZOOM MODAL ===== */}
      {isImageZoomModalOpen && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#FAFAFA] p-4 animate-[fadeIn_0.3s_ease-out]"
          onClick={() => setImageZoomModalOpen(false)}
        >
          <div className="relative w-full max-w-lg aspect-[3/4] overflow-hidden border border-[#DDDDDD]" onClick={e => e.stopPropagation()}>
            <img src={getImageUrl(currentColorImage())} alt="Zoomed Color" className="w-full h-full object-cover" />
            <button 
              onClick={() => setImageZoomModalOpen(false)} 
              className="absolute top-4 left-4 bg-white/90 hover:bg-white p-2.5 rounded-full text-[#111111] transition-all duration-300 border border-[#DDDDDD]"
            >
              <X size={20} />
            </button>
            <div className="absolute bottom-4 right-4 bg-white/90 px-4 py-2 border border-[#DDDDDD]">
              <span className="text-[#111111] text-sm font-medium">{selectedColor}</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== DESCRIPTION MODAL ===== */}
      {isDescModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-end md:items-center justify-center bg-[#111111]/60 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-sm border border-[#E5E5E5] shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-[fadeIn_0.3s_ease-out]">
            <div className="p-4 border-b border-[#E5E5E5] flex justify-between items-center bg-white sticky top-0 z-10">
              <h3 className="font-medium text-base text-[#111111]">
                معلومات المنتج والتفاصيل
              </h3>
              <button onClick={() => setDescModalOpen(false)} className="bg-white border border-[#DDDDDD] hover:bg-gray-50 p-1.5 rounded-full text-[#666666] transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto ql-editor-display" dir="rtl">
              <div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} />
            </div>
          </div>
        </div>
      )}

      {/* ===== SIZE CHART MODAL ===== */}
      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={product} />

      {/* ===== GLOBAL STYLES ===== */}
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes galleryIn { from{opacity:0} to{opacity:1} }
        @keyframes imgIn { from{opacity:0.4} to{opacity:1} } 

        .gallery-enter { animation: galleryIn 0.25s ease-out }
        .gallery-img-enter { animation: imgIn 0.3s cubic-bezier(0.25,1,0.5,1) }
        
        .hide-scrollbar-horizontal::-webkit-scrollbar { height: 0px; background: transparent; }
        .hide-scrollbar-horizontal { -ms-overflow-style: none; scrollbar-width: none; }
        
        .ql-editor-display ul { list-style-type:disc!important; padding-right:24px!important; margin-bottom:12px; color: #666666; }
        .ql-editor-display ol { list-style-type:decimal!important; padding-right:24px!important; margin-bottom:12px; color: #666666; }
        .ql-editor-display strong { font-weight:700; color:#111111 }
        .ql-editor-display p { margin-bottom:10px; line-height:1.8; color:#666666; }
        
        .ql-editor-display details { border:1px solid #DDDDDD!important; margin-bottom:12px; padding:0 16px!important; }
        .ql-editor-display details[open] { border-color:#999999!important; }
        .ql-editor-display summary { color:#111111!important; font-weight:500; padding:14px 0!important; cursor:pointer; }
        .ql-editor-display summary::-webkit-details-marker { display:none }
        .ql-editor-display div { color:#666666!important; line-height:1.8; padding-bottom: 16px; }

        /* Subtle breathing animation for CTA button */
        @keyframes breathe {
          0%, 100% { transform: translateX(0); }
          15%, 85% { transform: translateX(0); }
          50% { transform: translateX(2px); }
        }
        .btn-breathe {
          animation: breathe 5s ease-in-out infinite;
        }
        .btn-breathe:hover {
          animation: none;
        }
      `}</style>
    </div>
  );
}