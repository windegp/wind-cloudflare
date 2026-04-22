"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getDb } from "../../../lib/firebase"; 
import { collection, query, where, getDocs, limit, orderBy, startAfter } from 'firebase/firestore/lite';
import { usePageReady, useGlobalLoader } from "../../../context/GlobalLoaderContext";
import ProductCard from "../../../components/products/ProductCard";
// استدعاء الهوك الجديد لتقليل استهلاك الكوتا
import { usePaginatedProducts } from "@/hooks/useFirestore";
import Link from "next/link";
import { ChevronDown } from '@/components/icons-extra';

// 🔥 تحديد عدد المنتجات في كل سحبة (لحماية الكوتا)
const PAGE_SIZE = 12;

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

  // استخدام SWR لجلب البيانات أول مرة وتكييشها
  const { data: swrData, error, isValidating } = usePaginatedProducts(currentSlug, PAGE_SIZE, null);

  // تحديث المنتجات عند استجابة SWR (لأول مرة)
  useEffect(() => {
    if (swrData && !lastDoc) {
      setProducts(swrData.products);
      setLastDoc(swrData.lastDoc);
      setHasMore(swrData.products.length === PAGE_SIZE);
      setLoading(false);
    }
  }, [swrData]);

  // دالة تحميل المزيد (تستخدم Firebase Lite مباشرة لتوفير الكوتا في التصفح العميق)
  const fetchMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const db = getDb();
      let baseQ;
      
      // منطق الكويري الخاص بك (محفوظ 100%)
      if (currentSlug === 'top-rated-all-time' || currentSlug === 'top-rated-weekly') {
        baseQ = query(collection(db, "products"), orderBy("rating", "desc"));
      } else if (currentSlug === 'most-liked-all-time') {
        baseQ = query(collection(db, "products"), orderBy("likesCount", "desc"));
      } else if (currentSlug === 'most-liked-weekly') {
        const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const weekStr = `${d.getUTCFullYear()}-W${Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`;
        baseQ = query(collection(db, "products"), where("currentWeekId", "==", weekStr), orderBy("weeklyLikesCount", "desc"));
      } else {
        baseQ = query(collection(db, "products"), where("collections", "array-contains", currentSlug));
      }

      const q = query(baseQ, startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const newItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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

  return (
    <main className="min-h-screen bg-[#FAF9F6] pt-24 pb-12" dir="rtl">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">
        
        {/* التاجات الذكية (Breadcrumbs) مطابقة للثيم الفاتح */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] md:text-[13px] font-medium text-gray-500 mb-8" style={{fontFamily:"Cairo,sans-serif"}}>
          <span className="border border-gray-300 bg-white shadow-sm rounded-full px-3 py-1 text-gray-600">
            ويند-{new Date().getFullYear().toString().slice(-2)}
          </span>
          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
          <span className="text-gray-600">منتجات ويند</span>
          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
          <span className="capitalize text-[#E6AE00] font-bold">{categoryData.name}</span>
        </div>

        {/* Header */}
        <div className="mb-16 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-3xl md:text-5xl font-black text-[#1A1A1A] mb-4 uppercase tracking-tighter" style={{fontFamily:"Cairo,sans-serif"}}>
            {categoryData.name}
          </h1>
          <div className="flex justify-center items-center gap-4">
            <span className="h-[2px] w-12 bg-gradient-to-l from-[#E6AE00] to-transparent rounded-full"></span>
            <p className="text-[#E6AE00] font-bold tracking-[0.3em] text-[10px] md:text-xs uppercase">
              {categoryData.subtitle || "WIND ESSENTIALS"}
            </p>
            <span className="h-[2px] w-12 bg-gradient-to-r from-[#E6AE00] to-transparent rounded-full"></span>
          </div>
          {categoryData.description && (
            <p className="mt-6 text-gray-600 max-w-2xl mx-auto font-medium leading-relaxed font-tajawal">
              {categoryData.description}
            </p>
          )}
        </div>

        {/* النتائج (عرض الكروت) */}
        {!loading && products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
              {products.map((product) => (
                <ProductCard key={product.id} {...product} sourceCategory={currentSlug} /> 
              ))}
            </div>

            {/* 🔥 زر تحميل المزيد - أيقونة سهم أسود فخم وانسيابي */}
            {hasMore && (
              <div className="mt-20 flex justify-center">
                <button
                  onClick={fetchMore}
                  disabled={loadingMore}
                  className={`group flex flex-col items-center gap-3 transition-all duration-300 ${loadingMore ? 'opacity-50 cursor-wait' : 'hover:translate-y-1'}`}
                >
                  <span className="text-[10px] md:text-[11px] font-bold text-[#1A1A1A] tracking-[0.4em] uppercase" style={{fontFamily:"Cairo,sans-serif"}}>
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
          /* حالة لو مفيش منتجات (Empty State) بالستايل الأبيض */
          <div className="text-center py-24 md:py-32 border border-[#EAEAEA] rounded-3xl bg-white shadow-sm max-w-3xl mx-auto">
            <p className="text-gray-500 mb-8 text-lg font-bold" style={{fontFamily:"Cairo,sans-serif"}}>
              لا توجد قطع متوفرة في "{categoryData.name}" حالياً.
            </p>
            <Link 
              href="/" 
              className="bg-[#1A1A1A] text-white px-10 py-3.5 font-bold text-sm hover:bg-black transition-all duration-300 rounded-full shadow-md active:scale-95 inline-block"
              style={{fontFamily:"Cairo,sans-serif"}}
            >
              اكتشف باقي المجموعات
            </Link>
          </div>
        ) : null}

        {/* سكشن الـ SEO السفلي (اقرأ المزيد) */}
        {categoryData.bottomDescription && products.length > 0 && (
          <div className="mt-24 pt-10 border-t border-[#EAEAEA] max-w-4xl mx-auto">
            <div className="relative">
              <div className={`overflow-hidden transition-all duration-700 ease-in-out ${isSeoExpanded ? 'max-h-[2000px]' : 'max-h-24'}`}>
                <div className="text-gray-600 text-sm md:text-base leading-loose whitespace-pre-wrap px-4 text-justify font-tajawal">
                  {categoryData.bottomDescription}
                </div>
              </div>
              
              {/* التدرج الأبيض/الكريمي اللي بيخفي النص */}
              {!isSeoExpanded && (
                <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-[#FAF9F6] to-transparent pointer-events-none"></div>
              )}
            </div>

            <button 
              onClick={() => setIsSeoExpanded(!isSeoExpanded)} 
              className="mt-6 mx-auto flex items-center gap-2 text-[#1A1A1A] font-bold text-xs md:text-sm uppercase tracking-widest hover:text-[#E6AE00] transition-colors bg-white border border-[#EAEAEA] px-6 py-2.5 rounded-full shadow-sm"
              style={{fontFamily:"Cairo,sans-serif"}}
            >
              {isSeoExpanded ? 'إخفاء التفاصيل' : 'اقرأ المزيد'}
              <ChevronDown className={`transition-transform duration-300 ${isSeoExpanded ? 'rotate-180' : ''}`} size={16}/>
            </button>
          </div>
        )}

      </div>
    </main>
  );
}