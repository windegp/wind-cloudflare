"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { useProduct, useRelatedProducts } from "@/hooks/useFirestore";
import { Plus, Minus, Star, Info, Share2, Heart, ImageIcon, X, Truck, Eye, ShieldCheck, ChevronLeft, Search, ChevronRight, ChevronDown, ChevronUp, CreditCard, Banknote, ArrowLeftRight } from '@/components/icons-extra';

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
  const [realLikesCount, setRealLikesCount] = useState(0);
  const [isLikeProcessing, setIsLikeProcessing] = useState(false);
  const [isGalleryOpen, setGalleryOpen]     = useState(false);
  const [galleryIdx, setGalleryIdx]         = useState(0);
  const [isZoomed, setIsZoomed]             = useState(false); 
  const [isImageZoomModalOpen, setImageZoomModalOpen] = useState(false); 
  const [isDescModalOpen, setDescModalOpen] = useState(false); 
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [realRating, setRealRating]         = useState(0);
  const [realReviewsCount, setRealReviewsCount] = useState(0);
  const [isSwipingHero, setIsSwipingHero]   = useState(false);
  const heroTouchStartX                     = useRef(null);
  const touchStartX  = useRef(null);
  const touchStartY  = useRef(null);
  const colorsRef    = useRef(null);
  const likeTimeoutRef   = useRef(null);
  const pendingActionRef = useRef(0);
  const [thumbScrollTop, setThumbScrollTop] = useState(0);
 const [isStickyVisible, setIsStickyVisible] = useState(true);
  const [isStickyOptionsOpen, setIsStickyOptionsOpen] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const addToCartBtnRef = useRef(null);
  const VISIBLE_THUMBS = 6;

   const likesFromServerRef = useRef(null);

  useEffect(() => {
    if (product?.id) {
      const savedWishlist = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
      setIsWishlisted(savedWishlist.includes(product.id));
      if (likesFromServerRef.current === null) {
        setRealLikesCount(product.likesCount || 0);
        likesFromServerRef.current = product.likesCount || 0;
      }
    }
  }, [product?.id, product?.likesCount]);

  const getCurrentWeekString = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    const shareData = { title: product?.title || 'WIND Shopping', text: 'تسوق هذا المنتج الرائع من WIND', url: window.location.href };
    try {
      if (navigator.share) { await navigator.share(shareData); }
      else { await navigator.clipboard.writeText(window.location.href); alert('تم نسخ الرابط بنجاح!'); }
    } catch (err) { console.log('Share canceled or failed'); }
  };

  const handleWishlistToggle = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    const savedWishlist = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
    const isCurrentlyWishlisted = savedWishlist.includes(product.id);
    const currentWeekIdStr = getCurrentWeekString();
    let newWishlist;
    if (isCurrentlyWishlisted) {
      newWishlist = savedWishlist.filter(item => item !== product.id);
      setRealLikesCount(prev => Math.max(0, prev - 1));
      setIsWishlisted(false);
      pendingActionRef.current -= 1;
    } else {
      newWishlist = [...savedWishlist, product.id];
      setRealLikesCount(prev => prev + 1);
      setIsWishlisted(true);
      pendingActionRef.current += 1;
    }
    localStorage.setItem('wind_wishlist', JSON.stringify(newWishlist));
     mutate(`product-${product.id}`);
    if (likeTimeoutRef.current) clearTimeout(likeTimeoutRef.current);
    likeTimeoutRef.current = setTimeout(async () => {
      const netChange = pendingActionRef.current;
      if (netChange === 0) return;
      try {
        const productRef = doc(getDb(), "products", product.id.toString());
        const updateData = { likesCount: increment(netChange), likesUpdatedAt: new Date().toISOString() };
        if (product.currentWeekId === currentWeekIdStr) { updateData.weeklyLikesCount = increment(netChange); }
        else if (netChange > 0) { updateData.weeklyLikesCount = 1; updateData.currentWeekId = currentWeekIdStr; }
        await updateDoc(productRef, updateData);
        likesFromServerRef.current = null;
        pendingActionRef.current = 0;
        fetch('/api/revalidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'likes', id: product.id, handle: product.handle || product.id }) })
          .then(() => { sessionStorage.removeItem(`wind_stats_${product.handle || product.id}`); mutate('homepage/data'); mutate('homepage-products-sections'); mutate(`product-${product.id}`); })
          .catch(() => {});
      } catch (error) { console.log("Firebase Update Error:", error); pendingActionRef.current = 0; }
    }, 1500);
  };

  useEffect(() => {
    if (isGalleryOpen || isImageZoomModalOpen || isDescModalOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [isGalleryOpen, isImageZoomModalOpen, isDescModalOpen]);

  const staticProd = useMemo(() => staticProducts.find(p => p.id.toString() === id?.toString()), [id]);
  const { data: fbProduct, isLoading: productLoading } = useProduct(id);
  const activeProduct = fbProduct || staticProd || initialProduct;
  const { data: swrRelated, isLoading: relatedLoading } = useRelatedProducts(activeProduct);

  useEffect(() => {
    if (activeProduct) {
      setProduct(activeProduct);
      setRealLikesCount(activeProduct.likesCount || 0);
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

  useEffect(() => { if (swrRelated) setRelatedProducts(swrRelated); }, [swrRelated]);
  useEffect(() => { if (!loading && product) { signalPageReady(); } }, [loading, product, pathname, signalPageReady]);
  useEffect(() => { setQuantity(1); }, [id, selectedSize, selectedColor]);

  useEffect(() => {
    if (!addToCartBtnRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStickyVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(addToCartBtnRef.current);
    return () => observer.disconnect();
  }, [product]);

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

  const parsedSections = useMemo(() => {
    if (!product?.description) return {};
    const parser = new DOMParser();
    const doc = parser.parseFromString(product.description, 'text/html');
    const map = {};
    doc.querySelectorAll('.wind-tabs-container > details').forEach(det => {
      const summarySpan = det.querySelector('summary > span:first-child');
      const key = summarySpan?.textContent?.trim();
      if (!key) return;
      const contentDiv = det.querySelector(':scope > div');
      if (contentDiv) { map[key] = contentDiv.innerHTML; }
    });
    return map;
  }, [product?.description]);

  const accordionSections = useMemo(() => {
    const sections = [
      { key: "عن المنتج", title: "عن المنتج", html: parsedSections["عن المنتج"] || closedDescriptionHTML, extraClass: "ql-editor-display" },
      { key: "الخامة والمواصفات", title: "الخامة والمواصفات", html: parsedSections["الخامة والمواصفات"] || `<p>خامات عالية الجودة. يرجى مراجعة ملصق العناية المرفق بالمنتج للحصول على تعليمات الغسيل والاستخدام.</p>` },
      { key: "الشحن والاستبدال", title: "الشحن والاسترجاع", html: parsedSections["الشحن والاستبدال"] || `<p>شحن سريع خلال 3-7 أيام عمل. إرجاع مجاني خلال 14 يوم من تاريخ الاستلام.</p>` },
    ];
    if (parsedSections["العناية بالمنتج"]) {
      sections.push({ key: "العناية بالمنتج", title: "العناية بالمنتج", html: parsedSections["العناية بالمنتج"] });
    }
    return sections;
  }, [parsedSections, closedDescriptionHTML]);

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

  const gallery = useMemo(() => 
    product.images || [product.mainImage, ...Array.from({length: product.imagesCount || 0}, (_, i) => `${i+1}.webp`)],
    [product]
  );

  const openGallery = idx => { setGalleryIdx(idx); setIsZoomed(false); setGalleryOpen(true); };
  const galleryNext = () => { setGalleryIdx(i => (i + 1) % gallery.length); setIsZoomed(false); };
  const galleryPrev = () => { setGalleryIdx(i => (i - 1 + gallery.length) % gallery.length); setIsZoomed(false); };
  
  const handleHeroTouchStart = (e) => { heroTouchStartX.current = e.touches[0].clientX; setIsSwipingHero(true); };
  const handleHeroTouchMove  = (e) => { if (heroTouchStartX.current) setIsSwipingHero(true); };
  const handleHeroTouchEnd   = (e) => {
    if (!heroTouchStartX.current) return;
    const dx = e.changedTouches[0].clientX - heroTouchStartX.current;
    if (Math.abs(dx) > 40) {
      const currentIndex = gallery.indexOf(activeImage);
      if (dx > 0) { const pi = (currentIndex - 1 + gallery.length) % gallery.length; setActiveImage(gallery[pi]); setActiveIdx(pi); }
      else         { const ni = (currentIndex + 1) % gallery.length;                   setActiveImage(gallery[ni]); setActiveIdx(ni); }
    }
    heroTouchStartX.current = null;
    setTimeout(() => setIsSwipingHero(false), 150);
  };

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = e => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > 100 && Math.abs(dy) > Math.abs(dx)) { setGalleryOpen(false); }
    else if (Math.abs(dx) > 50) { dx > 0 ? galleryPrev() : galleryNext(); }
    touchStartX.current = null; touchStartY.current = null;
  };

  const safeSizes = useMemo(() => {
    let sizes = [];
    if (product?.options && Array.isArray(product.options)) {
      product.options.forEach(opt => {
        const n = (opt.name || "").toLowerCase();
        if (n.includes("size") || n === "المقاس" || n === "مقاس") sizes = opt.values.split(",").map(s => s.trim()).filter(Boolean);
      });
    }
    if (!sizes.length) sizes = Array.isArray(product?.options?.sizes) ? product.options.sizes : (Array.isArray(product?.sizes) ? product.sizes : []);
    return sizes;
  }, [product]);

  const safeColors = useMemo(() => {
    let colors = [];
    if (product?.options && Array.isArray(product.options)) {
      product.options.forEach(opt => {
        const n = (opt.name || "").toLowerCase();
        if (n.includes("color") || n === "اللون" || n === "لون") colors = opt.values.split(",").map(c => c.trim()).filter(Boolean);
      });
    }
    if (!colors.length) colors = Array.isArray(product?.options?.colors) ? product.options.colors : [];
    return colors;
  }, [product]);

  const stickyCombinations = useMemo(() => {
    const colorNames = safeColors.map(c => typeof c === "string" ? c : c.name).filter(Boolean);
    const sizes = safeSizes.filter(Boolean);
    if (!colorNames.length && !sizes.length) return [];
    if (!colorNames.length) return sizes.map(size => ({ label: size, color: "", size }));
    if (!sizes.length) return colorNames.map(color => ({ label: color, color, size: "" }));
    const result = [];
    colorNames.forEach(color => sizes.forEach(size => result.push({ label: `${color} / ${size}`, color, size })));
    return result;
  }, [safeColors, safeSizes]);

  const currentColorImage = () => {
    if (!selectedColor) return gallery[1] || activeImage;
    const hi = product.colorSwatches?.[selectedColor];
    if (hi && (hi.startsWith("http") || hi.includes("/"))) return hi;
    return gallery[1] || activeImage;
  };

  const scrollToReviews = (e) => {
    e.preventDefault();
    const el = document.getElementById("reviews-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const renderCustomHtml = (position) => {
    if (product?.metafields?.customHtmlSnippet && product?.metafields?.customHtmlPosition === position) {
      return <div className={`w-full custom-html-snippet ${position === 'below_cart' ? 'mt-6' : 'mb-6'}`} dangerouslySetInnerHTML={{ __html: product.metafields.customHtmlSnippet }} />;
    }
    return null;
  };

  const thumbScrollUp   = () => setThumbScrollTop(prev => Math.max(0, prev - 1));
  const thumbScrollDown = () => setThumbScrollTop(prev => Math.min(Math.max(0, gallery.length - VISIBLE_THUMBS), prev + 1));

  // دالة مساعدة لحساب بيانات الـ breadcrumb — مرة واحدة بس
  const getBreadcrumbCategory = () => {
    const safeCollections = product?.collections || [];
    const safeCategories  = product?.categories  || [];
    const availableCats   = safeCollections.length > 0 ? safeCollections : safeCategories;
    let displayCategory   = sourceCategory;
    if (!displayCategory && availableCats.length > 0) {
      const generalTerms  = ['shop-all', 'best-sellers', 'new-arrivals', 'sale'];
      const specific      = availableCats.filter(c => typeof c === 'string' && !generalTerms.some(t => c.includes(t)));
      displayCategory     = specific.length > 0 ? specific[0] : availableCats[0];
    }
    if (!displayCategory) return null;
    const cleanName = String(displayCategory).replace(/^\//, '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const href      = `/collections/${String(displayCategory).replace(/^\//, '')}`;
    return { cleanName, href };
  };

  const breadcrumbCat = getBreadcrumbCategory();

  // Breadcrumb مشترك
  const Breadcrumb = ({ className = "" }) => (
    <nav className={`flex items-center gap-4 text-[12px] text-[#AAAAAA] flex-nowrap overflow-hidden ${className}`}>
      <span className="shrink-0"><Link href="/" className="hover:text-[#111111] transition-colors">الرئيسية</Link></span>
      {breadcrumbCat && (
        <>
          <span className="text-[#DDDDDD] shrink-0">›</span>
          <span className="shrink-0"><Link href={breadcrumbCat.href} className="hover:text-[#111111] transition-colors">{breadcrumbCat.cleanName}</Link></span>
        </>
      )}
      <span className="text-[#DDDDDD] shrink-0">›</span>
      <span className="text-[#333333] font-medium truncate min-w-0">{product.title}</span>
    </nav>
  );

  // Accordion مشترك
 const AccordionSections = () => (
    <div className="space-y-0">
      {accordionSections.map(({ key, title, html, extraClass = "" }, i, arr) => (
        <details key={key} className={`group ${i < arr.length - 1 ? "border-b border-[#EBEBEB]" : ""}`}>
          <summary className="flex items-center justify-between cursor-pointer py-5 list-none select-none">
            <span className="text-[13px] font-medium text-[#111111] tracking-[0.02em]">{title}</span>
            <span className="text-[#BBBBBB] group-open:rotate-45 transition-transform duration-300 text-lg leading-none">+</span>
          </summary>
          <div className={`pb-6 text-[13px] text-[#777777] leading-[1.85] ${extraClass}`} dir="rtl">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </details>
      ))}
    </div>
  );

  // ---------- RENDER ----------
  return (
    <div className="bg-white min-h-screen text-[#111111] pb-16 selection:bg-black selection:text-white">

      {/* ===== MOBILE VIEW ===== */}
      <div className="lg:hidden">

        {/* Breadcrumb Mobile */}
        <div className="px-5 pt-3 pb-5" dir="rtl">
          <Breadcrumb />
        </div>

      

        {/* Hero Image */}
        <div className="px-4 bg-white">
        <div
          className="relative w-full aspect-[3/4] bg-[#F7F7F7] overflow-hidden"
          onClick={() => openGallery(activeIdx)}
          onTouchStart={handleHeroTouchStart}
          onTouchMove={handleHeroTouchMove}
          onTouchEnd={handleHeroTouchEnd}
        >
          <img key={activeImage} src={getImageUrl(activeImage)} alt={product.title} className="w-full h-full object-cover transition-all duration-500 ease-out" />
          {/* Heart — top right */}
          <button onClick={handleWishlistToggle} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
            <Heart size={15} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "#333"} />
          </button>

          {/* Zoom Plus — bottom right, inside circle */}
          <button onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }} className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm cursor-zoom-in">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="16.5" y1="16.5" x2="21" y2="21"/>
            </svg>
          </button>
          </div>
        </div>

         {/* Mobile Dots Navigation */}
        <div className="flex items-center justify-center py-5 px-4">
          <div className="flex flex-wrap justify-center gap-2" style={{maxWidth:'calc(100% - 32px)'}}>
            {gallery.map((_, idx) => (
              <button
                key={idx}
                onClick={() => { setActiveImage(gallery[idx]); setActiveIdx(idx); }}
                className="flex items-center justify-center w-4 h-4"
              >
                <span className={`rounded-full block transition-all duration-300 ease-in-out ${
                  activeIdx === idx
                    ? "w-4 h-4 bg-white border border-black/50"
                    : "w-2 h-2 bg-black/80"
                }`} />
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Content */}
        <div className="px-5 pt-5 pb-6" dir="rtl">

          {renderCustomHtml('above_title')}

          {/* Title */}
          <h1 className="text-[22px] font-medium text-[#111] tracking-tight leading-[1.15] mb-3">{product.title}</h1>

          {/* Stars */}
          <a href="#reviews-section" onClick={scrollToReviews} className="flex items-center gap-2 w-fit hover:opacity-75 transition-opacity mb-4">
            <div className="flex gap-0.5 text-[#E8A500]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={13} fill={i < Math.round(realRating) ? "currentColor" : "none"} className={i >= Math.round(realRating) ? "text-[#DDDDDD]" : ""} />
              ))}
            </div>
            <span className="text-[11px] text-[#999]">
              {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
            </span>
          </a>

           {/* Price */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[22px] font-normal text-[#C0392B] tracking-[0.01em]">{product.price}</span>
            <span className="text-xs text-[#999]">ج.م</span>
            {product.compareAtPrice && <span className="text-xs text-[#BBBBBB] line-through">{product.compareAtPrice} ج.م</span>}
            {product.compareAtPrice && (() => {
              const orig = parseFloat(String(product.compareAtPrice).replace(/[^0-9.]/g, ''));
              const curr = parseFloat(String(product.price).replace(/[^0-9.]/g, ''));
              const pct = orig > curr ? Math.round((orig - curr) / orig * 100) : 0;
              return pct > 0 ? (
                <span className="text-[11px] font-bold bg-[#fdecea] text-[#C0392B] px-2 py-0.5 rounded-full">{pct}%</span>
              ) : null;
            })()}
          </div>
          {/* Short Desc */}
          {product.description && (
            <div className="mb-10">
              <p className="text-[13px] leading-[1.8] text-[#777]">{shortDescription}</p>
              <button onClick={() => setDescModalOpen(true)} className="text-[12px] flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full bg-[#fdf6ec] text-[#8a6a3a] hover:bg-[#faecd8] transition-colors">
                <Info size={12} /> عرض تفاصيل المنتج والخامات
              </button>
            </div>
          )}

        {/* Colors */}
          {safeColors.length > 0 && (
            <div className="mb-9">
              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-[15px] text-[#111] font-bold">اللون:</span>
                {selectedColor && <span className="text-[15px] text-[#111] capitalize">{selectedColor}</span>}
              </div>
              <div ref={colorsRef} className="flex flex-wrap gap-3">
                {safeColors.map((ci, i) => {
                  const name  = typeof ci === "string" ? ci : ci.name;
                  const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#DDDDDD");
                  const isImg = hi.startsWith("http") || hi.includes("/");
                  const isSel = selectedColor === name;
                  return (
                    <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name}>
                      <div className={`w-11 h-11 rounded-full overflow-hidden transition-all duration-200 ${isSel ? "ring-1 ring-black ring-offset-2" : "ring-1 ring-transparent hover:ring-[#bbb] ring-offset-1"}`}>
                        {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover rounded-full" /> : <div style={{backgroundColor:hi}} className="w-full h-full rounded-full" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

           {/* Sizes */}
          {safeSizes.length > 0 && (
            <div className="mb-7">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] text-[#111] font-bold">المقاس:</span>
                  {selectedSize && <span className="text-[15px] text-[#111] capitalize">{selectedSize}</span>}
                </div>
                <button onClick={() => setSizeGuideOpen(true)} className="text-[12px] text-[#555] flex items-center gap-1.5 hover:text-black transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="6" width="22" height="12" rx="2"/>
                    <line x1="6" y1="6" x2="6" y2="13"/>
                    <line x1="10" y1="6" x2="10" y2="11"/>
                    <line x1="14" y1="6" x2="14" y2="13"/>
                    <line x1="18" y1="6" x2="18" y2="11"/>
                  </svg>
                  دليل القياسات
                </button>
              </div>
              {safeSizes.length > 1 && (
                <div className="flex flex-wrap gap-2.5 flex-row-reverse justify-end">
                  {safeSizes.map(sz => (
                    <button key={sz} onClick={() => setSelectedSize(sz)}
                      className={`min-w-[56px] h-12 text-[14px] font-medium border transition-all duration-200 capitalize px-3 rounded-lg ${selectedSize===sz ? "bg-black text-white border border-black/60" : "bg-white text-[#444] border border-[#E0E0E0] hover:border-[#999] hover:text-black"}`}>{sz}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stock Status */}
          <div className="flex items-center gap-2 mb-7">
            {product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_2px_rgba(16,185,129,0.4)]"></span>
                <span className="text-[13px] font-medium text-emerald-600">متوفر في المخزون</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span className="text-[13px] font-medium text-red-500">غير متوفر في المخزون</span>
              </>
            )}
          </div>

          {/* Add to Cart Mobile — Original (not sticky) */}
          <div ref={addToCartBtnRef} className="flex gap-3 mb-2">
            <button
              onClick={async () => {
                setIsAddingToCart(true);
                await addToCart({...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity});
                setQuantity(1);
                setTimeout(() => setIsAddingToCart(false), 700);
              }}
              disabled={isAddingToCart}
              className="flex-1 text-[14px] font-medium py-3 flex items-center justify-center btn-shake border border-black/70 rounded-lg text-[#111] bg-white hover:bg-[#f5f5f5] transition-colors disabled:opacity-80"
              style={{letterSpacing:'0.04em'}}
            >
              {isAddingToCart ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : "أضف إلى السلة"}
            </button>
            <div className="flex items-center justify-between bg-[#F2F2F2] border border-[#E0E0E0] px-1 w-[72px] shrink-0 rounded-lg">
              <button onClick={() => setQuantity(q => q + 1)} className="text-[#888] hover:text-black p-1"><Plus size={13} /></button>
              <span className="text-[#111] text-sm font-medium">{quantity}</span>
              <button onClick={() => setQuantity(q => q > 1 ? q-1 : 1)} className="text-[#888] hover:text-black p-1"><Minus size={13} /></button>
            </div>
          </div>

          {/* Add to Cart Mobile — New Sticky */}
          <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E8E8] px-4 py-3 z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-all duration-300 ease-in-out ${isStickyVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"}`}>

              {/* Options Popup */}
              {isStickyOptionsOpen && stickyCombinations.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 bg-white border border-[#E0E0E0] shadow-lg max-h-[50vh] overflow-y-auto mb-0 mx-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0F0]">
                    <span className="text-[12px] text-[#999]">اختر المقاس واللون</span>
                    <button onClick={() => setIsStickyOptionsOpen(false)}><X size={15} className="text-[#999]" /></button>
                  </div>
                  {stickyCombinations.map((combo, i) => {
                    const isSelected = combo.color === selectedColor && combo.size === selectedSize;
                    return (
                      <button key={i} onClick={() => {
                        if (combo.color) {
                          setSelectedColor(combo.color);
                          const swatchImg = product.colorSwatches?.[combo.color];
                          if (swatchImg && (swatchImg.startsWith("http") || swatchImg.includes("/"))) {
                            setActiveImage(swatchImg);
                            setActiveIdx(0);
                          }
                        }
                        if (combo.size) setSelectedSize(combo.size);
                        setIsStickyOptionsOpen(false);
                      }}
                        className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-[#F5F5F5] text-right transition-colors ${isSelected ? "bg-[#F5F5F5]" : "hover:bg-[#FAFAFA]"}`}>
                        <span className={`text-[13px] ${isSelected ? "font-medium text-[#111]" : "text-[#444]"}`}>{combo.label}</span>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-black shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                {/* Add to Cart */}
{/* Add to Cart */}
                <button
                  onClick={async () => {
                    setIsAddingToCart(true);
                    await addToCart({...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity});
                    setQuantity(1);
                    setTimeout(() => setIsAddingToCart(false), 700);
                  }}
                  disabled={isAddingToCart}
                  className="flex-1 text-[13px] font-medium h-[42px] flex items-center justify-center rounded-lg text-white bg-black hover:bg-[#222] transition-colors disabled:opacity-80"
                  style={{letterSpacing:'0.04em'}}
                >
                  {isAddingToCart ? (
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  ) : "أضف إلى السلة"}
                </button>

                {/* Options Button */}
                {stickyCombinations.length > 0 && (
                  <button
                    onClick={() => setIsStickyOptionsOpen(o => !o)}
                    className="flex items-center justify-between gap-2 border border-[#E0E0E0] px-3 h-[42px] bg-white rounded-lg w-[45%] shrink-0"
                  >
                    <span className="text-[12px] text-[#111] truncate" dir="rtl">
                      {[selectedColor, selectedSize].filter(Boolean).join(' / ')}
                      {product.price ? ` - ${product.price} ج.م` : ""}
                    </span>
                    <ChevronDown size={13} className="text-[#111] shrink-0" />
                  </button>
                )}
              </div>
           </div>

          {/* Secure Checkout Badge */}
          <div className="mt-3 bg-[#fafafa] border border-[#e8e8e8] rounded-md px-4 py-3 flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center shrink-0">
              <div className="relative w-[18px] h-[20px]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[10px] h-[8px] border-2 border-[#1a1a1a] border-b-0 rounded-t-full"></div>
                <div className="absolute bottom-0 left-0 w-[18px] h-[13px] bg-[#1a1a1a] rounded-sm flex items-center justify-center">
                  <div className="w-[3px] h-[5px] bg-[#fafafa] rounded-sm"></div>
                </div>
              </div>
            </div>
            <div className="flex-1 text-[11px] text-[#4a4a4a] leading-snug">
              Guaranteed <span className="font-semibold text-[#1a1a1a]">secure & safe</span> checkout
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <img src="https://ik.imagekit.io/windeg/WIND_Shopping/visa.svg" alt="Visa" className="h-8 w-auto" />
              <img src="https://ik.imagekit.io/windeg/WIND_Shopping/mastercard.svg" alt="Mastercard" className="h-7 w-auto" />
            </div>
          </div>

         {/* Trust Badges */}
          <div className="mt-2">
            <div className="flex items-center justify-center py-3 px-2 gap-0">
              {[
                { icon: <Truck size={14}/>, label: "توصيل سريع" },
                { icon: <Eye size={14}/>, label: "معاينة الطلبات" },
                { icon: <ArrowLeftRight size={14}/>, label: "استرجاع سهل" },
              ].map(({ icon, label }, i, arr) => (
                <React.Fragment key={label}>
                  <div className="flex items-center gap-1.5 px-3">
                    <span className="text-[#111]">{icon}</span>
                    <span className="text-[12px] font-medium text-[#111] whitespace-nowrap">{label}</span>
                  </div>
                  {i < arr.length - 1 && <span className="w-[3px] h-[3px] rounded-full bg-[#ccc] shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {renderCustomHtml('below_cart')}

          

          {/* Accordion Mobile */}
          {product.description && (
            <div className="mt-8 pt-2">
              <AccordionSections />
              {renderCustomHtml('below_description')}
            </div>
          )}
        </div>
      </div>

      {/* ===== DESKTOP VIEW ===== */}
      <div className="hidden lg:block bg-white">

        {/* Breadcrumb Desktop — full width, above everything */}
        <div className="border-b border-[#F2F2F2]">
          <div className="max-w-[1440px] mx-auto px-12 py-4" dir="rtl">
            <Breadcrumb />
          </div>
        </div>

        {/* Main 2-col layout */}
        <div className="max-w-[1440px] mx-auto flex" dir="ltr">

          {/* LEFT: Gallery — sticky */}
          <div className="w-[58%] flex gap-4 px-12 pt-10 pb-10 sticky top-0 self-start" dir="rtl">

            {/* Vertical Thumbnails */}
            <div className="w-[80px] flex-shrink-0 flex flex-col items-center gap-1.5">
              {thumbScrollTop > 0 && (
                <button onClick={thumbScrollUp} className="w-full py-1.5 flex items-center justify-center border border-[#E0E0E0] bg-white hover:border-black transition-all text-[#999] hover:text-black">
                  <ChevronUp size={13} />
                </button>
              )}
              <div className="flex flex-col gap-2 overflow-hidden" style={{height:`${VISIBLE_THUMBS * 116}px`}}>
                {gallery.slice(thumbScrollTop, thumbScrollTop + VISIBLE_THUMBS).map((img, relIdx) => {
                  const idx = thumbScrollTop + relIdx;
                  return (
                    <button key={idx} onClick={() => { setActiveImage(img); setActiveIdx(idx); }}
                      className={`w-full aspect-[3/4] overflow-hidden border transition-all duration-200 flex-shrink-0 ${activeIdx===idx ? 'border-black' : 'border-[#E5E5E5] hover:border-[#999]'}`}>
                      <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
              {thumbScrollTop < Math.max(0, gallery.length - VISIBLE_THUMBS) && (
                <button onClick={thumbScrollDown} className="w-full py-1.5 flex items-center justify-center border border-[#E0E0E0] bg-white hover:border-black transition-all text-[#999] hover:text-black">
                  <ChevronDown size={13} />
                </button>
              )}
            </div>

            {/* Main Image */}
            <div className="flex-1 relative bg-[#F7F7F7] aspect-[3/4] cursor-zoom-in overflow-hidden main-img-wrap"
              onClick={() => openGallery(activeIdx)}>
              <img key={activeImage} src={getImageUrl(activeImage)} alt={product.title}
                className="w-full h-full object-cover transition-transform duration-500 ease-out main-img-hover" />
              <button onClick={(e) => { e.stopPropagation(); openGallery(activeIdx); }}
                className="absolute top-4 right-4 z-10 bg-white/85 p-2 rounded-full border border-[#E0E0E0] text-[#333] hover:bg-white transition-all duration-200 img-zoom-btn">
                <Search size={15} />
              </button>
            </div>
          </div>

          {/* RIGHT: Product Info */}
          <div className="w-[42%] px-10 pt-10 pb-16 flex flex-col" dir="rtl">

            {renderCustomHtml('above_title')}

            {/* Category */}
            {breadcrumbCat && (
              <p className="text-[10px] text-[#AAAAAA] tracking-[0.12em] uppercase mb-3 font-medium">{breadcrumbCat.cleanName}</p>
            )}

            {/* Title */}
            <h1 className="text-[28px] font-medium text-[#111] tracking-tight leading-[1.15] mb-4">{product.title}</h1>

            {/* Stars */}
            <a href="#reviews-section" onClick={scrollToReviews} className="flex items-center gap-2 w-fit hover:opacity-75 transition-opacity mb-5">
              <div className="flex gap-0.5 text-[#E8A500]">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} fill={i < Math.round(realRating) ? "currentColor" : "none"} className={i >= Math.round(realRating) ? "text-[#DDDDDD]" : ""} />
                ))}
              </div>
              <span className="text-xs text-[#999] hover:text-black transition-colors">
                {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
              </span>
            </a>

            {/* Price */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[28px] font-normal text-[#C0392B]">{product.price}</span>
              <span className="text-sm text-[#999]">ج.م</span>
              {product.compareAtPrice && <span className="text-sm text-[#BBBBBB] line-through">{product.compareAtPrice} ج.م</span>}
            </div>
            <div className="flex items-center gap-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs text-[#888]">{product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? "متوفر" : "غير متوفر"}</span>
            </div>

            {/* Short Desc */}
            {product.description && (
              <div className="pb-7 border-b border-[#F0F0F0]">
                <p className="text-[13px] leading-[1.9] text-[#777]">{shortDescription}</p>
                <button onClick={() => setDescModalOpen(true)} className="text-[#333] text-[12px] flex items-center gap-1.5 hover:underline underline-offset-4 mt-2">
                  <Info size={12} /> عرض تفاصيل المنتج والخامات
                </button>
              </div>
            )}

            {/* Colors */}
            {safeColors.length > 0 && (
              <div className="mt-7 mb-7">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-[11px] text-[#AAAAAA] tracking-[0.1em] uppercase font-medium">{safeColors.length > 1 ? "اختر اللون" : "اللون"}</span>
                  {selectedColor && <span className="text-[#111] text-[13px] font-medium capitalize">{selectedColor}</span>}
                </div>
                <div ref={colorsRef} className="flex flex-wrap gap-3">
                  {safeColors.map((ci, i) => {
                    const name  = typeof ci === "string" ? ci : ci.name;
                    const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#DDDDDD");
                    const isImg = hi.startsWith("http") || hi.includes("/");
                    const isSel = selectedColor === name;
                    return (
                      <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name}>
                        <div className={`w-12 h-12 border transition-all duration-200 ${isSel ? "border-black ring-1 ring-black ring-offset-1" : "border-[#E0E0E0] hover:border-[#999]"}`}>
                          {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover" /> : <div style={{backgroundColor:hi}} className="w-full h-full" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sizes */}
            {safeSizes.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-[#AAAAAA] tracking-[0.1em] uppercase font-medium">{safeSizes.length > 1 ? "اختر المقاس" : "المقاس"}</span>
                    {selectedSize && <span className="text-[#111] text-[13px] font-medium capitalize">{selectedSize}</span>}
                  </div>
                  <button onClick={() => setSizeGuideOpen(true)} className="text-[11px] text-[#333] flex items-center gap-1.5 border border-[#E0E0E0] hover:border-black px-3 py-1 transition-all">
                    <Info size={10} /> دليل القياسات
                  </button>
                </div>
                {safeSizes.length > 1 && (
                  <div className="flex flex-wrap gap-2.5 flex-row-reverse justify-end">
                    {safeSizes.map(sz => (
                      <button key={sz} onClick={() => setSelectedSize(sz)}
                        className={`min-w-[56px] h-11 text-[13px] font-medium border transition-all duration-200 capitalize px-2 ${selectedSize===sz ? "bg-black text-white border-black" : "bg-white text-[#666] border-[#E0E0E0] hover:border-black hover:text-black"}`}>{sz}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add to Cart Desktop */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => { addToCart({...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity}); setQuantity(1); }}
                className="flex-1 text-[14px] font-medium py-5 flex items-center justify-center transition-opacity btn-breathe tracking-[0.05em]"
                style={{background:'#111', color:'#fff'}}
                onMouseEnter={e => e.currentTarget.style.opacity='0.88'}
                onMouseLeave={e => e.currentTarget.style.opacity='1'}
              >
                أضف إلى السلة
              </button>
              <div className="flex items-center justify-between bg-white border border-[#E0E0E0] px-1 w-[84px] shrink-0">
                <button onClick={() => setQuantity(q => q+1)} className="text-[#888] hover:text-black p-2"><Plus size={14} /></button>
                <span className="text-[#111] text-sm font-medium">{quantity}</span>
                <button onClick={() => setQuantity(q => q>1?q-1:1)} className="text-[#888] hover:text-black p-2"><Minus size={14} /></button>
              </div>
            </div>
            {renderCustomHtml('below_cart')}

            {/* Trust */}
            <div className="mb-2">
              <div className="flex items-center justify-center py-3 px-2 gap-0">
                {[
                  { icon: <Truck size={14}/>, label: "توصيل سريع" },
                  { icon: <Eye size={14}/>, label: "معاينة الطلبات" },
                  { icon: <ArrowLeftRight size={14}/>, label: "استرجاع سهل" },
                ].map(({ icon, label }, i, arr) => (
                  <>
                    <div key={label} className="flex items-center gap-1.5 px-3">
                      <span className="text-[#111]">{icon}</span>
                      <span className="text-[12px] font-medium text-[#111] whitespace-nowrap">{label}</span>
                    </div>
                    {i < arr.length - 1 && <span key={`dot-${i}`} className="w-[3px] h-[3px] rounded-full bg-[#ccc] shrink-0" />}
                  </>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-[#FAFAFA] py-3 px-4 border border-[#EBEBEB] mb-8">
              <div className="flex items-center gap-1.5 text-[11px] text-[#777]"><ShieldCheck size={13} className="text-[#333]" /> دفع آمن 100%</div>
              <div className="flex items-center gap-3 text-[#AAAAAA]">
                <CreditCard size={16}/><Banknote size={16}/>
                <span className="border border-[#E0E0E0] px-1.5 py-0.5 text-[9px] text-[#333]">INSTAPAY</span>
                <span className="border border-[#E0E0E0] px-1.5 py-0.5 text-[9px] text-[#333]">VISA</span>
              </div>
            </div>

            {/* Accordion Desktop */}
            {product.description && (
              <div className="pt-2">
                <AccordionSections />
                {renderCustomHtml('below_description')}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ===== BOTTOM SECTIONS ===== */}
      <div className="max-w-[1440px] mx-auto px-5 lg:px-12" dir="rtl">
        <div id="reviews-section" className="py-10 lg:py-16 border-t border-[#EBEBEB]">
          <ProductReviews
            productHandle={product.handle || product.id}
            onReviewStatsUpdate={(rating, count) => { setRealRating(rating); setRealReviewsCount(count); }}
          />
        </div>

        {product.metafields?.hideRelatedSection !== "Yes" && relatedProducts.length > 0 && (
          <div className="py-12 lg:py-16 border-t border-[#EBEBEB]">
            <h2 className="text-[11px] font-medium text-[#111] tracking-[0.12em] uppercase mb-8 lg:mb-10">منتجات قد تعجبك</h2>
            <div className="flex gap-5 lg:gap-8 overflow-x-auto hide-scrollbar-horizontal pb-4 -mx-5 px-5 lg:mx-0 lg:px-0" dir="rtl">
              {relatedProducts.map(rp => (
                <Link href={`/products/${rp.id}`} key={rp.id} className="flex-shrink-0 w-[130px] lg:w-[180px] group cursor-pointer block">
                  <div className="relative aspect-[3/4] bg-[#F7F7F7] overflow-hidden border border-[#EBEBEB] mb-3 group-hover:border-[#999] transition-all duration-300">
                    <img src={getRelatedImageUrl(rp)} alt={rp.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                  </div>
                  <h3 className="text-[12px] lg:text-[13px] text-[#111] font-medium line-clamp-2 mb-1">{rp.title}</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-[#111] font-medium text-xs lg:text-[13px]">{rp.price}</span>
                    <span className="text-[#999] text-[10px]">ج.م</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        {renderCustomHtml('bottom_page')}
      </div>

      {/* ===== GALLERY MODAL ===== */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-[99999] bg-white flex flex-col gallery-enter" onClick={() => setGalleryOpen(false)}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBEBEB]" onClick={e => e.stopPropagation()}>
            <span className="text-[#111] text-sm font-medium">{product.title}</span>
            <div className="flex items-center gap-4">
              <span className="text-[#999] text-xs">{galleryIdx+1} / {gallery.length}</span>
              <button onClick={() => setGalleryOpen(false)} className="bg-white hover:bg-[#F5F5F5] border border-[#E0E0E0] p-2 rounded-full text-[#333] transition-all">
                <X size={17} />
              </button>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center bg-[#F7F7F7]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={e => e.stopPropagation()}>
            <img key={galleryIdx} src={getImageUrl(gallery[galleryIdx])} alt="" onClick={() => setIsZoomed(!isZoomed)}
              className={`max-h-[90vh] max-w-[90vw] object-contain gallery-img-enter transition-transform duration-500 ${isZoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"}`} />
            {!isZoomed && (
              <>
                <button onClick={galleryPrev} className="absolute right-5 top-1/2 -translate-y-1/2 bg-white/90 border border-[#E0E0E0] text-[#333] p-3 rounded-full hover:border-black transition-all"><ChevronRight size={20} strokeWidth={1.5} /></button>
                <button onClick={galleryNext} className="absolute left-5 top-1/2 -translate-y-1/2 bg-white/90 border border-[#E0E0E0] text-[#333] p-3 rounded-full hover:border-black transition-all"><ChevronLeft size={20} strokeWidth={1.5} /></button>
              </>
            )}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none bg-white/90 px-3 py-1.5 rounded-full border border-[#E0E0E0]">
              {gallery.map((_,i) => <span key={i} className={`rounded-full bg-black transition-all ${galleryIdx===i ? "w-5 h-1.5 opacity-100" : "w-1.5 h-1.5 opacity-20"}`} />)}
            </div>
          </div>
        </div>
      )}

      {/* ===== COLOR ZOOM MODAL ===== */}
      {isImageZoomModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#FAFAFA] p-4 animate-[fadeIn_0.3s_ease-out]" onClick={() => setImageZoomModalOpen(false)}>
          <div className="relative w-full max-w-lg aspect-[3/4] overflow-hidden border border-[#E0E0E0]" onClick={e => e.stopPropagation()}>
            <img src={getImageUrl(currentColorImage())} alt="" className="w-full h-full object-cover" />
            <button onClick={() => setImageZoomModalOpen(false)} className="absolute top-4 left-4 bg-white/90 p-2.5 rounded-full border border-[#E0E0E0] text-[#333]"><X size={18} /></button>
            <div className="absolute bottom-4 right-4 bg-white/90 px-4 py-2 border border-[#E0E0E0]">
              <span className="text-[#111] text-sm font-medium">{selectedColor}</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== DESCRIPTION MODAL ===== */}
      {isDescModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-none border border-[#E5E5E5] shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-[fadeIn_0.3s_ease-out]">
            <div className="px-5 py-4 border-b border-[#EBEBEB] flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-medium text-[15px] text-[#111]">معلومات المنتج والتفاصيل</h3>
              <button onClick={() => setDescModalOpen(false)} className="bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] p-1.5 rounded-full text-[#666]"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto ql-editor-display" dir="rtl">
              <div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} />
            </div>
          </div>
        </div>
      )}

      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={product} />

      <style jsx global>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes galleryIn { from{opacity:0} to{opacity:1} }
        @keyframes imgIn { from{opacity:0.3} to{opacity:1} }
        .gallery-enter { animation: galleryIn 0.2s ease-out }
        .gallery-img-enter { animation: imgIn 0.25s cubic-bezier(0.25,1,0.5,1) }

        .hide-scrollbar-horizontal::-webkit-scrollbar { height:0; background:transparent }
        .hide-scrollbar-horizontal { -ms-overflow-style:none; scrollbar-width:none }

        /* Accordion content */
        .ql-editor-display ul { list-style-type:disc!important; padding-right:20px!important; margin-bottom:10px; color:#777 }
        .ql-editor-display ol { list-style-type:decimal!important; padding-right:20px!important; margin-bottom:10px; color:#777 }
        .ql-editor-display strong { font-weight:600; color:#333 }
        .ql-editor-display p { margin-bottom:8px; line-height:1.85; color:#777 }
        .ql-editor-display details { border:1px solid #E5E5E5!important; margin-bottom:10px; padding:0 14px!important; border-radius:0!important }
        .ql-editor-display details[open] { border-color:#BBBBBB!important }
        .ql-editor-display summary { color:#333!important; font-weight:500; font-size:13px!important; padding:12px 0!important; cursor:pointer }
        .ql-editor-display summary::-webkit-details-marker { display:none }
        .ql-editor-display div { color:#777!important; line-height:1.85; padding-bottom:12px }

        /* read-more fix */
        .ql-editor-display .read-more-wrapper { border:none!important; padding:0!important; margin-top:4px!important }
        .ql-editor-display .read-more-wrapper[open] { border:none!important }
        .ql-editor-display .read-more-wrapper .less-text { display:none }
        .ql-editor-display .read-more-wrapper[open] .more-text { display:none }
        .ql-editor-display .read-more-wrapper[open] .less-text { display:inline }
        .ql-editor-display .read-more-wrapper > summary {
          font-size:12px!important; font-weight:400!important; color:#888!important;
          text-decoration:underline!important; text-underline-offset:3px!important;
          padding:4px 0!important; border:none!important; display:inline-block!important
        }

        /* Main image hover — isolated, won't affect thumbnails */
        .main-img-wrap { isolation: isolate }
        .main-img-wrap:hover .main-img-hover { transform: scale(1.015) }
        .main-img-hover { transition: transform 0.6s cubic-bezier(0.25,1,0.5,1) }

        /* Zoom btn */
        .img-zoom-btn { opacity:0; transition:opacity 0.25s }
        .main-img-wrap:hover .img-zoom-btn { opacity:1 }

        @keyframes breathe {
          0%,100% { transform:translateX(0) }
          50% { transform:translateX(1.5px) }
        }
        .btn-breathe { animation: breathe 5s ease-in-out infinite }
        .btn-breathe:hover { animation:none }

         @keyframes shake {
          0%, 90%, 100% { transform:translateX(0) }
          92% { transform:translateX(-4px) }
          94% { transform:translateX(4px) }
          96% { transform:translateX(-3px) }
          98% { transform:translateX(3px) }
        }
        .btn-shake { animation: shake 5s ease-in-out infinite }
        .btn-shake:hover { animation:none }

      
      `}</style>
    </div>
  );
}