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

  /* ─────────── core state ─────────── */
  const [product, setProduct]           = useState(initialProduct || null);
  const [loading, setLoading]           = useState(!initialProduct);
  const [activeImage, setActiveImage]   = useState(initialProduct?.images?.[0] || initialProduct?.mainImage || "");
  const [activeIdx, setActiveIdx]       = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [quantity, setQuantity]         = useState(1);

  /* ─────────── UI modals ─────────── */
  const [isSizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [isGalleryOpen, setGalleryOpen]     = useState(false);
  const [galleryIdx, setGalleryIdx]         = useState(0);
  const [isZoomed, setIsZoomed]             = useState(false);
  const [isImageZoomModalOpen, setImageZoomModalOpen] = useState(false);
  const [isDescModalOpen, setDescModalOpen] = useState(false);

  /* ─────────── wishlist / likes ─────────── */
  const [isWishlisted, setIsWishlisted]     = useState(false);
  const [realLikesCount, setRealLikesCount] = useState(0);
  const likeTimeoutRef   = useRef(null);
  const pendingActionRef = useRef(0);

  /* ─────────── reviews ─────────── */
  const [realRating, setRealRating]           = useState(0);
  const [realReviewsCount, setRealReviewsCount] = useState(0);

  /* ─────────── related ─────────── */
  const [relatedProducts, setRelatedProducts] = useState([]);

  /* ─────────── NEW UX state ─────────── */
  const [sizeError, setSizeError]       = useState(false);           // shake on missing size
  const [addedFeedback, setAddedFeedback] = useState(false);          // ✓ confirmed in button
  const [showStickyBar, setShowStickyBar] = useState(false);          // sticky header on scroll
  const [viewersCount] = useState(() => Math.floor(Math.random() * 9) + 4); // social proof

  /* ─────────── refs ─────────── */
  const isSwipingHero  = useRef(false);
  const heroTouchStartX = useRef(null);
  const touchStartX    = useRef(null);
  const touchStartY    = useRef(null);
  const colorsRef      = useRef(null);
  const cartBtnRef     = useRef(null);        // sentinel for sticky bar
  const [thumbScrollTop, setThumbScrollTop] = useState(0);
  const VISIBLE_THUMBS = 6;

  /* ─────────── sticky bar observer ─────────── */
  useEffect(() => {
    const sentinel = cartBtnRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [product]);

  /* ─────────── wishlist init ─────────── */
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

  /* ─────────── share ─────────── */
  const handleShare = async (e) => {
    e.stopPropagation();
    const shareData = { title: product?.title || 'WIND', text: 'تسوق هذا المنتج من WIND', url: window.location.href };
    try {
      if (navigator.share) { await navigator.share(shareData); }
      else { await navigator.clipboard.writeText(window.location.href); alert('تم نسخ الرابط!'); }
    } catch { /* cancelled */ }
  };

  /* ─────────── wishlist toggle ─────────── */
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
        if (product.currentWeekId === week)     { data.weeklyLikesCount = increment(net); }
        else if (net > 0) { data.weeklyLikesCount = 1; data.currentWeekId = week; }
        await updateDoc(ref, data);
        pendingActionRef.current = 0;
        fetch('/api/revalidate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'likes', id: product.id, handle: product.handle || product.id })
        }).then(() => {
          sessionStorage.removeItem(`wind_stats_${product.handle || product.id}`);
          mutate('homepage/data');
          mutate('homepage-products-sections');
          mutate(`product-${product.id}`);
        }).catch(() => {});
      } catch { pendingActionRef.current = 0; }
    }, 1500);
  };

  /* ─────────── body scroll lock ─────────── */
  useEffect(() => {
    const locked = isGalleryOpen || isImageZoomModalOpen || isDescModalOpen;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isGalleryOpen, isImageZoomModalOpen, isDescModalOpen]);

  /* ─────────── SWR data ─────────── */
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

  /* ─────────── ADD TO CART with validation ─────────── */
  const handleAddToCart = () => {
    if (safeSizes.length > 1 && !selectedSize) {
      setSizeError(true);
      setTimeout(() => setSizeError(false), 900);
      return;
    }
    addToCart({ ...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2200);
    setQuantity(1);
  };

  /* ─────────── BUY NOW ─────────── */
  const handleBuyNow = () => {
    if (safeSizes.length > 1 && !selectedSize) {
      setSizeError(true);
      setTimeout(() => setSizeError(false), 900);
      return;
    }
    addToCart({ ...product, selectedSize, selectedColor, image: getImageUrl(activeImage), qty: quantity });
    window.location.href = '/cart';
  };

  /* ─────────── computed ─────────── */
  const shortDescription = useMemo(() => {
    if (!product?.description) return "";
    let text = product.description
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "")
      .replace(/<[^>]+>/g, "");
    [/^\s*عن المنتج\s*[:\-\s]*/i, /^\s*الوصف\s*[:\-\s]*/i, /^\s*وصف المنتج\s*[:\-\s]*/i]
      .forEach(r => { text = text.replace(r, ""); });
    return text.trim().substring(0, 110) + "... ";
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
      { key: "عن المنتج",           title: "عن المنتج",          html: parsedSections["عن المنتج"] || closedDescriptionHTML, extraClass: "ql-editor-display" },
      { key: "الخامة والمواصفات",   title: "الخامة والمواصفات",  html: parsedSections["الخامة والمواصفات"] || "<p>خامات عالية الجودة. راجع ملصق العناية للمزيد.</p>" },
      { key: "الشحن والاستبدال",    title: "الشحن والاسترجاع",   html: parsedSections["الشحن والاستبدال"] || "<p>شحن خلال 3-7 أيام. إرجاع مجاني خلال 14 يوم.</p>" },
    ];
    if (parsedSections["العناية بالمنتج"])
      base.push({ key: "العناية بالمنتج", title: "العناية بالمنتج", html: parsedSections["العناية بالمنتج"] });
    return base;
  }, [parsedSections, closedDescriptionHTML]);

  if (loading && !product) return null;
  if (!product) return null;

  /* ─────────── helpers ─────────── */
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

  const openGallery  = idx => { setGalleryIdx(idx); setIsZoomed(false); setGalleryOpen(true); };
  const galleryNext  = ()  => { setGalleryIdx(i => (i + 1) % gallery.length); setIsZoomed(false); };
  const galleryPrev  = ()  => { setGalleryIdx(i => (i - 1 + gallery.length) % gallery.length); setIsZoomed(false); };

  const handleHeroTouchStart = e => { heroTouchStartX.current = e.touches[0].clientX; };
  const handleHeroTouchMove  = () => {};
  const handleHeroTouchEnd   = e => {
    if (!heroTouchStartX.current) return;
    const dx = e.changedTouches[0].clientX - heroTouchStartX.current;
    if (Math.abs(dx) > 40) {
      const ci = gallery.indexOf(activeImage);
      if (dx > 0) { const pi = (ci - 1 + gallery.length) % gallery.length; setActiveImage(gallery[pi]); setActiveIdx(pi); }
      else         { const ni = (ci + 1) % gallery.length;                  setActiveImage(gallery[ni]); setActiveIdx(ni); }
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

  /* ─────────── sizes / colors ─────────── */
  let safeSizes = [], safeColors = [];
  if (Array.isArray(product.options)) {
    product.options.forEach(opt => {
      const n = (opt.name || "").toLowerCase();
      if (n.includes("size")  || n === "المقاس" || n === "مقاس") safeSizes  = opt.values.split(",").map(s => s.trim()).filter(Boolean);
      if (n.includes("color") || n === "اللون"  || n === "لون")  safeColors = opt.values.split(",").map(c => c.trim()).filter(Boolean);
    });
  }
  if (!safeSizes.length)  safeSizes  = Array.isArray(product.sizes)  ? product.sizes  : [];
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
      return <div className={`w-full custom-html-snippet ${position === 'below_cart' ? 'mt-5' : 'mb-5'}`}
               dangerouslySetInnerHTML={{ __html: product.metafields.customHtmlSnippet }} />;
    return null;
  };

  const thumbScrollUp   = () => setThumbScrollTop(p => Math.max(0, p - 1));
  const thumbScrollDown = () => setThumbScrollTop(p => Math.min(Math.max(0, gallery.length - VISIBLE_THUMBS), p + 1));

  /* ─────────── breadcrumb helper ─────────── */
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

  /* ─────────── shared sub-components ─────────── */
  const Breadcrumb = ({ cls = "" }) => (
    <nav className={`flex items-center gap-2 text-[10px] text-[#AAAAAA] flex-wrap ${cls}`}>
      <Link href="/" className="hover:text-[#111] transition-colors">الرئيسية</Link>
      {bcCat && (<><span className="text-[#DDDDDD]">/</span><Link href={bcCat.href} className="hover:text-[#111] transition-colors">{bcCat.name}</Link></>)}
      <span className="text-[#DDDDDD]">/</span>
      <span className="text-[#333] font-medium truncate max-w-[240px]">{product.title}</span>
    </nav>
  );

  const Stars = ({ size = 13 }) => (
    <div className="flex gap-0.5 text-[#E8A500]">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={size} fill={i < Math.round(realRating) ? "currentColor" : "none"}
          className={i >= Math.round(realRating) ? "text-[#DDDDDD]" : ""} />
      ))}
    </div>
  );

  const TrustGrid = ({ small = false }) => (
    <>
      <div className="grid grid-cols-3 gap-px bg-[#EBEBEB]">
        {[
          { icon: <Truck   size={small ? 11 : 13} />, label: "شحن سريع"   },
          { icon: <Eye     size={small ? 11 : 13} />, label: "معاينة"     },
          { icon: <ShieldCheck size={small ? 11 : 13} />, label: "استرجاع سهل" },
        ].map(({ icon, label }) => (
          <div key={label} className={`flex items-center gap-1.5 ${small ? 'text-[9px] py-2.5' : 'text-[10px] py-3'} text-[#777] justify-center bg-white`}>
            <span className="text-[#333]">{icon}</span>{label}
          </div>
        ))}
      </div>
      <div className={`flex items-center justify-between bg-[#FAFAFA] ${small ? 'py-2 px-3' : 'py-2.5 px-4'} border border-[#EBEBEB]`}>
        <div className={`flex items-center gap-1.5 ${small ? 'text-[9px]' : 'text-[10px]'} text-[#777]`}>
          <ShieldCheck size={small ? 11 : 12} className="text-[#333]" /> دفع آمن 100%
        </div>
        <div className="flex items-center gap-2 text-[#AAAAAA]">
          <CreditCard size={small ? 14 : 15} /><Banknote size={small ? 14 : 15} />
          <span className="border border-[#E0E0E0] px-1.5 py-0.5 text-[7px] text-[#333]">INSTAPAY</span>
          <span className="border border-[#E0E0E0] px-1.5 py-0.5 text-[7px] text-[#333]">VISA</span>
        </div>
      </div>
    </>
  );

  const AccordionSections = () => (
    <div>
      {accordionSections.map(({ key, title, html, extraClass = "" }) => (
        <details key={key} className="group border-b border-[#EBEBEB]">
          <summary className="flex items-center justify-between cursor-pointer py-5 list-none select-none">
            <span className="text-[12px] font-semibold text-[#111] tracking-[0.01em]">{title}</span>
            <span className="text-[#BBBBBB] group-open:rotate-45 transition-transform duration-300 text-lg leading-none">+</span>
          </summary>
          <div className={`pb-6 text-[12px] text-[#777] leading-[1.9] ${extraClass}`} dir="rtl">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </details>
      ))}
    </div>
  );

  /* ─────────── shared Selectors ─────────── */
  const ColorSelector = ({ mobile = false }) => safeColors.length === 0 ? null : (
    <div className={mobile ? "mb-6" : "mb-7"}>
      <div className={`flex items-baseline gap-2 ${mobile ? 'mb-2.5' : 'mb-3'}`}>
        <span className={`${mobile ? 'text-[10px]' : 'text-[10px]'} text-[#AAAAAA] tracking-[0.12em] uppercase font-semibold`}>
          {safeColors.length > 1 ? "اختر اللون" : "اللون"}
        </span>
        {selectedColor && <span className={`text-[#111] ${mobile ? 'text-[11px]' : 'text-[12px]'} font-semibold capitalize`}>{selectedColor}</span>}
      </div>
      <div ref={colorsRef} className="flex flex-wrap gap-2.5">
        {safeColors.map((ci, i) => {
          const name  = typeof ci === "string" ? ci : ci.name;
          const hi    = product.colorSwatches?.[name] || (typeof ci === "object" ? ci.swatch : "#DDDDDD");
          const isImg = hi.startsWith("http") || hi.includes("/");
          const isSel = selectedColor === name;
          return (
            <button key={i} onClick={() => { setSelectedColor(name); if (isImg) { setActiveImage(hi); setActiveIdx(0); } }} title={name}>
              <div className={`${mobile ? 'w-10 h-10' : 'w-11 h-11'} border transition-all duration-200 ${isSel ? "border-black outline outline-1 outline-black outline-offset-2" : "border-[#E0E0E0] hover:border-[#999]"}`}>
                {isImg ? <img src={getImageUrl(hi)} alt={name} className="w-full h-full object-cover" /> : <div style={{ backgroundColor: hi }} className="w-full h-full" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const SizeSelector = ({ mobile = false }) => safeSizes.length === 0 ? null : (
    <div className={mobile ? "mb-6" : "mb-7"}>
      <div className={`flex items-center justify-between ${mobile ? 'mb-2.5' : 'mb-3'}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-[#AAAAAA] tracking-[0.12em] uppercase font-semibold">
            {safeSizes.length > 1 ? "اختر المقاس" : "المقاس"}
          </span>
          {selectedSize && <span className={`text-[#111] ${mobile ? 'text-[11px]' : 'text-[12px]'} font-semibold capitalize`}>{selectedSize}</span>}
        </div>
        <button onClick={() => setSizeGuideOpen(true)}
          className="text-[10px] text-[#333] flex items-center gap-1 border border-[#E0E0E0] hover:border-black px-3 py-1 transition-all">
          <Info size={9} /> دليل القياسات
        </button>
      </div>
      {safeSizes.length > 1 && (
        <div className={`flex flex-wrap gap-2 ${sizeError ? 'size-shake' : ''}`}>
          {safeSizes.map(sz => (
            <button key={sz} onClick={() => { setSelectedSize(sz); setSizeError(false); }}
              className={`${mobile ? 'min-w-[46px] h-9' : 'min-w-[52px] h-10'} text-[12px] font-medium border transition-all duration-200 capitalize px-2
                ${selectedSize === sz
                  ? "bg-black text-white border-black"
                  : sizeError
                    ? "bg-white text-[#C0392B] border-[#C0392B]"
                    : "bg-white text-[#666] border-[#E0E0E0] hover:border-black hover:text-black"
                }`}>{sz}</button>
          ))}
        </div>
      )}
      {sizeError && (
        <p className="text-[10px] text-[#C0392B] mt-2 flex items-center gap-1">
          <Info size={10} /> يرجى اختيار المقاس أولاً
        </p>
      )}
    </div>
  );

  /* ─────────── cart buttons ─────────── */
  const CartButtons = ({ mobile = false }) => (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-3">
        {/* outlined add to cart */}
        <button ref={!mobile ? cartBtnRef : null}
          id={!mobile ? "desktop-cart-btn" : undefined}
          onClick={handleAddToCart}
          className={`flex-1 ${mobile ? 'h-[46px]' : 'h-[52px]'} border-[1.5px] font-semibold tracking-[0.05em] transition-all duration-250 text-[12px]
            ${addedFeedback
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black hover:bg-black hover:text-white"
            }`}
        >
          {addedFeedback ? "✓ تمت الإضافة" : "أضف إلى السلة"}
        </button>

        {/* quantity */}
        <div className={`flex items-center justify-between bg-white border border-[#E0E0E0] px-1 ${mobile ? 'w-[72px] h-[46px]' : 'w-[80px] h-[52px]'} shrink-0`}>
          <button onClick={() => setQuantity(q => q + 1)} className="text-[#888] hover:text-black p-1.5 transition-colors"><Plus size={13} /></button>
          <span className="text-[#111] text-[12px] font-semibold">{quantity}</span>
          <button onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)} className="text-[#888] hover:text-black p-1.5 transition-colors"><Minus size={13} /></button>
        </div>
      </div>

      {/* solid buy now */}
      <button onClick={handleBuyNow}
        className={`w-full ${mobile ? 'h-[46px]' : 'h-[52px]'} bg-black text-white border-[1.5px] border-black font-semibold tracking-[0.05em] text-[12px] hover:bg-[#222] transition-colors`}
      >
        اشتري الآن
      </button>
    </div>
  );

  /* ─────────── Sticky Desktop Bar ─────────── */
  const StickyDesktopBar = () => !showStickyBar ? null : (
    <div className="hidden lg:flex fixed top-0 left-0 right-0 z-[9999] bg-white border-b border-[#EBEBEB] shadow-sm items-center px-12 py-3 gap-6" dir="rtl">
      <img src={getImageUrl(activeImage)} alt="" className="w-10 h-14 object-cover border border-[#E0E0E0]" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[#111] truncate">{product.title}</p>
        <p className="text-[13px] text-[#C0392B] font-medium">{product.price} ج.م</p>
      </div>
      <div className="flex gap-2.5 shrink-0">
        <button onClick={handleAddToCart}
          className="h-9 px-6 border-[1.5px] border-black bg-white text-black hover:bg-black hover:text-white transition-all text-[11px] font-semibold tracking-[0.05em]">
          {addedFeedback ? "✓ تمت الإضافة" : "أضف إلى السلة"}
        </button>
        <button onClick={handleBuyNow}
          className="h-9 px-6 bg-black text-white hover:bg-[#222] transition-colors text-[11px] font-semibold tracking-[0.05em]">
          اشتري الآن
        </button>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <div className="bg-white min-h-screen text-[#111] pb-16 selection:bg-black selection:text-white">

      <StickyDesktopBar />

      {/* ══════════ MOBILE VIEW ══════════ */}
      <div className="lg:hidden">

        {/* breadcrumb */}
        <div className="px-4 py-3 border-b border-[#F2F2F2]" dir="rtl">
          <Breadcrumb />
        </div>

        {/* hero */}
        <div className="relative w-full aspect-[3/4] bg-[#F7F7F7] overflow-hidden"
          onClick={() => openGallery(activeIdx)}
          onTouchStart={handleHeroTouchStart}
          onTouchMove={handleHeroTouchMove}
          onTouchEnd={handleHeroTouchEnd}
        >
          <img key={activeImage} src={getImageUrl(activeImage)} alt={product.title}
            className="w-full h-full object-cover transition-all duration-500" />

          {/* top-right float buttons */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <button onClick={e => { e.stopPropagation(); openGallery(activeIdx); }}
              className="w-8 h-8 bg-white/88 border border-[#E0E0E0] rounded-full flex items-center justify-center text-[#333] hover:bg-white transition-all">
              <Search size={15} />
            </button>
            <button onClick={e => { e.stopPropagation(); handleWishlistToggle(e); }}
              className="w-8 h-8 bg-white/88 border border-[#E0E0E0] rounded-full flex items-center justify-center transition-all hover:bg-white">
              <Heart size={15} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "#555"} />
            </button>
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10 bg-white/88 border border-[#E0E0E0] px-3 py-1 rounded-full text-[9px] text-[#555] tracking-[0.08em]">
            {activeIdx + 1} / {gallery.length}
          </div>
        </div>

        {/* thumbnails */}
        <div className="overflow-x-auto hide-scrollbar-horizontal border-b border-[#F5F5F5]">
          <div className="flex gap-2 px-4 py-2.5" dir="rtl">
            {gallery.map((img, idx) => (
              <button key={idx} onClick={() => { setActiveImage(img); setActiveIdx(idx); }}
                className={`flex-shrink-0 w-[52px] h-[68px] overflow-hidden border transition-all duration-200
                  ${activeIdx === idx ? 'border-black' : 'border-[#E5E5E5] opacity-50 hover:opacity-80'}`}>
                <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* content */}
        <div className="px-4 pt-5 pb-6" dir="rtl">

          {/* action bar */}
          <div className="flex items-center gap-5 mb-5">
            <button onClick={e => { e.stopPropagation(); openGallery(activeIdx); }}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#111] transition-colors">
              <ImageIcon size={15} />
              <span className="text-[10px] tracking-[0.05em]">{gallery.length} صور</span>
            </button>
            <button onClick={handleWishlistToggle}
              className="flex items-center gap-1.5 transition-colors hover:text-black text-[#888]">
              <Heart size={15} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "currentColor"} />
              <span className={`text-[10px] tracking-[0.05em] ${isWishlisted ? 'text-black' : ''}`}>
                {realLikesCount > 0 ? (realLikesCount > 999 ? (realLikesCount / 1000).toFixed(1) + 'K' : realLikesCount) : "إعجاب"}
              </span>
            </button>
            <button onClick={handleShare} className="flex items-center gap-1.5 text-[#888] hover:text-[#111] transition-colors">
              <Share2 size={15} />
              <span className="text-[10px] tracking-[0.05em]">مشاركة</span>
            </button>
          </div>

          {renderCustomHtml('above_title')}

          {bcCat && <p className="text-[9px] text-[#AAAAAA] tracking-[0.12em] uppercase mb-2 font-semibold">{bcCat.name}</p>}

          <h1 className="text-[20px] font-bold text-[#111] tracking-tight leading-[1.2] mb-3">{product.title}</h1>

          <a href="#reviews-section" onClick={scrollToReviews}
            className="flex items-center gap-2 w-fit hover:opacity-70 transition-opacity mb-3">
            <Stars size={12} />
            <span className="text-[10px] text-[#999]">
              {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
            </span>
          </a>

          {/* price */}
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[22px] font-light text-[#C0392B]">{product.price}</span>
            <span className="text-[11px] text-[#999]">ج.م</span>
            {product.compareAtPrice && <span className="text-[11px] text-[#BBBBBB] line-through">{product.compareAtPrice} ج.م</span>}
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
              <span className="text-[10px] text-[#888]">
                {product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? "متوفر" : "غير متوفر"}
              </span>
            </div>
            {viewersCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                <span className="text-[10px] text-[#888]">{viewersCount} يشاهدون الآن</span>
              </div>
            )}
          </div>

          {/* short desc */}
          {product.description && (
            <div className="pb-5 border-b border-[#F0F0F0] mb-5">
              <p className="text-[12px] leading-[1.85] text-[#777]">{shortDescription}</p>
              <button onClick={() => setDescModalOpen(true)}
                className="text-[#333] text-[11px] flex items-center gap-1.5 hover:underline underline-offset-4 mt-2">
                <Info size={11} /> عرض التفاصيل والخامات
              </button>
            </div>
          )}

          <ColorSelector mobile />
          <SizeSelector mobile />

          {/* sticky bottom */}
          <div className="sticky bottom-0 bg-white -mx-4 px-4 pt-3 pb-3 border-t border-[#F0F0F0] mt-1">
            <CartButtons mobile />
            {renderCustomHtml('below_cart')}
          </div>

          <TrustGrid small />

          {/* accordions */}
          {product.description && (
            <div className="mt-7 border-t border-[#EBEBEB] pt-1">
              <AccordionSections />
              {renderCustomHtml('below_description')}
            </div>
          )}
        </div>
      </div>

      {/* ══════════ DESKTOP VIEW ══════════ */}
      <div className="hidden lg:block bg-white">

        {/* breadcrumb bar */}
        <div className="border-b border-[#F2F2F2]">
          <div className="max-w-[1440px] mx-auto px-14 py-4" dir="rtl">
            <Breadcrumb />
          </div>
        </div>

        {/* 2-column layout */}
        <div className="max-w-[1440px] mx-auto flex items-start" dir="ltr">

          {/* ── LEFT: Gallery (sticky) ── */}
          <div className="w-[55%] sticky top-0 h-screen overflow-hidden flex gap-5 px-14 py-10" dir="rtl">

            {/* vertical thumbs */}
            <div className="w-[76px] flex-shrink-0 flex flex-col items-center gap-1.5">
              {thumbScrollTop > 0 && (
                <button onClick={thumbScrollUp}
                  className="w-full py-1.5 flex items-center justify-center border border-[#E0E0E0] hover:border-black transition-all text-[#999] hover:text-black">
                  <ChevronUp size={12} />
                </button>
              )}
              <div className="flex flex-col gap-2 overflow-hidden" style={{ height: `${VISIBLE_THUMBS * 112}px` }}>
                {gallery.slice(thumbScrollTop, thumbScrollTop + VISIBLE_THUMBS).map((img, ri) => {
                  const idx = thumbScrollTop + ri;
                  return (
                    <button key={idx} onClick={() => { setActiveImage(img); setActiveIdx(idx); }}
                      className={`w-full aspect-[3/4] overflow-hidden border transition-all duration-200 flex-shrink-0
                        ${activeIdx === idx ? 'border-black' : 'border-[#E5E5E5] hover:border-[#999]'}`}>
                      <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
              {thumbScrollTop < Math.max(0, gallery.length - VISIBLE_THUMBS) && (
                <button onClick={thumbScrollDown}
                  className="w-full py-1.5 flex items-center justify-center border border-[#E0E0E0] hover:border-black transition-all text-[#999] hover:text-black">
                  <ChevronDown size={12} />
                </button>
              )}
            </div>

            {/* main image */}
            <div className="flex-1 relative bg-[#F7F7F7] aspect-[3/4] cursor-zoom-in overflow-hidden main-img-wrap"
              onClick={() => openGallery(activeIdx)}>
              <img key={activeImage} src={getImageUrl(activeImage)} alt={product.title}
                className="w-full h-full object-cover main-img-zoom" />

              {/* wishlist overlay */}
              <button onClick={e => { e.stopPropagation(); handleWishlistToggle(e); }}
                className="absolute top-3.5 left-3.5 z-10 w-9 h-9 bg-white/88 border border-[#E0E0E0] rounded-full flex items-center justify-center hover:bg-white transition-all img-fade-btn">
                <Heart size={16} fill={isWishlisted ? "#111" : "none"} color={isWishlisted ? "#111" : "#555"} />
              </button>

              <button onClick={e => { e.stopPropagation(); openGallery(activeIdx); }}
                className="absolute top-3.5 right-3.5 z-10 w-9 h-9 bg-white/88 border border-[#E0E0E0] rounded-full flex items-center justify-center hover:bg-white transition-all img-fade-btn">
                <Search size={15} />
              </button>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/88 border border-[#E0E0E0] px-3 py-1 rounded-full text-[9px] text-[#555] pointer-events-none">
                {activeIdx + 1} / {gallery.length}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Info ── */}
          <div className="w-[45%] border-r border-[#F2F2F2] px-12 py-10 flex flex-col min-h-screen" dir="rtl">

            {renderCustomHtml('above_title')}

            {bcCat && <p className="text-[9px] text-[#AAAAAA] tracking-[0.14em] uppercase mb-3 font-semibold">{bcCat.name}</p>}

            <h1 className="text-[26px] font-bold text-[#111] tracking-tight leading-[1.15] mb-4">{product.title}</h1>

            <a href="#reviews-section" onClick={scrollToReviews}
              className="flex items-center gap-2 w-fit hover:opacity-70 transition-opacity mb-5">
              <Stars size={14} />
              <span className="text-[11px] text-[#999] hover:text-black transition-colors">
                {realReviewsCount > 0 ? `(${realReviewsCount})` : "(أضف أول تقييم)"}
              </span>
            </a>

            {/* price */}
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[28px] font-light text-[#C0392B]">{product.price}</span>
              <span className="text-[13px] text-[#999]">ج.م</span>
              {product.compareAtPrice && <span className="text-[13px] text-[#BBBBBB] line-through">{product.compareAtPrice} ج.م</span>}
            </div>

            <div className="flex items-center gap-5 mb-6">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                <span className="text-[11px] text-[#888]">
                  {product?.quantity > 0 || product?.sellOutOfStock === "Yes" ? "متوفر" : "غير متوفر"}
                </span>
              </div>
              {viewersCount > 0 && (
                <div className="flex items-center gap-1.5 bg-[#F9F9F9] border border-[#F0F0F0] px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                  <span className="text-[10px] text-[#777]">{viewersCount} أشخاص يشاهدون الآن</span>
                </div>
              )}
            </div>

            {/* short desc */}
            {product.description && (
              <div className="pb-7 border-b border-[#F0F0F0]">
                <p className="text-[12px] leading-[1.95] text-[#777]">{shortDescription}</p>
                <button onClick={() => setDescModalOpen(true)}
                  className="text-[#333] text-[11px] flex items-center gap-1.5 hover:underline underline-offset-4 mt-2">
                  <Info size={11} /> عرض التفاصيل والخامات
                </button>
              </div>
            )}

            <div className="pt-7">
              <ColorSelector />
              <SizeSelector />
            </div>

            {/* cart buttons */}
            <div className="mb-6">
              <CartButtons />
              {renderCustomHtml('below_cart')}
            </div>

            <TrustGrid />

            {/* accordions */}
            {product.description && (
              <div className="mt-8 border-t border-[#EBEBEB] pt-1">
                <AccordionSections />
                {renderCustomHtml('below_description')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ BOTTOM SECTIONS ══════════ */}
      <div className="max-w-[1440px] mx-auto px-4 lg:px-14" dir="rtl">

        <div id="reviews-section" className="py-10 lg:py-16 border-t border-[#EBEBEB]">
          <ProductReviews
            productHandle={product.handle || product.id}
            onReviewStatsUpdate={(rating, count) => { setRealRating(rating); setRealReviewsCount(count); }}
          />
        </div>

        {product.metafields?.hideRelatedSection !== "Yes" && relatedProducts.length > 0 && (
          <div className="py-12 lg:py-16 border-t border-[#EBEBEB]">
            <h2 className="text-[10px] font-semibold text-[#111] tracking-[0.14em] uppercase mb-8 lg:mb-10">منتجات قد تعجبك</h2>
            <div className="flex gap-5 lg:gap-7 overflow-x-auto hide-scrollbar-horizontal pb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
              {relatedProducts.map(rp => (
                <Link href={`/products/${rp.id}`} key={rp.id}
                  className="flex-shrink-0 w-[130px] lg:w-[175px] group cursor-pointer block">
                  <div className="relative aspect-[3/4] bg-[#F7F7F7] overflow-hidden border border-[#EBEBEB] mb-3 group-hover:border-[#999] transition-all duration-300">
                    <img src={getRelatedImageUrl(rp)} alt={rp.title} loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                  </div>
                  <h3 className="text-[11px] lg:text-[12px] text-[#111] font-semibold line-clamp-2 mb-1">{rp.title}</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-[#111] font-medium text-[11px] lg:text-[12px]">{rp.price}</span>
                    <span className="text-[#999] text-[9px]">ج.م</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {renderCustomHtml('bottom_page')}
      </div>

      {/* ══════════ GALLERY MODAL ══════════ */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-[99999] bg-white flex flex-col gallery-enter"
          onClick={() => setGalleryOpen(false)}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBEBEB]"
            onClick={e => e.stopPropagation()}>
            <span className="text-[#111] text-[13px] font-semibold">{product.title}</span>
            <div className="flex items-center gap-4">
              <span className="text-[#999] text-[11px]">{galleryIdx + 1} / {gallery.length}</span>
              <button onClick={() => setGalleryOpen(false)}
                className="bg-white hover:bg-[#F5F5F5] border border-[#E0E0E0] p-2 rounded-full text-[#333] transition-all">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center bg-[#F7F7F7]"
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={e => e.stopPropagation()}>
            <img key={galleryIdx} src={getImageUrl(gallery[galleryIdx])} alt=""
              onClick={() => setIsZoomed(!isZoomed)}
              className={`max-h-[90vh] max-w-[90vw] object-contain gallery-img-enter transition-transform duration-500 ${isZoomed ? "scale-[1.5] cursor-zoom-out" : "cursor-zoom-in"}`} />
            {!isZoomed && (
              <>
                <button onClick={galleryPrev} className="absolute right-5 top-1/2 -translate-y-1/2 bg-white/90 border border-[#E0E0E0] text-[#333] p-3 rounded-full hover:border-black transition-all"><ChevronRight size={19} strokeWidth={1.5} /></button>
                <button onClick={galleryNext} className="absolute left-5 top-1/2 -translate-y-1/2 bg-white/90 border border-[#E0E0E0] text-[#333] p-3 rounded-full hover:border-black transition-all"><ChevronLeft size={19} strokeWidth={1.5} /></button>
              </>
            )}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none bg-white/90 px-3 py-1.5 rounded-full border border-[#E0E0E0]">
              {gallery.map((_, i) => <span key={i} className={`rounded-full bg-black transition-all ${galleryIdx === i ? "w-5 h-1.5 opacity-100" : "w-1.5 h-1.5 opacity-20"}`} />)}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ COLOR ZOOM MODAL ══════════ */}
      {isImageZoomModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#FAFAFA] p-4 modal-enter"
          onClick={() => setImageZoomModalOpen(false)}>
          <div className="relative w-full max-w-lg aspect-[3/4] overflow-hidden border border-[#E0E0E0]"
            onClick={e => e.stopPropagation()}>
            <img src={getImageUrl(currentColorImage())} alt="" className="w-full h-full object-cover" />
            <button onClick={() => setImageZoomModalOpen(false)}
              className="absolute top-4 left-4 bg-white/90 p-2.5 rounded-full border border-[#E0E0E0] text-[#333]"><X size={17} /></button>
            <div className="absolute bottom-4 right-4 bg-white/90 px-4 py-2 border border-[#E0E0E0]">
              <span className="text-[#111] text-[12px] font-semibold">{selectedColor}</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ DESCRIPTION MODAL ══════════ */}
      {isDescModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-none border border-[#E5E5E5] shadow-xl overflow-hidden flex flex-col max-h-[85vh] modal-enter">
            <div className="px-5 py-4 border-b border-[#EBEBEB] flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-[14px] text-[#111]">معلومات المنتج والتفاصيل</h3>
              <button onClick={() => setDescModalOpen(false)}
                className="bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] p-1.5 rounded-full text-[#666]"><X size={17} /></button>
            </div>
            <div className="p-6 overflow-y-auto ql-editor-display" dir="rtl">
              <div dangerouslySetInnerHTML={{ __html: closedDescriptionHTML }} />
            </div>
          </div>
        </div>
      )}

      <SizeChartModal isOpen={isSizeGuideOpen} onClose={() => setSizeGuideOpen(false)} product={product} />

      {/* ══════════ GLOBAL STYLES ══════════ */}
      <style jsx global>{`
        @keyframes fadeUp   { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes imgIn    { from { opacity:0.25 } to { opacity:1 } }
        @keyframes shake    { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-5px)} 40%,80%{transform:translateX(5px)} }

        .gallery-enter    { animation: fadeIn .2s ease-out }
        .gallery-img-enter{ animation: imgIn .25s cubic-bezier(.25,1,.5,1) }
        .modal-enter      { animation: fadeUp .28s ease-out }
        .size-shake       { animation: shake .4s ease-out }

        .hide-scrollbar-horizontal::-webkit-scrollbar { height:0; background:transparent }
        .hide-scrollbar-horizontal { -ms-overflow-style:none; scrollbar-width:none }

        /* Main image hover zoom — isolated */
        .main-img-wrap { isolation: isolate }
        .main-img-zoom { transition: transform .6s cubic-bezier(.25,1,.5,1) }
        .main-img-wrap:hover .main-img-zoom { transform: scale(1.018) }

        /* Fade-in overlay buttons */
        .img-fade-btn { opacity: 0; transition: opacity .25s }
        .main-img-wrap:hover .img-fade-btn { opacity: 1 }

        /* Quill editor display */
        .ql-editor-display ul { list-style-type:disc!important; padding-right:20px!important; margin-bottom:10px; color:#777 }
        .ql-editor-display ol { list-style-type:decimal!important; padding-right:20px!important; margin-bottom:10px; color:#777 }
        .ql-editor-display strong { font-weight:600; color:#333 }
        .ql-editor-display p { margin-bottom:8px; line-height:1.9; color:#777 }
        .ql-editor-display details { border:1px solid #E5E5E5!important; margin-bottom:10px; padding:0 14px!important; }
        .ql-editor-display details[open] { border-color:#BBBBBB!important }
        .ql-editor-display summary { color:#333!important; font-weight:600; font-size:12px!important; padding:12px 0!important; cursor:pointer }
        .ql-editor-display summary::-webkit-details-marker { display:none }
        .ql-editor-display div { color:#777!important; line-height:1.9; padding-bottom:12px }
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