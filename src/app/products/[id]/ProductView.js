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
import { useProduct, useRelatedProducts } from "@/hooks/useFirestore";
import {
  Plus, Minus, Star, Info, Share2, Heart, ImageIcon, X,
  Truck, Eye, ShieldCheck, ChevronLeft, Search, ChevronRight,
  ChevronDown, ChevronUp, CreditCard, Banknote
} from '@/components/icons-extra';

export default function ProductView({ initialProduct, sourceCategory }) {
  const { id }       = useParams();
  const pathname     = usePathname();
  const { signalPageReady }    = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();
  const { addToCart } = useCart();

  const [product, setProduct]           = useState(initialProduct || null);
  const [loading, setLoading]           = useState(!initialProduct);
  const [activeImage, setActiveImage]   = useState(initialProduct?.images?.[0] || initialProduct?.mainImage || "");
  const [activeIdx, setActiveIdx]       = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [quantity, setQuantity]         = useState(1);
  const [isSizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [isGalleryOpen, setGalleryOpen]     = useState(false);
  const [galleryIdx, setGalleryIdx]         = useState(0);
  const [isZoomed, setIsZoomed]             = useState(false);
  const [isImageZoomModalOpen, setImageZoomModalOpen] = useState(false);
  const [isDescModalOpen, setDescModalOpen] = useState(false);
  const [isWishlisted, setIsWishlisted]     = useState(false);
  const [realLikesCount, setRealLikesCount] = useState(0);
  const likeTimeoutRef   = useRef(null);
  const pendingActionRef = useRef(0);
  const [realRating, setRealRating]           = useState(0);
  const [realReviewsCount, setRealReviewsCount] = useState(0);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [sizeError, setSizeError]       = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [viewersCount] = useState(() => Math.floor(Math.random() * 9) + 4);

  const heroTouchStartX = useRef(null);
  const touchStartX    = useRef(null);
  const touchStartY    = useRef(null);
  const colorsRef      = useRef(null);
  const cartBtnRef     = useRef(null);
  const [thumbScrollTop, setThumbScrollTop] = useState(0);
  const VISIBLE_THUMBS = 5;

  useEffect(() => {
    const sentinel = cartBtnRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(([e]) => setShowStickyBar(!e.isIntersecting), { threshold: 0 });
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [product]);

  useEffect(() => {
    if (product?.id) {
      const saved = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
      setIsWishlisted(saved.includes(product.id));
      setRealLikesCount(product.likesCount || 0);
    }
  }, [product?.id, product?.likesCount]);

  const getCurrentWeekString = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    try {
      if (navigator.share) { await navigator.share({ title: product?.title || 'WIND', text: 'تسوق من WIND', url: window.location.href }); }
      else { await navigator.clipboard.writeText(window.location.href); alert('تم نسخ الرابط!'); }
    } catch { }
  };

  const handleWishlistToggle = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    const saved = JSON.parse(localStorage.getItem('wind_wishlist') || '[]');
    const isNow = saved.includes(product.id);
    const week  = getCurrentWeekString();
    if (isNow) {
      localStorage.setItem('wind_wishlist', JSON.stringify(saved.filter(i => i !== product.id)));
      setRealLikesCount(p => Math.max(0, p - 1));
      setIsWishlisted(false);
      pendingActionRef.current -= 1;
    } else {
      localStorage.setItem('wind_wishlist', JSON.stringify([...saved, product.id]));
      setRealLikesCount(p => p + 1);
      setIsWishlisted(true);
      pendingActionRef.current += 1;
    }
    if (likeTimeoutRef.current) clearTimeout(likeTimeoutRef.current);
    likeTimeoutRef.current = setTimeout(async () => {
      const net = pendingActionRef.current;
      if (net === 0) return;
      try {
        const ref  = doc(getDb(), "products", product.id.toString());
        const data = { likesCount: increment(net), likesUpdatedAt: new Date().toISOString() };
        if (product.currentWeekId === week) { data.weeklyLikesCount = increment(net); }
        else if (net > 0) { data.weeklyLikesCount = 1; data.currentWeekId = week; }
        await updateDoc(ref, data);
        pendingActionRef.current = 0;
        fetch('/api/revalidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'likes', id: product.id, handle: product.handle || product.id }) })
          .then(() => { sessionStorage.removeItem(`wind_stats_${product.handle || product.id}`); mutate('homepage/data'); mutate('homepage-products-sections'); mutate(`product-${product.id}`); }).catch(() => {});
      } catch { pendingActionRef.current = 0; }
    }, 1500);
  };

  useEffect(() => {
    const locked = isGalleryOpen || isImageZoomModalOpen || isDescModalOpen;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isGalleryOpen, isImageZoomModalOpen, isDescModalOpen]);

  const staticProd = useMemo(() => staticProducts.find(p => p.id.toString() === id?.toString()), [id]);
  const { data: fbProduct }  = useProduct(id);
  const activeProduct        = fbProduct || staticProd || initialProduct;
  const { data: swrRelated } = useRelatedProducts(activeProduct);

  useEffect(() => {
    if (activeProduct) {
      setProduct(activeProduct);
      setRealLikesCount(activeProduct.likesCount || 0);
      if (!selectedSize || !selectedColor) {
        setActiveImage(activeProduct.images?.[0] || activeProduct.mainImage || activeProduct.image);
        let iS = "", iC = "";
        if (Array.isArray(activeProduct.options)) {
          activeProduct.options.forEach(opt => {
            const n = (opt.name || "").toLowerCase();
            if ((n.includes("size") || n.includes("مقاس")) && opt.values) iS = opt.values.split(",")[0].trim();
            if ((n.includes("color") || n.includes("لون")) && opt.values)  iC = opt.values.split(",")[0].trim();
          });
        }
        setSelectedSize(iS || activeProduct.sizes?.[0] || "");
        setSelectedColor(iC || activeProduct.colors?.[0]?.name || activeProduct.colors?.[0] || "");
      }
      setLoading(false);
    }
  }, [activeProduct, id]);

  useEffect(() => { if (swrRelated) setRelatedProducts(swrRelated); }, [swrRelated]);
  useEffect(() => { if (!loading && product) signalPageReady(); }, [loading, product, pathname, signalPageReady]);
  useEffect(() => { setQuantity(1); }, [id, selectedSize, selectedColor]);

  const handleAddToCart = () => {
    if (safeSizes.length > 1 && !selectedSize) { setSizeError(true); setTimeout(() => setSizeError(false), 900); return; }
    addToCart({ ...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2200);
    setQuantity(1);
  };

  const handleBuyNow = () => {
    if (safeSizes.length > 1 && !selectedSize) { setSizeError(true); setTimeout(() => setSizeError(false), 900); return; }
    addToCart({ ...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity });
    window.location.href = '/cart';
  };

  const shortDescription = useMemo(() => {
    if (!product?.description) return "";
    let text = product.description.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "").replace(/<[^>]+>/g, "");
    [/^\s*عن المنتج\s*[:\-\s]*/i, /^\s*الوصف\s*[:\-\s]*/i].forEach(r => { text = text.replace(r, ""); });
    return text.trim().substring(0, 110) + "...";
  }, [product?.description]);

  const closedDescriptionHTML = useMemo(() => {
    if (!product?.description) return "";
    return product.description.replace(/<details\s+open[^>]*>/gi, '<details>');
  }, [product?.description]);

  const parsedSections = useMemo(() => {
    if (!product?.description) return {};
    const parser = new DOMParser();
    const dom    = parser.parseFromString(product.description, 'text/html');
    const map    = {};
    dom.querySelectorAll('.wind-tabs-container > details').forEach(det => {
      const key = det.querySelector('summary > span:first-child')?.textContent?.trim();
      if (!key) return;
      const div = det.querySelector(':scope > div');
      if (div) map[key] = div.innerHTML;
    });
    return map;
  }, [product?.description]);

  const accordionSections = useMemo(() => {
    const base = [
      { key: "عن المنتج",         title: "عن المنتج",         html: parsedSections["عن المنتج"] || closedDescriptionHTML, extraClass: "ql-editor-display" },
      { key: "الخامة والمواصفات", title: "الخامة والمواصفات", html: parsedSections["الخامة والمواصفات"] || "<p>خامات عالية الجودة.</p>" },
      { key: "الشحن والاستبدال",  title: "الشحن والاسترجاع",  html: parsedSections["الشحن والاستبدال"] || "<p>شحن خلال 3-7 أيام. إرجاع مجاني خلال 14 يوم.</p>" },
    ];
    if (parsedSections["العناية بالمنتج"])
      base.push({ key: "العناية بالمنتج", title: "العناية بالمنتج", html: parsedSections["العناية بالمنتج"] });
    return base;
  }, [parsedSections, closedDescriptionHTML]);

  if (loading && !product) return null;
  if (!product) return null;

  const getImageUrl = img => {
    if (!img) return "/placeholder.png";
    if (img.startsWith("http"))  return img;
    if (img.startsWith("//"))    return `https:${img}`;
    if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`;
    return `/images/products/${product.folderName || 'default'}/${img}`;
  };

  const getRelatedImageUrl = rp => {
    let img = rp.mainImage || rp.image || rp.images?.[0];
    if (!img) return "/placeholder.png";
    if (img.startsWith("http"))  return img;
    if (img.startsWith("//"))    return `https:${img}`;
    if (img.startsWith("/cdn/")) return `https://cdn.shopify.com${img}`;
    if (rp.folderName) return `/images/products/${rp.folderName}/${img}`;
    return "/placeholder.png";
  };

  const gallery = useMemo(() =>
    product.images || [product.mainImage, ...Array.from({ length: product.imagesCount || 0 }, (_, i) => `${i+1}.webp`)],
    [product]
  );

  const openGallery = idx => { setGalleryIdx(idx); setIsZoomed(false); setGalleryOpen(true); };
  const galleryNext = ()  => { setGalleryIdx(i => (i + 1) % gallery.length); setIsZoomed(false); };
  const galleryPrev = ()  => { setGalleryIdx(i => (i - 1 + gallery.length) % gallery.length); setIsZoomed(false); };

  const handleHeroTouchStart = e => { heroTouchStartX.current = e.touches[0].clientX; };
  const handleHeroTouchMove  = () => {};
  const handleHeroTouchEnd   = e => {
    if (!heroTouchStartX.current) return;
    const dx = e.changedTouches[0].clientX - heroTouchStartX.current;
    if (Math.abs(dx) > 40) {
      const ci = gallery.indexOf(activeImage);
      if (dx > 0) { const pi = (ci - 1 + gallery.length) % gallery.length; setActiveImage(gallery[pi]); setActiveIdx(pi); }
      else         { const ni = (ci + 1) % gallery.length; setActiveImage(gallery[ni]); setActiveIdx(ni); }
    }
    heroTouchStartX.current = null;
  };

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > 100 && Math.abs(dy) > Math.abs(dx)) { setGalleryOpen(false); }
    else if (Math.abs(dx) > 50) { dx > 0 ? galleryPrev() : galleryNext(); }
    touchStartX.current = null; touchStartY.current = null;
  };

  let safeSizes = [], safeColors = [];
  if (Array.isArray(product.options)) {
    product.options.forEach(opt => {
      const n = (opt.name || "").toLowerCase();
      if (n.includes("size")  || n === "المقاس" || n === "مقاس") safeSizes  = opt.values.split(",").map(s => s.trim()).filter(Boolean);
      if (n.includes("color") || n === "اللون"  || n === "لون")  safeColors = opt.values.split(",").map(c => c.trim()).filter(Boolean);
    });
  }
  if (!safeSizes.length)  safeSizes  = Array.isArray(product.sizes) ? product.sizes : [];
  if (!safeColors.length) safeColors = [];

  const currentColorImage = () => {
    if (!selectedColor) return gallery[1] || activeImage;
    const hi = product.colorSwatches?.[selectedColor];
    if (hi && (hi.startsWith("http") || hi.includes("/"))) return hi;
    return gallery[1] || activeImage;
  };

  const scrollToReviews = e => {
    e.preventDefault();
    document.getElementById("reviews-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const renderCustomHtml = position => {
    if (product?.metafields?.customHtmlSnippet && product?.metafields?.customHtmlPosition === position)
      return <div className={`w-full custom-html-snippet ${position === 'below_cart' ? 'mt-4' : 'mb-4'}`} dangerouslySetInnerHTML={{ __html: product.metafields.customHtmlSnippet }} />;
    return null;
  };

  const thumbScrollUp   = () => setThumbScrollTop(p => Math.max(0, p - 1));
  const thumbScrollDown = () => setThumbScrollTop(p => Math.min(Math.max(0, gallery.length - VISIBLE_THUMBS), p + 1));

  const getBCat = () => {
    const cats = (product?.collections?.length ? product.collections : product?.categories) || [];
    let cat = sourceCategory;
    if (!cat && cats.length) {
      const ignore = ['shop-all','best-sellers','new-arrivals','sale'];
      const sp = cats.filter(c => typeof c === 'string' && !ignore.some(t => c.includes(t)));
      cat = sp.length ? sp[0] : cats[0];
    }
    if (!cat) return null;
    const name = String(cat).replace(/^\//, '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { name, href: `/collections/${String(cat).replace(/^\//, '')}` };
  };
  const bcCat = getBCat();

  const isInStock = product?.quantity > 0 || product?.sellOutOfStock === "Yes";

  /* ── shared micro-components ── */
  const Breadcrumb = () => (
    <nav className="flex items-center gap-1.5 text-[11px] text-[#AAAAAA] flex-wrap" dir="rtl">
      <Link href="/" className="hover:text-[#111] transition-colors">الرئيسية</Link>
      {bcCat && (<><span className="text-[#DDDDDD] mx-0.5">/</span><Link href={bcCat.href} className="hover:text-[#111] transition-colors">{bcCat.name}</Link></>)}
      <span className="text-[#DDDDDD] mx-0.5">/</span>
      <span className="text-[#555] font-medium truncate max-w-[200px]">{product.title}</span>
    </nav>
  );

  const StarsRow = ({ size = 13 }) => (
    <a href="#reviews-section" onClick={scrollToReviews} className="flex items-center gap-1.5 w-fit hover:opacity-75 transition-opacity">
      <div className="flex gap-0.5 text-[#FBBC04]">
        {[...Array(5)].map((_, i) => (
          <Star key={i} size={size} fill={i < Math.round(realRating) ? "currentColor" : "none"} className={i >= Math.round(realRating) ? "text-[#E0E0E0]" : ""} />
        ))}
      </div>
      <span className="text-[11px] text-[#AAAAAA]">
        {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
      </span>
    </a>
  );

  const StockBadge = () => (
    <div className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-sm ${isInStock ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-[#FEF2F2] text-[#B91C1C]'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isInStock ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`}></span>
      {isInStock ? 'متوفر في المخزون' : 'غير متوفر في المخزون'}
    </div>
  );

  const AccordionSections = () => (
    <div dir="rtl">
      {accordionSections.map(({ key, title, html, extraClass = "" }) => (
        <details key={key} className="group border-b border-[#F0F0F0] wind-accordion">
          <summary className="flex items-center justify-between cursor-pointer py-4 list-none select-none">
            <span className="text-[13px] font-semibold text-[#111] tracking-[-0.01em]">{title}</span>
            <ChevronDown size={15} className="text-[#AAAAAA] group-open:rotate-180 transition-transform duration-300 flex-shrink-0" />
          </summary>
          <div className={`pb-5 text-[12.5px] text-[#666] leading-[1.85] ${extraClass}`} dir="rtl">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </details>
      ))}
    </div>
  );

  /* ── sticky bottom mobile bar ── */
  const MobileStickyBar = () => !showStickyBar ? null : (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-[#EBEBEB] px-4 py-3 flex items-center gap-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]" dir="rtl">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-[#111] truncate">{product.title}</p>
        <p className="text-[13px] text-[#C0392B] font-semibold">{product.price} ج.م</p>
      </div>
      <button onClick={handleAddToCart}
        className={`h-10 px-5 text-[12px] font-bold tracking-[0.03em] transition-all ${addedFeedback ? 'bg-[#111] text-white' : 'bg-[#111] text-white hover:bg-[#333]'}`}>
        {addedFeedback ? '✓ تمت' : 'أضف للسلة'}
      </button>
      <button onClick={handleBuyNow} className="h-10 px-5 text-[12px] font-bold border-2 border-[#111] text-[#111] hover:bg-[#111] hover:text-white transition-all">
        اشتري
      </button>
    </div>
  );

  /* ── sticky desktop bar ── */
  const StickyDesktopBar = () => !showStickyBar ? null : (
    <div className="hidden lg:flex fixed top-0 left-0 right-0 z-[9999] bg-white border-b border-[#EBEBEB] shadow-sm items-center px-12 h-14 gap-5" dir="rtl">
      <img src={getImageUrl(activeImage)} alt="" className="w-9 h-12 object-cover border border-[#E8E8E8]" />
      <p className="flex-1 text-[13px] font-bold text-[#111] truncate">{product.title}</p>
      <p className="text-[14px] text-[#C0392B] font-semibold shrink-0">{product.price} ج.م</p>
      <button onClick={handleAddToCart}
        className={`h-9 px-5 text-[11px] font-bold tracking-[0.04em] transition-all ${addedFeedback ? 'bg-[#111] text-white' : 'border-2 border-[#111] text-[#111] hover:bg-[#111] hover:text-white'}`}>
        {addedFeedback ? '✓ تمت الإضافة' : 'أضف إلى السلة'}
      </button>
      <button onClick={handleBuyNow} className="h-9 px-5 bg-[#111] text-white text-[11px] font-bold tracking-[0.04em] hover:bg-[#333] transition-all">اشتري الآن</button>
    </div>
  );

  /* ══════════════════════════════════════ RENDER ══════════════════════════════════════ */
  return (
    <div className="bg-white min-h-screen text-[#111] selection:bg-black selection:text-white" dir="rtl">

      <StickyDesktopBar />
      <MobileStickyBar />

      {/* ══ BREADCRUMB ══ */}
      <div className="border-b border-[#F5F5F5] px-4 lg:px-10 py-3">
        <Breadcrumb />
      </div>

      {/* ══ MOBILE + DESKTOP SHARED LAYOUT ══ */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start max-w-[1200px] mx-auto">

        {/* ── GALLERY COLUMN ── */}
        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden">

          {/* Mobile hero */}
          <div className="relative w-full aspect-square bg-[#F8F8F8] overflow-hidden lg:hidden"
            onClick={() => openGallery(activeIdx)}
            onTouchStart={handleHeroTouchStart}
            onTouchMove={handleHeroTouchMove}
            onTouchEnd={handleHeroTouchEnd}>
            <img key={activeImage} src={getImageUrl(activeImage)} alt={product.title}
              className="w-full h-full object-contain p-6 transition-all duration-500" />
            <button onClick={e => { e.stopPropagation(); openGallery(activeIdx); }}
              className="absolute top-3 left-3 w-8 h-8 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center text-[#555] shadow-sm">
              <Search size={14} />
            </button>
            <button onClick={e => { e.stopPropagation(); handleWishlistToggle(e); }}
              className="absolute top-3 right-3 w-8 h-8 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center shadow-sm">
              <Heart size={14} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "#888"} />
            </button>
          </div>

          {/* Mobile dots */}
          <div className="flex justify-center gap-1.5 py-2.5 lg:hidden">
            {gallery.map((_, i) => (
              <button key={i} onClick={() => { setActiveImage(gallery[i]); setActiveIdx(i); }}
                className={`rounded-full transition-all duration-200 ${activeIdx === i ? 'w-4 h-1.5 bg-[#111]' : 'w-1.5 h-1.5 bg-[#DDDDDD]'}`} />
            ))}
          </div>

          {/* Desktop gallery */}
          <div className="hidden lg:flex gap-3 p-6 h-full">
            {/* thumbs */}
            <div className="flex flex-col gap-2 w-[72px] flex-shrink-0">
              {thumbScrollTop > 0 && (
                <button onClick={thumbScrollUp} className="w-full h-6 flex items-center justify-center border border-[#E8E8E8] hover:border-[#111] transition-all text-[#AAA] hover:text-[#111]">
                  <ChevronUp size={11} />
                </button>
              )}
              <div className="flex flex-col gap-2 overflow-hidden" style={{ height: `${VISIBLE_THUMBS * 88}px` }}>
                {gallery.slice(thumbScrollTop, thumbScrollTop + VISIBLE_THUMBS).map((img, ri) => {
                  const idx = thumbScrollTop + ri;
                  return (
                    <button key={idx} onClick={() => { setActiveImage(img); setActiveIdx(idx); }}
                      className={`w-full aspect-square overflow-hidden border-2 transition-all flex-shrink-0 ${activeIdx === idx ? 'border-[#111]' : 'border-transparent hover:border-[#DDDDDD]'}`}>
                      <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
              {thumbScrollTop < Math.max(0, gallery.length - VISIBLE_THUMBS) && (
                <button onClick={thumbScrollDown} className="w-full h-6 flex items-center justify-center border border-[#E8E8E8] hover:border-[#111] transition-all text-[#AAA] hover:text-[#111]">
                  <ChevronDown size={11} />
                </button>
              )}
            </div>

            {/* main */}
            <div className="flex-1 relative bg-[#F8F8F8] cursor-zoom-in overflow-hidden main-img-wrap"
              onClick={() => openGallery(activeIdx)}>
              <img key={activeImage} src={getImageUrl(activeImage)} alt={product.title}
                className="w-full h-full object-contain p-8 main-img-zoom" />
              <button onClick={e => { e.stopPropagation(); handleWishlistToggle(e); }}
                className="absolute top-4 left-4 w-9 h-9 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center shadow-sm img-fade-btn hover:shadow-md transition-all">
                <Heart size={15} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "#888"} />
              </button>
              <button onClick={e => { e.stopPropagation(); openGallery(activeIdx); }}
                className="absolute top-4 right-4 w-9 h-9 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center shadow-sm img-fade-btn hover:shadow-md transition-all">
                <Search size={14} className="text-[#555]" />
              </button>
            </div>
          </div>
        </div>

        {/* ── INFO COLUMN ── */}
        <div className="px-4 pt-5 pb-24 lg:px-8 lg:pt-8 lg:pb-16 lg:border-r lg:border-[#F5F5F5]">

          {renderCustomHtml('above_title')}

          {/* category */}
          {bcCat && <p className="text-[10px] text-[#AAAAAA] tracking-[0.1em] uppercase mb-2 font-semibold reveal-item">{bcCat.name}</p>}

          {/* title */}
          <h1 className="text-[18px] lg:text-[22px] font-bold text-[#111] leading-[1.25] mb-3 reveal-item">{product.title}</h1>

          {/* stars */}
          <div className="mb-4 reveal-item"><StarsRow /></div>

          {/* price */}
          <div className="flex items-baseline gap-2 mb-1 reveal-item">
            <span className="text-[22px] lg:text-[26px] font-bold text-[#111]">{product.price}</span>
            <span className="text-[12px] text-[#AAA]">ج.م</span>
            {product.compareAtPrice && <span className="text-[13px] text-[#BBBBBB] line-through">{product.compareAtPrice} ج.م</span>}
          </div>

          {/* viewers */}
          {viewersCount > 0 && (
            <p className="text-[11px] text-[#777] mb-4 flex items-center gap-1.5 reveal-item">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse inline-block"></span>
              {viewersCount} أشخاص يشاهدون هذا المنتج الآن
            </p>
          )}

          {/* colors */}
          {safeColors.length > 0 && (
            <div className="mb-5 reveal-item">
              <p className="text-[11px] font-semibold text-[#111] mb-2.5">
                اللون: <span className="font-normal text-[#555]">{selectedColor}</span>
              </p>
              <div ref={colorsRef} className="flex flex-wrap gap-2">
                {safeColors.map((ci, i) => {
                  const name  = typeof ci === "string" ? ci : ci.name;
                  const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#DDDDDD");
                  const isImg = hi.startsWith("http") || hi.includes("/");
                  const isSel = selectedColor === name;
                  return (
                    <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name}
                      className={`w-9 h-9 rounded-full border-2 transition-all overflow-hidden ${isSel ? 'border-[#111] scale-110' : 'border-transparent hover:border-[#AAAAAA]'}`}>
                      {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover rounded-full" /> : <div style={{ backgroundColor: hi }} className="w-full h-full rounded-full" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* sizes */}
          {safeSizes.length > 0 && (
            <div className="mb-5 reveal-item">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-semibold text-[#111]">
                  المقاس: <span className="font-normal text-[#555]">{selectedSize}</span>
                </p>
                <button onClick={() => setSizeGuideOpen(true)} className="text-[10px] text-[#555] flex items-center gap-1 hover:text-[#111] transition-colors">
                  <Info size={10} /> دليل المقاسات
                </button>
              </div>
              {safeSizes.length > 1 && (
                <div className={`flex flex-wrap gap-2 ${sizeError ? 'size-shake' : ''}`}>
                  {safeSizes.map(sz => (
                    <button key={sz} onClick={() => { setSelectedSize(sz); setSizeError(false); }}
                      className={`min-w-[42px] h-9 text-[12px] font-semibold border transition-all duration-150 px-2
                        ${selectedSize === sz ? 'bg-[#111] text-white border-[#111]' : sizeError ? 'border-[#EF4444] text-[#EF4444]' : 'bg-white text-[#444] border-[#E0E0E0] hover:border-[#111]'}`}>
                      {sz}
                    </button>
                  ))}
                </div>
              )}
              {sizeError && <p className="text-[10px] text-[#EF4444] mt-1.5">يرجى اختيار المقاس</p>}
            </div>
          )}

          {/* stock */}
          <div className="mb-5 reveal-item"><StockBadge /></div>

          {/* quantity */}
          <div className="flex items-center gap-3 mb-5 reveal-item">
            <span className="text-[11px] font-semibold text-[#111]">الكمية</span>
            <div className="flex items-center border border-[#E0E0E0] h-9">
              <button onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)} className="w-9 h-full flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#F5F5F5] transition-colors border-l border-[#E0E0E0]">
                <Minus size={13} />
              </button>
              <span className="w-10 text-center text-[13px] font-semibold text-[#111]">{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)} className="w-9 h-full flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#F5F5F5] transition-colors border-r border-[#E0E0E0]">
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2.5 mb-5 reveal-item" ref={cartBtnRef}>
            <button onClick={handleAddToCart}
              className={`w-full h-12 text-[13px] font-bold tracking-[0.04em] border-2 transition-all duration-200
                ${addedFeedback ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-[#111] border-[#111] hover:bg-[#111] hover:text-white'}`}>
              {addedFeedback ? '✓ تمت الإضافة إلى السلة' : 'أضف إلى السلة'}
            </button>
            <button onClick={handleBuyNow}
              className="w-full h-12 bg-[#111] text-white text-[13px] font-bold tracking-[0.04em] hover:bg-[#333] transition-colors">
              اشتري الآن
            </button>
          </div>

          {renderCustomHtml('below_cart')}

          {/* action links */}
          <div className="flex items-center gap-5 text-[11px] text-[#777] mb-6 reveal-item">
            <button onClick={handleShare} className="flex items-center gap-1.5 hover:text-[#111] transition-colors">
              <Share2 size={13} /> مشاركة
            </button>
            <button onClick={handleWishlistToggle} className="flex items-center gap-1.5 hover:text-[#111] transition-colors">
              <Heart size={13} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "currentColor"} />
              {realLikesCount > 0 ? (realLikesCount > 999 ? (realLikesCount/1000).toFixed(1)+'K' : realLikesCount) : "إعجاب"}
            </button>
          </div>

          {/* shipping info */}
          <div className="border border-[#F0F0F0] rounded-sm p-4 mb-6 space-y-3 reveal-item">
            <div className="flex items-center gap-2.5 text-[11px] text-[#555]">
              <Truck size={14} className="text-[#111] flex-shrink-0" />
              <span>الشحن المقدر: خلال 3-7 أيام عمل</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-[#555]">
              <ShieldCheck size={14} className="text-[#111] flex-shrink-0" />
              <span>إرجاع مجاني خلال 14 يوم من الاستلام</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-[#555]">
              <Eye size={14} className="text-[#111] flex-shrink-0" />
              <span>معاينة عند الاستلام متاحة</span>
            </div>
          </div>

          {/* payment icons */}
          <div className="border border-[#F0F0F0] rounded-sm px-4 py-3 flex items-center justify-between mb-7 reveal-item">
            <div className="flex items-center gap-1.5 text-[10px] text-[#777]">
              <ShieldCheck size={12} className="text-[#22C55E]" /> ضمان الدفع الآمن
            </div>
            <div className="flex items-center gap-2 text-[#AAAAAA]">
              <CreditCard size={16} /><Banknote size={16} />
              <span className="border border-[#E8E8E8] px-1.5 py-0.5 text-[8px] text-[#444]">INSTAPAY</span>
              <span className="border border-[#E8E8E8] px-1.5 py-0.5 text-[8px] text-[#444]">VISA</span>
            </div>
          </div>

          {/* accordions */}
          {product.description && (
            <div className="border-t border-[#F0F0F0] reveal-item">
              <AccordionSections />
              {renderCustomHtml('below_description')}
            </div>
          )}
        </div>
      </div>

      {/* ══ BOTTOM SECTIONS ══ */}
      <div className="max-w-[1200px] mx-auto px-4 lg:px-8" dir="rtl">

        {/* reviews */}
        <div id="reviews-section" className="py-10 lg:py-14 border-t border-[#F0F0F0]">
          <ProductReviews
            productHandle={product.handle || product.id}
            onReviewStatsUpdate={(rating, count) => { setRealRating(rating); setRealReviewsCount(count); }}
          />
        </div>

        {/* related */}
        {product.metafields?.hideRelatedSection !== "Yes" && relatedProducts.length > 0 && (
          <div className="py-10 lg:py-14 border-t border-[#F0F0F0]">
            <h2 className="text-[11px] font-bold text-[#111] tracking-[0.12em] uppercase mb-6">منتجات قد تعجبك</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              {relatedProducts.slice(0, 4).map(rp => (
                <Link href={`/products/${rp.id}`} key={rp.id} className="group cursor-pointer block reveal-item">
                  <div className="relative aspect-square bg-[#F8F8F8] overflow-hidden mb-2.5 group-hover:bg-[#F0F0F0] transition-colors">
                    <img src={getRelatedImageUrl(rp)} alt={rp.title} loading="lazy"
                      className="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-[1.04]" />
                  </div>
                  <p className="text-[11px] text-[#555] uppercase tracking-[0.06em] mb-0.5">{rp.category || bcCat?.name || ""}</p>
                  <h3 className="text-[12px] lg:text-[13px] text-[#111] font-semibold line-clamp-2 mb-1">{rp.title}</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] font-bold text-[#111]">{rp.price}</span>
                    <span className="text-[10px] text-[#AAA]">ج.م</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {renderCustomHtml('bottom_page')}
      </div>

      {/* ══ GALLERY MODAL ══ */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-[99999] bg-white flex flex-col modal-enter" onClick={() => setGalleryOpen(false)}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0F0]" onClick={e => e.stopPropagation()}>
            <span className="text-[13px] font-bold text-[#111]">{product.title}</span>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-[#AAA]">{galleryIdx + 1} / {gallery.length}</span>
              <button onClick={() => setGalleryOpen(false)} className="w-8 h-8 bg-[#F5F5F5] hover:bg-[#EBEBEB] border border-[#E8E8E8] rounded-full flex items-center justify-center text-[#333] transition-all">
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center bg-[#F8F8F8]"
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={e => e.stopPropagation()}>
            <img key={galleryIdx} src={getImageUrl(gallery[galleryIdx])} alt="" onClick={() => setIsZoomed(!isZoomed)}
              className={`max-h-[88vh] max-w-[88vw] object-contain transition-transform duration-500 ${isZoomed ? "scale-[1.5] cursor-zoom-out" : "cursor-zoom-in"}`} />
            {!isZoomed && (
              <>
                <button onClick={galleryPrev} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center text-[#333] hover:border-[#111] transition-all shadow-sm"><ChevronRight size={18} /></button>
                <button onClick={galleryNext} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center text-[#333] hover:border-[#111] transition-all shadow-sm"><ChevronLeft size={18} /></button>
              </>
            )}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 bg-white/90 px-3 py-1.5 rounded-full border border-[#E8E8E8]">
              {gallery.map((_, i) => <span key={i} className={`rounded-full bg-[#111] transition-all ${galleryIdx === i ? "w-4 h-1.5 opacity-100" : "w-1.5 h-1.5 opacity-20"}`} />)}
            </div>
          </div>
        </div>
      )}

      {/* ══ DESCRIPTION MODAL ══ */}
      {isDescModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-5">
          <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-none overflow-hidden flex flex-col max-h-[82vh] modal-enter shadow-xl">
            <div className="px-5 py-4 border-b border-[#F0F0F0] flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-bold text-[14px] text-[#111]">تفاصيل المنتج</h3>
              <button onClick={() => setDescModalOpen(false)} className="w-8 h-8 bg-[#F5F5F5] hover:bg-[#EBEBEB] rounded-full flex items-center justify-center text-[#555] transition-all"><X size={15} /></button>
            </div>
            <div className="p-5 overflow-y-auto ql-editor-display" dir="rtl">
              <div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} />
            </div>
          </div>
        </div>
      )}

      {/* ══ COLOR ZOOM MODAL ══ */}
      {isImageZoomModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#FAFAFA] p-4 modal-enter" onClick={() => setImageZoomModalOpen(false)}>
          <div className="relative w-full max-w-md aspect-square overflow-hidden border border-[#E8E8E8]" onClick={e => e.stopPropagation()}>
            <img src={getImageUrl(currentColorImage())} alt="" className="w-full h-full object-contain p-4" />
            <button onClick={() => setImageZoomModalOpen(false)} className="absolute top-3 left-3 w-8 h-8 bg-white rounded-full border border-[#E8E8E8] flex items-center justify-center text-[#333]"><X size={14} /></button>
          </div>
        </div>
      )}

      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={product} />

      {/* ══ STYLES ══ */}
      <style jsx global>{`
        @keyframes revealUp { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes shake    { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-4px)} 40%,80%{transform:translateX(4px)} }

        .modal-enter { animation: revealUp .28s cubic-bezier(.25,1,.5,1) }
        .size-shake  { animation: shake .4s ease-out }

        /* Scroll reveal */
        .reveal-item {
          opacity: 0;
          transform: translateY(16px);
          animation: revealUp .45s cubic-bezier(.25,1,.5,1) forwards;
        }
        .reveal-item:nth-child(1)  { animation-delay: .04s }
        .reveal-item:nth-child(2)  { animation-delay: .08s }
        .reveal-item:nth-child(3)  { animation-delay: .12s }
        .reveal-item:nth-child(4)  { animation-delay: .16s }
        .reveal-item:nth-child(5)  { animation-delay: .20s }
        .reveal-item:nth-child(6)  { animation-delay: .24s }
        .reveal-item:nth-child(7)  { animation-delay: .28s }
        .reveal-item:nth-child(8)  { animation-delay: .32s }
        .reveal-item:nth-child(9)  { animation-delay: .36s }
        .reveal-item:nth-child(10) { animation-delay: .40s }
        .reveal-item:nth-child(n+11) { animation-delay: .44s }

        .hide-scrollbar-horizontal::-webkit-scrollbar { height:0 }
        .hide-scrollbar-horizontal { -ms-overflow-style:none; scrollbar-width:none }

        /* Desktop gallery hover */
        .main-img-wrap { isolation: isolate }
        .main-img-zoom { transition: transform .7s cubic-bezier(.25,1,.5,1) }
        .main-img-wrap:hover .main-img-zoom { transform: scale(1.03) }
        .img-fade-btn { opacity:0; transition: opacity .2s }
        .main-img-wrap:hover .img-fade-btn { opacity:1 }

        /* Accordion */
        .wind-accordion summary::-webkit-details-marker { display:none }

        /* Quill display */
        .ql-editor-display p  { margin-bottom:8px; line-height:1.85; color:#666; font-size:12.5px }
        .ql-editor-display ul { list-style-type:disc!important; padding-right:18px!important; margin-bottom:10px; color:#666 }
        .ql-editor-display ol { list-style-type:decimal!important; padding-right:18px!important; margin-bottom:10px; color:#666 }
        .ql-editor-display strong { font-weight:600; color:#333 }
        .ql-editor-display details { border:1px solid #EBEBEB!important; margin-bottom:8px; padding:0 12px!important }
        .ql-editor-display details[open] { border-color:#BBBBBB!important }
        .ql-editor-display summary { color:#333!important; font-weight:600; font-size:12px!important; padding:10px 0!important; cursor:pointer }
        .ql-editor-display summary::-webkit-details-marker { display:none }
        .ql-editor-display div { color:#666!important; line-height:1.85; padding-bottom:10px; font-size:12.5px }
        .ql-editor-display .read-more-wrapper { border:none!important; padding:0!important; margin-top:4px!important }
        .ql-editor-display .read-more-wrapper[open] { border:none!important }
        .ql-editor-display .read-more-wrapper .less-text { display:none }
        .ql-editor-display .read-more-wrapper[open] .more-text { display:none }
        .ql-editor-display .read-more-wrapper[open] .less-text { display:inline }
        .ql-editor-display .read-more-wrapper > summary {
          font-size:11px!important; font-weight:400!important; color:#888!important;
          text-decoration:underline!important; text-underline-offset:3px!important;
          padding:4px 0!important; border:none!important; display:inline-block!important
        }
      `}</style>
    </div>
  );
}