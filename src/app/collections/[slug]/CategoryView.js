"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getDb } from "../../../lib/firebase";
import { collection, query, where, getDocs, limit, orderBy, startAfter } from 'firebase/firestore/lite';
import { usePageReady, useGlobalLoader } from "../../../context/GlobalLoaderContext";
import ProductCard from "../../../components/products/ProductCard";
import { usePaginatedProducts } from "@/hooks/useFirestore";
import Link from "next/link";
import { ChevronDown, Layout } from '@/components/icons-extra';
import { Filter, Grid } from '@/components/icons';

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: 'featured', label: 'المميز' },
  { value: 'newest', label: 'الأحدث' },
  { value: 'best-selling', label: 'الأكثر مبيعاً' },
  { value: 'price-asc', label: 'السعر: من الأقل إلى الأعلى' },
  { value: 'price-desc', label: 'السعر: من الأعلى إلى الأقل' },
];

export default function CategoryView({ initialSlug, initialCategoryData }) {
  const pathname = usePathname();
  const currentSlug = initialSlug;
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();

  const [products, setProducts] = useState([]);
  const [categoryData, setCategoryData] = useState(initialCategoryData);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isSeoExpanded, setIsSeoExpanded] = useState(false);

  // Toolbar state
  const [sortBy, setSortBy] = useState('featured');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [gridColumns, setGridColumns] = useState(4); // 3 or 4 columns

  const { data: swrData, error, isValidating } = usePaginatedProducts(currentSlug, PAGE_SIZE, null);

  useEffect(() => {
    if (swrData && !lastDoc) {
      setProducts(swrData.products);
      setLastDoc(swrData.lastDoc);
      setHasMore(swrData.products.length === PAGE_SIZE);
      setLoading(false);
    }
  }, [swrData]);

  // Close sort dropdown on outside click
  useEffect(() => {
    const handleClickOutside = () => setShowSortDropdown(false);
    if (showSortDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSortDropdown]);

  const fetchMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const db = getDb();
      let baseQ;

      if (currentSlug === 'top-rated-all-time' || currentSlug === 'top-rated-weekly') {
        baseQ = query(collection(db, "products"), orderBy("rating", "desc"));
      } else if (currentSlug === 'most-liked-all-time') {
        baseQ = query(collection(db, "products"), orderBy("likesCount", "desc"));
      } else if (currentSlug === 'most-liked-weekly') {
        const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const weekStr = `${d.getUTCFullYear()}-W${Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`;
        baseQ = query(collection(db, "products"), where("currentWeekId", "==", weekStr), orderBy("weeklyLikesCount", "desc"));
      } else {
        baseQ = query(
          collection(db, "products"),
          where("categories", "array-contains-any", [currentSlug, `/${currentSlug}`])
        );
      }

      const q = query(baseQ, startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      let newItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (newItems.length > 0) {
        try {
          const handles = newItems.map(p => p.handle || p.id).filter(Boolean);
          if (handles.length > 0) {
            const statsRes = await fetch(`/api/product-stats-batch?handles=${encodeURIComponent(handles.join(','))}`);
            if (statsRes.ok) {
              const { stats } = await statsRes.json();
              newItems = newItems.map(p => {
                const handle = p.handle || p.id;
                const stat = stats[handle];
                if (stat) {
                  return { ...p, reviewsCount: stat.count, rating: stat.rating };
                }
                return p;
              });
            }
          }
        } catch (e) {
          console.error("WIND: Batch stats fetch failed for more products", e);
        }
      }

      setProducts(prev => [...prev, ...newItems]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Fetch More Error:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!loading && (products.length > 0 || categoryData.name)) {
      signalPageReady();
    }
  }, [loading, products, categoryData.name, pathname, signalPageReady]);

  const hasBanner = categoryData.image || categoryData.bannerImage;
  const desktopGridCols = gridColumns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  const showToolbar = !loading && products.length > 0;

  return (
    <main className="min-h-screen bg-white pt-16 pb-12" dir="rtl">
      <div className="max-w-[1440px] mx-auto">

        {/* ── HERO BANNER ── */}
        {hasBanner ? (
          <div className="relative w-full bg-[#FAF8F3] overflow-hidden">
            <div className="relative w-full aspect-[3/1] md:aspect-[4/1] max-h-[400px]">
              <img
                src={categoryData.bannerImage || categoryData.image}
                alt={categoryData.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
              <div className="absolute bottom-6 md:bottom-10 right-6 md:right-12 left-6 md:left-12">
                <h1 className="text-white text-2xl md:text-4xl lg:text-5xl font-black mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
                  {categoryData.name}
                </h1>
                {categoryData.description && (
                  <p className="text-white/80 text-sm md:text-base max-w-xl font-tajawal leading-relaxed">
                    {categoryData.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Fallback: Text-only header when no banner image */
          <div className="px-4 md:px-8 pt-12 pb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="h-px w-8 bg-[#1A1A1A]/30" />
              <span className="text-[#888] text-[11px] font-bold tracking-[0.3em] uppercase font-tajawal">
                {categoryData.subtitle || "WIND COLLECTION"}
              </span>
              <span className="h-px w-8 bg-[#1A1A1A]/30" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-[#1A1A1A] mb-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {categoryData.name}
            </h1>
            {categoryData.description && (
              <p className="text-[#888] max-w-2xl mx-auto font-tajawal text-sm md:text-base leading-relaxed">
                {categoryData.description}
              </p>
            )}
          </div>
        )}

        {/* ── BREADCRUMBS ── */}
        <div className="px-4 md:px-8 mt-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-[12px] text-[#888] font-tajawal">
            <Link href="/" className="hover:text-[#1A1A1A] transition-colors">الرئيسية</Link>
            <span className="text-[#CCC]">/</span>
            <span className="text-[#1A1A1A] font-semibold">{categoryData.name}</span>
          </div>
        </div>

        {/* ── TOOLBAR (Sort + Grid View + Count) ── */}
        {showToolbar && (
          <div className="px-4 md:px-8 mb-8">
            <div className="flex items-center justify-between border-t border-b border-[#EAEAEA] py-3">
              {/* Right side: Filter + Sort */}
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-2 text-[#1A1A1A] text-[13px] font-bold font-tajawal hover:text-[#888] transition-colors">
                  <Filter size={16} strokeWidth={1.5} />
                  <span>تصفية</span>
                </button>
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    className="flex items-center gap-2 text-[#1A1A1A] text-[13px] font-bold font-tajawal hover:text-[#888] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16l-4 4-4-4" /><path d="M17 20V4" /><path d="M3 8l4-4 4 4" /><path d="M7 4v16" />
                    </svg>
                    <span>{SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'ترتيب'}</span>
                    <ChevronDown size={14} strokeWidth={2} className={`transition-transform duration-200 ${showSortDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showSortDropdown && (
                    <div className="absolute top-full right-0 mt-1.5 bg-white border border-[#EAEAEA] rounded-xl shadow-lg z-30 min-w-[220px] overflow-hidden">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSortBy(option.value); setShowSortDropdown(false); }}
                          className={`w-full text-right px-4 py-3 text-[13px] font-tajawal transition-colors hover:bg-[#FAF8F3] ${
                            sortBy === option.value ? 'text-[#1A1A1A] font-bold bg-[#FAF8F3]' : 'text-[#666] font-medium'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Left side: Product count + Grid view */}
              <div className="flex items-center gap-4">
                <span className="text-[#888] text-[12px] font-tajawal">
                  {products.length} منتج
                </span>
                <div className="flex items-center gap-1.5 border-r border-[#EAEAEA] pr-4">
                  <button
                    onClick={() => setGridColumns(4)}
                    className={`p-1.5 rounded-md transition-colors ${gridColumns === 4 ? 'bg-[#1A1A1A] text-white' : 'text-[#888] hover:text-[#1A1A1A] hover:bg-[#F5F5F5]'}`}
                    aria-label="عرض 4 أعمدة"
                  >
                    <Grid size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => setGridColumns(3)}
                    className={`p-1.5 rounded-md transition-colors ${gridColumns === 3 ? 'bg-[#1A1A1A] text-white' : 'text-[#888] hover:text-[#1A1A1A] hover:bg-[#F5F5F5]'}`}
                    aria-label="عرض 3 أعمدة"
                  >
                    <Layout size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCT GRID ── */}
        <div className="px-4 md:px-8">
          {!loading && products.length > 0 ? (
            <>
              <div className={`grid grid-cols-2 md:grid-cols-3 ${desktopGridCols} gap-4 md:gap-6 lg:gap-7`}>
                {products.map((product) => (
                  <ProductCard key={product.id} {...product} sourceCategory={currentSlug} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-16 flex justify-center">
                  <button
                    onClick={fetchMore}
                    disabled={loadingMore}
                    className={`group flex flex-col items-center gap-3 transition-all duration-300 ${loadingMore ? 'opacity-50 cursor-wait' : 'hover:translate-y-1'}`}
                  >
                    <span className="text-[10px] md:text-[11px] font-bold text-[#1A1A1A] tracking-[0.4em] uppercase font-cairo">
                      {loadingMore ? 'جاري التحميل' : 'اكتشف المزيد'}
                    </span>
                    <div className="relative flex items-center justify-center w-12 h-12">
                      {loadingMore && (
                        <div className="absolute inset-0 border-2 border-[#1A1A1A]/10 border-t-[#1A1A1A] rounded-full animate-spin"></div>
                      )}
                      <ChevronDown
                        size={28}
                        strokeWidth={1.5}
                        className={`text-[#1A1A1A] transition-transform duration-500 ${loadingMore ? 'scale-75' : 'group-hover:translate-y-1'}`}
                      />
                    </div>
                  </button>
                </div>
              )}
            </>
          ) : !loading ? (
            <div className="text-center py-24 md:py-32 border border-[#EAEAEA] rounded-3xl bg-white shadow-sm max-w-3xl mx-auto">
              <p className="text-gray-500 mb-8 text-lg font-bold font-cairo">
                لا توجد قطع متوفرة في &ldquo;{categoryData.name}&rdquo; حالياً.
              </p>
              <Link
                href="/"
                className="bg-[#1A1A1A] text-white px-10 py-3.5 font-bold text-sm hover:bg-black transition-all duration-300 rounded-full shadow-md active:scale-95 inline-block font-cairo"
              >
                اكتشف باقي المجموعات
              </Link>
            </div>
          ) : null}
        </div>

        {/* ── SEO BOTTOM DESCRIPTION ── */}
        {categoryData.bottomDescription && products.length > 0 && (
          <div className="mt-20 pt-10 border-t border-[#EAEAEA] max-w-4xl mx-auto px-4 md:px-8">
            <div className="relative">
              <div className={`overflow-hidden transition-all duration-700 ease-in-out ${isSeoExpanded ? 'max-h-[2000px]' : 'max-h-24'}`}>
                <div className="text-[#666] text-sm md:text-base leading-loose whitespace-pre-wrap text-justify font-tajawal">
                  {categoryData.bottomDescription}
                </div>
              </div>
              {!isSeoExpanded && (
                <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
              )}
            </div>
            <button
              onClick={() => setIsSeoExpanded(!isSeoExpanded)}
              className="mt-6 mx-auto flex items-center gap-2 text-[#1A1A1A] font-bold text-xs md:text-sm uppercase tracking-widest hover:text-[#888] transition-colors bg-white border border-[#EAEAEA] px-6 py-2.5 rounded-full shadow-sm font-cairo"
            >
              {isSeoExpanded ? 'إخفاء التفاصيل' : 'اقرأ المزيد'}
              <ChevronDown className={`transition-transform duration-300 ${isSeoExpanded ? 'rotate-180' : ''}`} size={16} />
            </button>
          </div>
        )}

      </div>
    </main>
  );
}