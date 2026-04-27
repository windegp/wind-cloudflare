"use client";
import useSWR from 'swr';
import { getDb } from '@/lib/firebase';
import { 
  collection, getDocs, doc, getDoc, query, limit, 
  orderBy, where, startAfter, documentId
} from 'firebase/firestore/lite';

// =========================================================
// 1. Fetchers (المصانع الخلفية اللي بتكلم الفايربيز)
// =========================================================

// مصنع جلب مستند واحد (مثل الإعدادات أو منتج معين)
const fetchDoc = async (path) => {
  const db = getDb();
  const snap = await getDoc(doc(db, ...path.split('/')));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// مصنع جلب القوائم (مثل المنتجات، العملاء) مع حماية الـ Limit
const fetchCollection = async ([path, limitCount, orderField, orderDir]) => {
  const db = getDb();
  let q = query(collection(db, path));
  
  if (orderField) {
    q = query(q, orderBy(orderField, orderDir || 'asc'));
  }
  // 🛡️ حماية إجبارية: لو محدش بعت Limit، الفايربيز هيسحب 20 بس كحد أقصى عشان الكوتا
  q = query(q, limit(limitCount || 20)); 

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// مصنع جلب تقييمات الصفحة الرئيسية (Legendary Batch Fetching)
const fetchHomepageReviews = async () => {
  try {
    // 1. جرب الـ KV Cache أولاً
    const res = await fetch('/api/homepage-reviews');
    if (res.ok) {
      const data = await res.json();
      if (data.reviews) return data;
    }
  } catch {}

  // 2. Fallback: Firebase مباشرة
  try {
    const db = getDb();
    const qReviews = query(collection(db, "Reviews"), where("status", "==", "published"), orderBy("date", "desc"), limit(10));
    const snapReviews = await getDocs(qReviews);
    const fetchedReviews = snapReviews.docs.map(d => ({ id: d.id, ...d.data() }));
    if (fetchedReviews.length === 0) return { reviews: [], products: {} };
    
    const uniqueHandles = [...new Set(fetchedReviews.map(r => r.productHandle).filter(Boolean))].slice(0, 10);
    const productsMap = {};

    if (uniqueHandles.length > 0) {
      // استدعاء واحد فقط لجميع المنتجات المطلوبة
      const qProducts = query(collection(db, "products"), where(documentId(), "in", uniqueHandles));
      const snapProducts = await getDocs(qProducts);
      
      snapProducts.docs.forEach(doc => {
        const pData = doc.data();
        const h = pData.handle || doc.id;
        productsMap[h] = { ...pData, id: doc.id, mainImage: pData.images?.[0] || pData.image || "" };
      });
      
      // لو لسه في منتجات ناقصة، نبحث عنها مرة واحدة فقط
      const missingHandles = uniqueHandles.filter(h => !productsMap[h]);
      if (missingHandles.length > 0) {
        const qByHandle = query(collection(db, "products"), where("handle", "in", missingHandles));
        const snapByHandle = await getDocs(qByHandle);
        snapByHandle.docs.forEach(doc => {
          const pData = doc.data();
          const h = pData.handle || doc.id;
          productsMap[h] = { ...pData, id: doc.id, mainImage: pData.images?.[0] || pData.image || "" };
        });
      }
    }

    return { reviews: fetchedReviews, products: productsMap };
  } catch (error) {
    console.error("WIND Error fetching homepage reviews:", error);
    return { reviews: [], products: {} };
  }
};

// مصنع جلب منتجات الأقسام الأربعة (Legendary Batch Fetching - قراءة واحدة فقط للمنتجات)
const fetchHomepageProductsSections = async () => {
  const db = getDb();
  
  const getCurrentWeekString = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };
  const currentWeek = getCurrentWeekString();

  try {
    // Legendary Batch Fetching: جمع المعرفات فقط أولاً
    const [mostLikedIdsSnap, weeklyLikedIdsSnap, topStatsIdsSnap, recentReviewsSnap] = await Promise.all([
      // 1. جمع معرفات المنتجات الأعلى إعجاباً (كل الأوقات) - معرفات فقط
      getDocs(query(collection(db, "products"), orderBy("likesCount", "desc"), limit(5))),
      // 2. جمع معرفات المنتجات الأعلى إعجاباً (أسبوعياً) - معرفات فقط
      getDocs(query(collection(db, "products"), where("currentWeekId", "==", currentWeek), orderBy("weeklyLikesCount", "desc"), limit(5))),
      // 3. جمع معرفات ProductStats - معرفات فقط
      getDocs(query(collection(db, "ProductStats"), orderBy("totalCount", "desc"), limit(5))),
      // 4. جمع التقييمات الأسبوعية للتحليل
      getDocs(query(collection(db, "Reviews"), where("date", ">=", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()), limit(50)))
    ]);

    // جمع كل المعرفات المطلوبة في مصفوفة واحدة
    const mostLikedIds = mostLikedIdsSnap.docs.map(d => d.id);
    const weeklyLikedIds = weeklyLikedIdsSnap.docs.map(d => d.id);
    const topAllTimeHandles = topStatsIdsSnap.docs.map(d => d.id);
    
    // حساب التقييمات الأسبوعية من البيانات المحملة
    const weeklyRatings = {};
    recentReviewsSnap.docs.forEach(d => {
      const rev = d.data();
      if (rev.productHandle && rev.status === "published") {
        if (!weeklyRatings[rev.productHandle]) weeklyRatings[rev.productHandle] = { sum: 0, count: 0 };
        weeklyRatings[rev.productHandle].sum += Number(rev.rating || 5);
        weeklyRatings[rev.productHandle].count += 1;
      }
    });

    const topWeeklyHandles = Object.keys(weeklyRatings)
      .map(h => ({ handle: h, avg: weeklyRatings[h].sum / weeklyRatings[h].count, count: weeklyRatings[h].count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 5);

    // Legendary Batch Fetching: استدعاء واحد فقط لجميع المنتجات
    const allProductIds = [
      ...mostLikedIds,
      ...weeklyLikedIds,
      ...topAllTimeHandles,
      ...topWeeklyHandles.map(t => t.handle)
    ].filter((id, i, arr) => arr.indexOf(id) === i); // إزالة التكرارات

    const productsMap = {};
    if (allProductIds.length > 0) {
      // استدعاء واحد فقط لجميع المنتجات المطلوبة
      const allProductsSnap = await getDocs(query(collection(db, "products"), where(documentId(), "in", allProductIds)));
      allProductsSnap.docs.forEach(doc => {
        const data = doc.data();
        const handle = data.handle || doc.id;
        productsMap[doc.id] = { id: doc.id, ...data, handle };
        productsMap[handle] = { id: doc.id, ...data, handle }; // للوصول بالمعرف أو بالـ handle
      });
    }

    // بناء النتائج النهائية من الخريطة المحملة
    const mostLikedAllTime = mostLikedIds.map(id => productsMap[id]).filter(Boolean);
    const mostLikedWeeklyRaw = weeklyLikedIds.map(id => productsMap[id]).filter(Boolean);
    
    // بناء المنتجات الأعلى تقييماً (كل الأوقات)
    const topRatedAllTime = topAllTimeHandles.map(handle => {
      const product = productsMap[handle];
      if (!product) return null;
      const stats = topStatsIdsSnap.docs.find(s => s.id === handle)?.data();
      const avg = stats?.totalCount ? (stats.totalRatingSum / stats.totalCount).toFixed(1) : "5.0";
      return { ...product, allTimeAvg: avg, allTimeCount: stats?.totalCount || 0 };
    }).filter(Boolean);

    // بناء المنتجات الأعلى تقييماً (أسبوعياً)
    const topRatedWeeklyRaw = topWeeklyHandles.map(t => {
      const product = productsMap[t.handle];
      if (!product) return null;
      return { ...product, weeklyAvg: t.avg.toFixed(1) || "5.0", weeklyCount: t.count || 0 };
    }).filter(Boolean);

    // الحفاظ على نظام الاستكمال الذكي (Smart Fill)
    let finalTopRatedWeekly = [...topRatedWeeklyRaw];
    if (finalTopRatedWeekly.length < 5) {
      const existingIds = new Set(finalTopRatedWeekly.map(p => p.id));
      const fillers = topRatedAllTime
        .filter(p => !existingIds.has(p.id))
        .slice(0, 5 - finalTopRatedWeekly.length)
        .map(p => ({ ...p, weeklyAvg: p.allTimeAvg, weeklyCount: p.allTimeCount }));
      finalTopRatedWeekly = [...finalTopRatedWeekly, ...fillers];
    }

    let finalMostLikedWeekly = [...mostLikedWeeklyRaw];
    if (finalMostLikedWeekly.length < 5) {
      const existingIds = new Set(finalMostLikedWeekly.map(p => p.id));
      const fillers = mostLikedAllTime.filter(p => !existingIds.has(p.id)).slice(0, 5 - finalMostLikedWeekly.length);
      finalMostLikedWeekly = [...finalMostLikedWeekly, ...fillers];
    }

    return { topRatedWeekly: finalTopRatedWeekly, mostLikedWeekly: finalMostLikedWeekly, topRatedAllTime, mostLikedAllTime };
  } catch (error) {
    console.error("Error fetching homepage products sections:", error);
    return { topRatedWeekly: [], mostLikedWeekly: [], topRatedAllTime: [], mostLikedAllTime: [] };
  }
};

// =========================================================
// 2. Custom Hooks (الخطافات الجاهزة للاستخدام في أي صفحة)
// =========================================================

// هوك الإعدادات (مقفل الكوتا بالكامل)
export const useSiteSettings = () => {
  return useSWR('settings/siteSettings', fetchDoc, {
    dedupingInterval: 300000, // 5 دقائق كاش (mutate() بيجبر الريفريش فوراً)
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
};

// هوك قائمة المنتجات (بنمررله العدد المطلوب)
export const useProductsList = (limitCount = 20) => {
  return useSWR(['products', limitCount, 'title', 'asc'], fetchCollection);
};

// هوك تقييمات الصفحة الرئيسية (مقفل الكوتا بالكامل)
export const useHomepageReviews = () => {
  return useSWR('homepage-reviews', fetchHomepageReviews, {
    dedupingInterval: 300000, // 5 دقائق كاش (mutate() بيجبر الريفريش فوراً)
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
};

// هوك الأقسام الأربعة (يقرأ من KV Cache لحماية الكوتا)
export const useHomepageProductsSections = () => {
  const fetcherWithCache = async () => {
    try {
      // محاولة القراءة من الـ KV API أولاً
      const res = await fetch('/api/homepage');
      if (res.ok) {
        const result = await res.json();
        if (result.success) return result.data;
      }
    } catch (e) {
      console.error("WIND Cache Fetch Error:", e);
    }
    // Fallback: لو الكاش مش متاح، يروح لفايربيز مباشرة
    return fetchHomepageProductsSections();
  };

  return useSWR('homepage-products-sections', fetcherWithCache, {
    revalidateOnFocus: false, // يمنع سحب الداتا لما الزائر يروح لتاب تاني ويرجع
    dedupingInterval: 300000   // 5 دقايق كاش (mutate() بيجبر الريفريش فوراً)
  });
};

// هوك جلب منتجات القسم مع Pagination لدعم التصفح اللانهائي
export const usePaginatedProducts = (categorySlug, limitCount = 10, lastVisibleDoc = null) => {
  const fetcher = async () => {
    const db = getDb();
    const productsRef = collection(db, "products");
    
    // بناء الكويري الأساسي للقسم
    let q = query(
  productsRef, 
  where("categories", "array-contains-any", [categorySlug, `/${categorySlug}`]), // السلاش للقديم وبدونه للجديد
  orderBy("createdAt", "desc"), 
  limit(limitCount)
);

    // إذا كان هناك وثيقة سابقة، ابدأ التحميل من بعدها
    if (lastVisibleDoc) {
      q = query(q, startAfter(lastVisibleDoc));
    }

    const snap = await getDocs(q);
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // 🔥 Batch fetch all stats in one request to eliminate ProductCard request storm
    if (products.length > 0) {
      try {
        const handles = products.map(p => p.handle || p.id).filter(Boolean);
        if (handles.length > 0) {
          const statsRes = await fetch(`/api/product-stats-batch?handles=${encodeURIComponent(handles.join(','))}`);
          if (statsRes.ok) {
            const { stats } = await statsRes.json();
            // Enrich products with stats
            products.forEach(p => {
              const handle = p.handle || p.id;
              const stat = stats[handle];
              if (stat) {
                p.reviewsCount = stat.count;
                p.rating = stat.rating;
              }
            });
          }
        }
      } catch (e) {
        console.error("WIND: Batch stats fetch failed", e);
        // Continue without stats - ProductCard will fallback to individual fetch if needed
      }
    }
    
    return {
      products,
      lastDoc: snap.docs[snap.docs.length - 1] || null 
    };
  };

  // مفتاح SWR فريد يعتمد على القسم ومكان التوقف (lastVisibleDoc)
  return useSWR(`paginated-products-${categorySlug}-${lastVisibleDoc?.id || 'start'}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // كاش 5 دقائق
  });
};
// 🚀 هوك جلب تفاصيل منتج واحد (SWR)
export const useProduct = (id) => {
  const fetcherWithCache = async () => {
    if (!id) return null;
    try {
      // جيب من KV Cache عبر API
      const res = await fetch(`/api/product/${id}`);
      if (res.ok) {
        const result = await res.json();
        if (result?.id) return result;
      }
    } catch (e) {
      console.error("WIND Product Cache Error:", e);
    }
    // Fallback لفايربيز
    const db = getDb();
    const snap = await getDoc(doc(db, "products", id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  };
  return useSWR(id ? `product-${id}` : null, fetcherWithCache, {
    revalidateOnFocus: false,
    dedupingInterval: 300000 // 5 دقائق كاش
  });
};

// 🚀 هوك جلب المنتجات ذات الصلة (النسخة الكاملة والمطابقة لمنطقك الأصلي)
export const useRelatedProducts = (product) => {
  const fetcher = async () => {
    if (!product?.id) return [];
    const db = getDb();
    const productsRef = collection(db, "products");
    let related = [];

    // 1. جلب عن طريق الـ Metafields (الـ Handles اليدوية)
    const pageHandlesStr = product.metafields?.pageCrossSellHandles;
    if (pageHandlesStr && pageHandlesStr.trim() !== "") {
      const handlesArray = pageHandlesStr.split(',').map(h => h.trim()).filter(Boolean);
      const docsSnaps = await Promise.all(handlesArray.map(h => getDoc(doc(db, "products", h))));
      docsSnaps.forEach(ds => {
        if (ds.exists() && ds.id !== product.id) related.push({ id: ds.id, ...ds.data() });
      });
    } 

    // 2. لو مفيش، جلب عن طريق الـ Collections (Array-contains)
    if (related.length === 0) {
      // 🔥 التعديل هنا: خليناه يقرأ من collections
      const fbRefValue = (Array.isArray(product.collections) && product.collections[0]) || product.category;
      if (fbRefValue) {
        // 🔥 التعديل هنا: البحث في حقل collections
        const qCat = query(productsRef, where("collections", "array-contains", fbRefValue), limit(6));
        const snap = await getDocs(qCat);
        snap.forEach(d => {
          if (d.id !== product.id) related.push({ id: d.id, ...d.data() });
        });
      }
    }

    // 3. لو لسه مفيش، جلب عشوائي (Fallback)
    if (related.length === 0) {
      const qFallback = query(productsRef, limit(6));
      const snapFallback = await getDocs(qFallback);
      snapFallback.forEach(d => {
        if (d.id !== product.id) related.push({ id: d.id, ...d.data() });
      });
    }

    return Array.from(new Map(related.map(item => [item.id, item])).values()).slice(0, 5);
  };

  return useSWR(product?.id ? `related-${product.id}` : null, fetcher, {
    dedupingInterval: 300000, // 5 دقائق كاش
    revalidateOnFocus: false
  });
};
// هوك جلب تقييمات المنتج (3 تقييمات فقط في المرة)

// هوك جلب تقييمات المنتج (3 تقييمات فقط في المرة)

// النسخة النهائية المفلترة والمحمية من الكوتا
export const usePaginatedReviews = (productHandle, lastVisibleDoc = null, filter = "all") => {
  const fetcher = async () => {
    if (!productHandle) return { reviews: [], lastDoc: null };
    const db = getDb();
    let q = query(
      collection(db, "Reviews"),
      where("productHandle", "==", productHandle),
      where("status", "==", "published"),
      orderBy("date", "desc")
    );

    // تطبيق فلترة (أ) من الداتابيز مباشرة
    if (filter === "images") q = query(q, where("hasImages", "==", true));
    if (filter === "5star") q = query(q, where("rating", "==", 5));

    q = query(q, limit(3));

    if (lastVisibleDoc) {
      q = query(q, startAfter(lastVisibleDoc));
    }

    const snap = await getDocs(q);
    return {
      reviews: snap.docs.map(d => ({ id: d.id, ...d.data() })),
      lastDoc: snap.docs[snap.docs.length - 1] || null
    };
  };

  return useSWR(productHandle ? `reviews-${productHandle}-${filter}-${lastVisibleDoc?.id || 'start'}` : null, fetcher, {
    dedupingInterval: 300000, // 5 دقائق كاش
    revalidateOnFocus: false
  });
};