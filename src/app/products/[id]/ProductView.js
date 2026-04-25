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
import { SWR_KEYS, buildScopedSWRKey } from "@/lib/swr-keys";
import { Plus, Minus, Star, Info, Share2, Heart, ImageIcon, X, Truck, Eye, ShieldCheck, ChevronLeft, Search, ChevronRight, ShoppingBag, CreditCard, Banknote } from '@/components/icons-extra';

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
  // 🔥 مراجع السحر لمنع السبام وتقليل الكتابة في فايربيز
  const likeTimeoutRef = useRef(null);
  const pendingActionRef = useRef(0);

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
    // هنستنى 1.5 ثانية، لو العميل داس لايك ושال اللايك بسرعة (الصافي صفر)، مش هنكلم فايربيز أصلاً!
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
          mutate(buildScopedSWRKey(SWR_KEYS.HOMEPAGE_DATA, pathname));
          mutate(buildScopedSWRKey(SWR_KEYS.HOMEPAGE_SECTIONS, pathname));
          mutate(buildScopedSWRKey(SWR_KEYS.PRODUCT(product.id), pathname));
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

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#1A1A1A] pb-10 selection:bg-[#1A1A1A] selection:text-white">

      <div 
        className="relative w-full h-[65vh] md:h-[75vh] bg-[#F0EEE6] group" 
        onClick={() => openGallery(activeIdx)}
        onTouchStart={handleHeroTouchStart}
        onTouchMove={handleHeroTouchMove}
        onTouchEnd={handleHeroTouchEnd}
      >
        <img 
          key={activeImage}
          src={getImageUrl(activeImage)} 
          alt={product.title} 
          className="w-full h-full object-cover object-top opacity-95 transition-opacity duration-500 animate-[galleryIn_0.4s_ease-out]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/20 to-transparent pointer-events-none"></div>

        <button 
          onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }} 
          className="absolute top-4 right-4 z-10 bg-white/60 p-2.5 rounded-full backdrop-blur-md border border-[#EAEAEA] text-[#1A1A1A] hover:bg-white transition-colors shadow-sm cursor-zoom-in"
        >
          <Search size={18} />
        </button>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 text-[#1A1A1A]/70 text-[10px] md:text-xs font-bold font-sans tracking-[0.2em] pointer-events-none z-10 bg-white/60 px-3 py-1 rounded-full backdrop-blur-sm border border-[#EAEAEA]">
          <span>&lt;</span>
          <span>{activeIdx + 1} / {gallery.length}</span>
          <span>&gt;</span>
        </div>
      </div>

      <div className="px-4 py-4 max-w-4xl mx-auto" dir="rtl">
        
        {/* أزرار الإجراءات العلوية */}
        <div className="mb-4 flex items-center gap-6 pt-1">
          <button onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }} className="flex items-center gap-1.5 text-gray-500 hover:text-[#1A1A1A] transition-colors">
            <ImageIcon size={18} />
            <span className="text-[12px] font-bold" style={{fontFamily:"Cairo,sans-serif"}}>{gallery.length} صور</span>
          </button>
          
          <button 
  onClick={handleWishlistToggle} 
  className="flex items-center gap-1.5 transition-colors hover:text-[#EF4444] text-gray-500"
