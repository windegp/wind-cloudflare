"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getDb } from "../../../lib/firebase"; 
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore/lite';
import { usePageReady, useGlobalLoader } from "../../../context/GlobalLoaderContext";
import ProductCard from "../../../components/products/ProductCard";
import Link from "next/link";
import { ChevronDown } from '@/components/icons-extra';

export default function CategoryView({ initialSlug, initialCategoryData }) {
  const pathname = usePathname();
  const currentSlug = initialSlug; 
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();
  
  const [products, setProducts] = useState([]);
  const [categoryData, setCategoryData] = useState(initialCategoryData);
  const [loading, setLoading] = useState(true);
  const [isSeoExpanded, setIsSeoExpanded] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!currentSlug) return;
      setLoading(true);
      
      try {
        let finalProducts = [];

        // ---------------------------------------------------------
        // 1. قسم أعلى تقييماً (العموم)
        // ---------------------------------------------------------
        if (currentSlug === 'top-rated-all-time') {
          const snap = await getDocs(collection(getDb(), "Reviews"));
          const productRatings = {};
          snap.forEach(d => {
            const rev = d.data();
            if (rev.productHandle && (!rev.status || rev.status === "published")) {
              if (!productRatings[rev.productHandle]) productRatings[rev.productHandle] = { sum: 0, count: 0 };
              productRatings[rev.productHandle].sum += Number(rev.rating || 5);
              productRatings[rev.productHandle].count += 1;
            }
          });
          const topHandles = Object.keys(productRatings)
            .map(handle => ({ handle, avg: productRatings[handle].sum / productRatings[handle].count, count: productRatings[handle].count }))
            .sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 40);

          for (const item of topHandles) {
            const pSnap = await getDoc(doc(getDb(), "products", item.handle));
            if (pSnap.exists()) finalProducts.push({ id: pSnap.id, ...pSnap.data(), rating: item.avg.toFixed(1), reviewsCount: item.count });
          }
        }
        
        // ---------------------------------------------------------
        // 2. قسم الأكثر إعجاباً (العموم)
        // ---------------------------------------------------------
        else if (currentSlug === 'most-liked-all-time') {
          const snap = await getDocs(collection(getDb(), "products"));
          const fetched = [];
          snap.forEach(d => {
            const p = d.data();
            if (p.likesCount && p.likesCount > 0) fetched.push({ id: d.id, ...p });
          });
          fetched.sort((a, b) => b.likesCount - a.likesCount);
          finalProducts = fetched.slice(0, 40);
        }
        
        // ---------------------------------------------------------
        // 3. قسم أعلى تقييماً (هذا الأسبوع)
        // ---------------------------------------------------------
        else if (currentSlug === 'top-rated-weekly') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const q = query(collection(getDb(), "Reviews"), where("date", ">=", sevenDaysAgo.toISOString()));
          const snap = await getDocs(q);
          const productRatings = {};
          snap.forEach(d => {
            const rev = d.data();
            if (rev.productHandle && (!rev.status || rev.status === "published")) {
              if (!productRatings[rev.productHandle]) productRatings[rev.productHandle] = { sum: 0, count: 0 };
              productRatings[rev.productHandle].sum += Number(rev.rating || 5);
              productRatings[rev.productHandle].count += 1;
            }
          });
          const topHandles = Object.keys(productRatings)
            .map(handle => ({ handle, avg: productRatings[handle].sum / productRatings[handle].count, count: productRatings[handle].count }))
            .sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 40);

          for (const item of topHandles) {
            const pSnap = await getDoc(doc(getDb(), "products", item.handle));
            if (pSnap.exists()) finalProducts.push({ id: pSnap.id, ...pSnap.data() });
          }
        }
        
        // ---------------------------------------------------------
        // 4. قسم الأكثر إعجاباً (هذا الأسبوع)
        // ---------------------------------------------------------
        else if (currentSlug === 'most-liked-weekly') {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
          const currentWeekStr = `${d.getUTCFullYear()}-W${weekNo}`;

          const q = query(collection(getDb(), "products"), where("currentWeekId", "==", currentWeekStr));
          const snap = await getDocs(q);
          const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          fetched.sort((a, b) => (b.weeklyLikesCount || 0) - (a.weeklyLikesCount || 0));
          finalProducts = fetched.slice(0, 40);
        }
        
        // ---------------------------------------------------------
        // 5. الأقسام العادية (الوضع الطبيعي للـ CategoryView)
        // ---------------------------------------------------------
        else {
          const typeVariants = [currentSlug, currentSlug.toLowerCase(), currentSlug.charAt(0).toUpperCase() + currentSlug.slice(1).toLowerCase(), categoryData.name];
          const q1 = query(collection(getDb(), "products"), where("categories", "array-contains-any", [currentSlug, `/${currentSlug}`]), limit(40));
          const q2 = query(collection(getDb(), "products"), where("type", "in", typeVariants), limit(40));

          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
          const productsMap = new Map();
          snap1.forEach(doc => productsMap.set(doc.id, { id: doc.id, ...doc.data() }));
          snap2.forEach(doc => productsMap.set(doc.id, { id: doc.id, ...doc.data() }));
          finalProducts = Array.from(productsMap.values());
        }

        setProducts(finalProducts);
        setLoading(false);
      } catch (error) {
        console.error("WIND Fetch Error:", error);
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentSlug, categoryData.name]);

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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {products.map((product) => (
              <ProductCard key={product.id} {...product} sourceCategory={currentSlug} /> 
            ))}
          </div>
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