>
            <Heart size={18} fill={isWishlisted ? "#EF4444" : "none"} color={isWishlisted ? "#EF4444" : "currentColor"} className="transition-all duration-300" />
            {/* 🔥 قراءة الإعجابات الحقيقية بدلاً من الوهمية 🔥 */}
            <span className={`text-[12px] font-bold transition-colors ${isWishlisted ? 'text-[#EF4444]' : 'text-gray-500'}`} style={{fontFamily:"Cairo,sans-serif"}}>
              {realLikesCount > 0 ? (realLikesCount > 999 ? (realLikesCount/1000).toFixed(1) + 'K' : realLikesCount) : "إعجاب"}
            </span>
          </button>

          <button onClick={handleShare} className="flex items-center gap-1.5 text-gray-500 hover:text-[#1A1A1A] transition-colors">
            <Share2 size={18} />
            <span className="text-[12px] font-bold" style={{fontFamily:"Cairo,sans-serif"}}>مشاركة</span>
          </button>
        </div>

        <div className="mb-8">
          {renderCustomHtml('above_title')}

          <h1 className="text-[22px] md:text-2xl font-black text-[#1A1A1A] tracking-tight leading-tight mb-2" style={{fontFamily:"Cairo,sans-serif"}}>{product.title}</h1>
          
          <a href="#reviews-section" onClick={scrollToReviews} className="flex items-center gap-2 group w-fit hover:opacity-80 transition-opacity">
            <div className="flex gap-0.5 text-[#E6AE00]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} fill={i < Math.round(realRating) ? "currentColor" : "none"} className={i >= Math.round(realRating) ? "text-gray-300" : ""} />
              ))}
            </div>
            <span className="text-xs font-bold text-gray-500 group-hover:text-[#1A1A1A] transition-colors" style={{fontFamily:"Cairo,sans-serif"}}>
              {realReviewsCount > 0 ? `(${realReviewsCount} تقييم)` : "(أضف أول تقييم)"}
            </span>
          </a>
          
          <div className="flex items-center gap-3 text-[11px] md:text-[13px] font-medium text-gray-500 mt-4 mb-2" style={{fontFamily:"Cairo,sans-serif"}}>
            <span className="border border-gray-300 bg-white rounded-[4px] px-2 py-0.5 text-gray-600 shadow-sm">
              ويند-{new Date().getFullYear().toString().slice(-2)}
            </span>
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
            <span className="text-gray-600">منتجات ويند</span>
            
            {(() => {
              // 1. قراءة الأقسام بأمان (القديمة والجديدة) بدون الاعتماد على السلاش
              const safeCollections = product?.collections || [];
              const safeCategories = product?.categories || [];
              const availableCats = safeCollections.length > 0 ? safeCollections : safeCategories;
              
              let displayCategory = sourceCategory;

              // 2. اختيار القسم الأنسب لو مش جايين من قسم معين
              if (!displayCategory && availableCats.length > 0) {
                const generalTerms = ['shop-all', 'best-sellers', 'new-arrivals', 'sale'];
                const specificPaths = availableCats.filter(c => typeof c === 'string' && !generalTerms.some(term => c.includes(term)));
                displayCategory = specificPaths.length > 0 ? specificPaths[0] : availableCats[0];
              }

              // 3. التنسيق الاحترافي (إزالة الشرط، وتكبير أول حرف من كل كلمة)
              if (displayCategory) {
                const cleanName = String(displayCategory)
                  .replace(/^\//, '') // إزالة السلاش لو موجود في القديم
                  .replace(/-/g, ' ') // إزالة الشرط
                  .split(' ')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(' ')
                  .trim();
                  
                return (
                  <>
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                    <span className="text-[#1A1A1A] font-bold tracking-wider">{cleanName}</span>
                  </>
                );
              }
              return null;
            })()}
          </div>
        </div>

        <div className="flex gap-4 md:gap-5 items-start border-t border-[#EAEAEA] pt-6">
          <div className="w-28 h-40 md:w-32 md:h-48 flex-shrink-0 rounded-2xl overflow-hidden border border-[#EAEAEA] shadow-md relative group cursor-pointer hover:border-[#1A1A1A] transition-colors bg-white" onClick={() => setImageZoomModalOpen(true)}>
            {safeColors.map((ci, i) => {
              const name  = typeof ci === "string" ? ci : ci.name;
              const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#333");
              const isImg = hi.startsWith("http") || hi.includes("/");
              if (!isImg) return null;
              const isSel = selectedColor === name;
              return (
                <img key={i} src={getImageUrl(hi)} alt={name} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-150" style={{opacity: isSel ? 1 : 0, zIndex: isSel ? 10 : 0}} />
              );
            })}
            <img src={getImageUrl(gallery[1] || activeImage)} alt="poster default" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-150" style={{opacity: (!selectedColor || !product.colorSwatches?.[selectedColor]) ? 1 : 0, zIndex: (!selectedColor || !product.colorSwatches?.[selectedColor]) ? 10 : 0}} />

            <div className="absolute top-0 right-0 bg-white/80 px-1.5 py-1 rounded-bl-md z-20 border-b border-l border-[#EAEAEA]">
              <Search size={13} className="text-[#1A1A1A]" />
            </div>
            
            <div className="absolute inset-0 bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] z-30">
              <div className="bg-white/80 p-2.5 rounded-full border border-[#EAEAEA] text-[#1A1A1A] shadow-lg">
                <Search size={20} />
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col h-40 md:h-48 justify-center gap-3">
            <div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span style={{ fontFamily: 'Impact, sans-serif', letterSpacing: '1px' }} className="text-3xl md:text-4xl font-normal text-[#1A1A1A]">{product.price}</span>
                <span className="text-sm font-bold text-gray-500">ج.م</span>
                {product.compareAtPrice && (
                  <span className="text-xs text-gray-400 line-through mr-1">{product.compareAtPrice} ج.م</span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 bg-white w-fit px-2 py-1 rounded-full border border-[#EAEAEA] shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]"></span>
                </span>
                <span className="text-[11px] font-bold text-[#22c55e]">{product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? "متوفر في المخزون" : "غير متوفر"}</span>
              </div>
            </div>

            {product.description && (
              <div className="relative mt-2 flex flex-col justify-end overflow-hidden flex-1">
                <div className="relative flex-1 overflow-hidden">
                  <p className="text-[11px] leading-relaxed text-gray-500 text-right pr-1 font-tajawal">
                    {shortDescription}
                  </p>
                  <div className="absolute bottom-0 w-full h-8 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/90 to-transparent pointer-events-none"></div>
                </div>
                <button 
                  onClick={() => setDescModalOpen(true)}
                  className="text-[#1A1A1A] text-[10px] font-bold flex items-center gap-1 hover:underline underline-offset-4 w-fit pt-1 pr-1 transition-opacity hover:opacity-70"
                >
                  <Info size={12} />
                  عرض تفاصيل المنتج والخامات
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 space-y-10 border-t border-[#EAEAEA] pt-8">
          
          {safeColors.length > 0 && (
            <div>
              <div className="flex items-baseline gap-2 mb-5">
                <div className="w-[4px] h-[16px] bg-[#E6AE00] rounded-full self-center" />
                <span className="text-xs font-bold text-gray-500 tracking-widest uppercase" style={{fontFamily:"Cairo,sans-serif"}}>
                  {safeColors.length > 1 ? "اختر اللون :" : "اللون :"}
                </span>
                {selectedColor && <span className="text-[#1A1A1A] text-[13px] font-bold capitalize ml-1 font-tajawal">{selectedColor}</span>}
              </div>
              <div ref={colorsRef} className="flex flex-wrap gap-4">
                {safeColors.map((ci, i) => {
                  const name  = typeof ci === "string" ? ci : ci.name;
                  const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#EAEAEA");
                  const isImg = hi.startsWith("http") || hi.includes("/");
                  const isSel = selectedColor === name;
                  return (
                    <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name} className="flex flex-col items-center group/c transition-all duration-300 ease-out">
                      <div className={`w-11 h-11 rounded-xl overflow-hidden transition-all duration-300 ease-out bg-white ${isSel ? "ring-2 ring-[#1A1A1A] ring-offset-2 ring-offset-[#FAF9F6] shadow-md scale-[1.08]" : "ring-1 ring-[#EAEAEA] hover:ring-[#1A1A1A]/50 hover:shadow-sm hover:-translate-y-1"}`}>
                        {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover" /> : <div style={{backgroundColor:hi}} className="w-full h-full border border-black/5 rounded-xl" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {safeSizes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-baseline gap-2">
                  <div className="w-[4px] h-[16px] bg-[#E6AE00] rounded-full self-center" />
                  <span className="text-xs font-bold text-gray-500 tracking-widest uppercase" style={{fontFamily:"Cairo,sans-serif"}}>
                    {safeSizes.length > 1 ? "اختر المقاس :" : "المقاس :"}
                  </span>
                  {selectedSize && <span className="text-[#1A1A1A] text-[13px] font-bold capitalize ml-1 font-tajawal">{selectedSize}</span>}
                </div>
                <button onClick={() => setSizeGuideOpen(true)} className="text-[11px] text-[#1A1A1A] font-bold flex items-center gap-1.5 border border-[#EAEAEA] bg-white hover:border-[#1A1A1A]/50 hover:bg-[#FAF9F6] px-4 py-1.5 rounded-full transition-all shadow-sm" style={{fontFamily:"Cairo,sans-serif"}}>
                  <Info size={13} /> دليل القياسات
                </button>
              </div>
              {safeSizes.length > 1 && (
                <div className="flex flex-wrap gap-2.5">
                  {safeSizes.map(sz => (
                    <button key={sz} onClick={() => setSelectedSize(sz)} className={`min-w-[58px] h-10 text-sm font-black rounded-xl border transition-all duration-200 capitalize ${selectedSize===sz ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-md scale-105" : "bg-white text-gray-500 border-[#EAEAEA] hover:border-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:shadow-sm"}`} style={{fontFamily:"Cairo,sans-serif"}}>{sz}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-6">
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  addToCart({...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity});
                  setQuantity(1);
                }} 
                className="pay-btn flex-1 font-black text-base py-4 rounded-[8px] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(245,197,24,0.3)] transition-all group/cta tracking-wide" 
                style={{fontFamily:"Cairo,sans-serif"}}
              >
                <ShoppingBag size={18} className="transition-transform group-hover/cta:-translate-y-0.5" />
                أضف إلي السلة — {(product.price * quantity)} ج.م
              </button>
              
              <div className="flex items-center justify-between bg-white border border-[#EAEAEA] rounded-[8px] px-2 w-[100px] shrink-0 transition-colors hover:border-[#1A1A1A]/30 shadow-sm">
                <button onClick={() => setQuantity(q => q + 1)} className="text-gray-500 hover:text-[#1A1A1A] p-2 transition-colors"><Plus size={16} /></button>
                <span className="text-[#1A1A1A] font-bold text-sm" style={{fontFamily:"Cairo,sans-serif"}}>{quantity}</span>
                <button onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)} className="text-gray-500 hover:text-[#1A1A1A] p-2 transition-colors"><Minus size={16} /></button>
              </div>
            </div>
            {renderCustomHtml('below_cart')}
          </div>
        </div>

        <div className="mt-8 flex justify-between items-center bg-white py-3 px-2 md:px-4 rounded-xl border border-[#EAEAEA] shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-gray-600 font-bold flex-1 justify-center">
            <Truck size={14} className="text-[#1A1A1A]" />
            <span>شحن سريع</span>
          </div>
          <div className="w-px h-6 bg-[#EAEAEA]"></div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-gray-600 font-bold flex-1 justify-center">
            <Eye size={14} className="text-[#1A1A1A]" />
            <span>معاينة للطلب</span>
          </div>
          <div className="w-px h-6 bg-[#EAEAEA]"></div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-gray-600 font-bold flex-1 justify-center">
            <ShieldCheck size={14} className="text-[#1A1A1A]" />
            <span>استرجاع سهل</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between bg-white py-3 px-4 rounded-xl border border-[#EAEAEA] shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-gray-600 font-medium">
            <ShieldCheck size={14} className="text-green-500" />
            <span>دفع آمن 100%</span>
          </div>
          <div className="flex items-center gap-3 text-gray-400">
             <CreditCard size={18} className="hover:text-[#1A1A1A] transition-colors"/>
             <Banknote size={18} className="hover:text-[#1A1A1A] transition-colors"/>
             <div className="bg-[#FAF9F6] px-1.5 py-0.5 rounded text-[9px] border border-[#EAEAEA] text-[#1A1A1A] font-bold tracking-wider">INSTAPAY</div>
             <div className="bg-[#FAF9F6] px-1.5 py-0.5 rounded text-[9px] border border-[#EAEAEA] text-[#1A1A1A] font-bold tracking-wider">VISA</div>
          </div>
        </div>

        {product.description && (
          <div className="py-8 border-t border-[#EAEAEA] mt-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full" />
              <span className="text-sm font-bold text-[#1A1A1A] tracking-wide" style={{fontFamily:"Cairo,sans-serif"}}>تفاصيل المنتج</span>
            </div>
            <div className="ql-editor-display light-wind-tabs" dir="rtl">
              <div dangerouslySetInnerHTML={{__html: closedDescriptionHTML}} />
            </div>
            {renderCustomHtml('below_description')}
          </div>
        )}
        
        <div id="reviews-section" className="py-4 mt-2">
          <ProductReviews 
            productHandle={product.handle || product.id} 
            onReviewStatsUpdate={(rating, count) => {
               setRealRating(rating);
               setRealReviewsCount(count);
            }}
          />
        </div>

        {product.metafields?.hideRelatedSection !== "Yes" && relatedProducts.length > 0 && (
          <div className="py-10 border-t border-[#EAEAEA] mt-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-[4px] h-[24px] bg-[#E6AE00] rounded-full" />
              <h2 className="text-xl md:text-2xl font-black text-[#1A1A1A] tracking-tight" style={{fontFamily:"Cairo,sans-serif"}}>
                منتجات قد تعجبك
              </h2>
            </div>
            
            <div className="flex gap-4 md:gap-6 overflow-x-auto hide-scrollbar-horizontal pb-4 pt-2 -mx-4 px-4 md:mx-0 md:px-0" dir="rtl">
              {relatedProducts.map(rp => (
                <Link 
                  href={`/products/${rp.id}`} 
                  key={rp.id} 
                  className="flex-shrink-0 w-[150px] md:w-[200px] group cursor-pointer block transition-all duration-300"
                >
                  <div className="relative aspect-[3/4] bg-white rounded-2xl overflow-hidden border border-[#EAEAEA] shadow-sm mb-3 group-hover:border-[#1A1A1A]/30 group-hover:shadow-lg transition-all duration-500">
                    <img 
                      src={getRelatedImageUrl(rp)} 
                      alt={rp.title} 
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10">
                      <div className="bg-white text-[#1A1A1A] p-2.5 rounded-full shadow-md hover:bg-[#1A1A1A] hover:text-white transition-colors">
                        <ShoppingBag size={16} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right px-1">
                    <h3 className="text-sm md:text-base text-[#1A1A1A] font-bold line-clamp-2 mb-1.5 transition-colors group-hover:text-gray-600" style={{fontFamily:"Cairo,sans-serif"}}>
                      {rp.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[#1A1A1A] font-black text-sm md:text-lg" style={{fontFamily:"Impact, sans-serif", letterSpacing:"1px"}}>
                        {rp.price}
                      </span>
                      <span className="text-gray-500 text-[10px] md:text-xs font-bold mt-1">ج.م</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {renderCustomHtml('bottom_page')}

      </div>

      {isGalleryOpen && (
        <div 
          className="fixed inset-0 z-[99999] bg-[#FAF9F6]/98 flex flex-col gallery-enter backdrop-blur-md"
          onClick={() => setGalleryOpen(false)} 
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAEAEA]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-[4px] h-5 bg-[#E6AE00] rounded-full" />
              <span className="text-[#1A1A1A] font-black text-sm" style={{fontFamily:"Cairo,sans-serif"}}>{product.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-bold" style={{fontFamily:"Cairo,sans-serif"}}>{galleryIdx+1} / {gallery.length}</span>
              <button onClick={() => setGalleryOpen(false)} className="bg-white hover:bg-gray-100 border border-[#EAEAEA] p-2 rounded-full text-[#1A1A1A] transition-colors shadow-sm"><X size={18} /></button>
            </div>
          </div>
          
          <div 
            className="flex-1 relative flex items-center justify-center overflow-hidden" 
            onTouchStart={onTouchStart} 
            onTouchEnd={onTouchEnd}
            onClick={e => e.stopPropagation()} 
          >
            <img 
              key={galleryIdx} 
              src={getImageUrl(gallery[galleryIdx])} 
              alt="" 
              onClick={() => setIsZoomed(!isZoomed)}
              className={`max-h-full max-w-full object-contain gallery-img-enter transition-transform duration-300 ${isZoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"}`} 
            />
            
            {!isZoomed && (
              <>
                <button onClick={galleryPrev} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white backdrop-blur-sm border border-[#EAEAEA] hover:border-[#1A1A1A] text-[#1A1A1A] p-3 rounded-full transition-all shadow-md"><ChevronRight size={22} strokeWidth={1.5} /></button>
                <button onClick={galleryNext} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white backdrop-blur-sm border border-[#EAEAEA] hover:border-[#1A1A1A] text-[#1A1A1A] p-3 rounded-full transition-all shadow-md"><ChevronLeft size={22} strokeWidth={1.5} /></button>
              </>
            )}
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none items-center bg-white/60 px-3 py-1.5 rounded-full backdrop-blur-sm border border-[#EAEAEA]">
              {gallery.map((_,i) => <span key={i} className={`rounded-full bg-[#1A1A1A] transition-all duration-400 ease-out ${galleryIdx===i ? "w-5 h-1.5 opacity-100" : "w-1.5 h-1.5 opacity-25"}`} />)}
            </div>
          </div>
        </div>
      )}

      {isImageZoomModalOpen && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#FAF9F6]/95 backdrop-blur-md p-4 animate-[fadeIn_0.3s_ease-out]"
          onClick={() => setImageZoomModalOpen(false)}
        >
          <div className="relative w-full max-w-lg aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-[#EAEAEA]" onClick={e => e.stopPropagation()}>
            <img src={getImageUrl(currentColorImage())} alt="Zoomed Color" className="w-full h-full object-cover" />
            <button 
              onClick={() => setImageZoomModalOpen(false)} 
              className="absolute top-4 left-4 bg-white/80 hover:bg-white p-2.5 rounded-full text-[#1A1A1A] transition-colors backdrop-blur-sm border border-[#EAEAEA] shadow-sm"
            >
              <X size={20} />
            </button>
            <div className="absolute bottom-4 right-4 bg-white/90 px-4 py-2 rounded-full backdrop-blur-sm border border-[#EAEAEA] shadow-sm">
              <span className="text-[#1A1A1A] font-bold text-sm">{selectedColor}</span>
            </div>
          </div>
        </div>
      )}

      {isDescModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl border border-[#EAEAEA] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-[fadeIn_0.3s_ease-out]">
            <div className="p-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAF9F6] sticky top-0 z-10">
              <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2">
                <div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full"></div>
                معلومات المنتج والتفاصيل
              </h3>
              <button onClick={() => setDescModalOpen(false)} className="bg-white border border-[#EAEAEA] hover:bg-gray-100 p-1.5 rounded-full text-gray-500 transition-colors shadow-sm">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto ql-editor-display light-wind-tabs" dir="rtl">
              <div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} />
            </div>
          </div>
        </div>
      )}

      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={product} />

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@300;400;500;700&display=swap');
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes galleryIn { from{opacity:0} to{opacity:1} }
        @keyframes imgIn { from{opacity:0.4} to{opacity:1} } 

        .gallery-enter { animation: galleryIn 0.25s ease-out }
        .gallery-img-enter { animation: imgIn 0.3s cubic-bezier(0.25,1,0.5,1) }
        
        .hide-scrollbar-horizontal::-webkit-scrollbar { height: 0px; background: transparent; }
        .hide-scrollbar-horizontal { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes shineContinuous {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .pay-btn {
          background: #F5C518;
          color: #1A1A1A;
          position: relative;
          overflow: hidden;
        }
        .pay-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%);
          background-size: 250% auto;
          animation: shineContinuous 2.5s linear infinite;
        }
        .pay-btn:hover { background: #e6b800; transform: translateY(-2px); box-shadow: 0 8px 25px rgba(245,197,24,0.4); }

        .light-wind-tabs .wind-tabs-container { background:transparent!important }
        .light-wind-tabs .wind-tabs-container details { background:#FFFFFF!important; border:1px solid #EAEAEA!important; border-radius:12px; margin-bottom:12px; padding:0 16px!important; transition:all .3s; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .light-wind-tabs .wind-tabs-container details[open] { border-color:#1A1A1A!important; background:#FAF9F6!important; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .light-wind-tabs .wind-tabs-container summary { color:#1A1A1A!important; border:none!important; padding:16px 0!important; font-family:'Cairo',sans-serif; font-weight:700; font-size: 15px; }
        .light-wind-tabs .wind-tabs-container summary::-webkit-details-marker { display:none }
        .light-wind-tabs .wind-tabs-container summary svg path { stroke:#1A1A1A!important }
        .light-wind-tabs .wind-tabs-container div { color:#4B5563!important; font-family:'Tajawal',sans-serif; line-height:1.8; padding-bottom: 16px; }
        .light-wind-tabs .wind-tabs-container span[style*="color: #800020"] { color:#1A1A1A!important; font-weight: bold; }
        .light-wind-tabs .wind-tabs-container div[style*="border-bottom: 1px solid #f3f4f6"] { border-bottom:1px solid #EAEAEA!important }
        .light-wind-tabs .wind-tabs-container div[style*="color: #111827"], .light-wind-tabs .wind-tabs-container strong[style*="color: #111827"] { color:#1A1A1A!important }
        .light-wind-tabs .wind-tabs-container button, .light-wind-tabs .wind-tabs-container .read-more-wrapper summary { color:#1A1A1A!important; font-weight: bold; text-decoration: underline; }
        .light-wind-tabs .wind-tabs-container summary:hover { background-color:transparent!important; color: #1A1A1A!important; }
        
        .ql-editor-display ul { list-style-type:disc!important; padding-right:24px!important; margin-bottom:12px; color: #4B5563; }
        .ql-editor-display ol { list-style-type:decimal!important; padding-right:24px!important; margin-bottom:12px; color: #4B5563; }
        .ql-editor-display strong { font-weight:800; color:#1A1A1A }
        .ql-editor-display p { margin-bottom:10px; line-height:1.8; color:#4B5563; font-family:'Tajawal',sans-serif }
      `}</style>
    </div>
  );
}
