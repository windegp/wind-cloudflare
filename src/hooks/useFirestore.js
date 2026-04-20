"use client";
import useSWR from 'swr';
import { getDb } from '@/lib/firebase';
import { 
  collection, getDocs, doc, getDoc, query, limit, 
  orderBy, where, startAfter, documentId
} from 'firebase/firestore/lite';

// =========================================================
// 1. Fetchers (المصانع الخلفية اللي بتكلم الفايربيز أو الـ KV)
// =========================================================

const fetchDoc = async (path) => {
  const db = getDb();
  const snap = await getDoc(doc(db, ...path.split('/')));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

const fetchCollection = async ([path, limitCount, orderField, orderDir]) => {
  const db = getDb();
  let q = query(collection(db, path));
  if (orderField) q = query(q, orderBy(orderField, orderDir || 'asc'));
  q = query(q, limit(limitCount || 20)); 
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// 🔥 تعديل: محاولة الجلب من KV Cache أولاً لتقييمات الصفحة الرئيسية
const fetchHomepageReviews = async () => {
  try {
    const res = await fetch('/api/homepage-reviews');
    if (res.ok) {
      const data = await res.json();
      if (data && data.reviews) return data;
    }
  } catch (error) {
    // صمت تام، لو الـ API فشل هنكمل للفايربيز
  }

  // 🛡️ Fallback: الكود الأصلي (Legendary Batch Fetching)
  try {
    const db = getDb();
    const qReviews = query(collection(db, "Reviews"), where("status", "==", "published"), orderBy("date", "desc"), limit(10));
    const snapReviews = await getDocs(qReviews);
    const fetchedReviews = snapReviews.docs.map(d => ({ id: d.id, ...d.data() }));

    if (fetchedReviews.length === 0) return { reviews: [], products: {} };

    const uniqueHandles = [...new Set(fetchedReviews.map(r => r.productHandle).filter(Boolean))].slice(0, 10);
    const productsMap = {};

    if (uniqueHandles.length > 0) {
      const qProducts = query(collection(db, "products"), where(documentId(), "in", uniqueHandles));
      const snapProducts = await getDocs(qProducts);
      snapProducts.docs.forEach(doc => {
        const pData = doc.data();
        const h = pData.handle || doc.id;
        productsMap[h] = { ...pData, id: doc.id, mainImage: pData.images?.[0] || pData.image || "" };
      });
      
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

// 🔥 تعديل: محاولة الجلب من KV Cache أولاً لمنتجات الأقسام الأربعة
const fetchHomepageProductsSections = async () => {
  try {
    const res = await fetch('/api/homepage-sections');
    if (res.ok) {
      const data = await res.json();
      if (data && data.topRatedWeekly) return data;
    }
  } catch (error) {}

  // 🛡️ Fallback: الكود الأصلي
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
    const [mostLikedIdsSnap, weeklyLikedIdsSnap, topStatsIdsSnap, recentReviewsSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), orderBy("likesCount", "desc"), limit(5))),
      getDocs(query(collection(db, "products"), where("currentWeekId", "==", currentWeek), orderBy("weeklyLikesCount", "desc"), limit(5))),
      getDocs(query(collection(db, "ProductStats"), orderBy("totalCount", "desc"), limit(5))),
      getDocs(query(collection(db, "Reviews"), where("date", ">=", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()), limit(50)))
    ]);

    const mostLikedIds = mostLikedIdsSnap.docs.map(d => d.id);
    const weeklyLikedIds = weeklyLikedIdsSnap.docs.map(d => d.id);
    const topAllTimeHandles = topStatsIdsSnap.docs.map(d => d.id);
    
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

    const allProductIds = [
      ...mostLikedIds, ...weeklyLikedIds, ...topAllTimeHandles, ...topWeeklyHandles.map(t => t.handle)
    ].filter((id, i, arr) => arr.indexOf(id) === i);

    const productsMap = {};
    if (allProductIds.length > 0) {
      const allProductsSnap = await getDocs(query(collection(db, "products"), where(documentId(), "in", allProductIds)));
      allProductsSnap.docs.forEach(doc => {
        const data = doc.data();
        const handle = data.handle || doc.id;
        productsMap[doc.id] = { id: doc.id, ...data, handle };
        productsMap[handle] = { id: doc.id, ...data, handle };
      });
    }

    const mostLikedAllTime = mostLikedIds.map(id => productsMap[id]).filter(Boolean);
    const mostLikedWeeklyRaw = weeklyLikedIds.map(id => productsMap[id]).filter(Boolean);
    
    const topRatedAllTime = topAllTimeHandles.map(handle => {
      const product = productsMap[handle];
      if (!product) return null;
      const stats = topStatsIdsSnap.docs.find(s => s.id === handle)?.data();
      const avg = stats?.totalCount ? (stats.totalRatingSum / stats.totalCount).toFixed(1) : "5.0";
      return { ...product, allTimeAvg: avg, allTimeCount: stats?.totalCount || 0 };
    }).filter(Boolean);

    const topRatedWeeklyRaw = topWeeklyHandles.map(t => {
      const product = productsMap[t.handle];
      if (!product) return null;
      return { ...product, weeklyAvg: t.avg.toFixed(1) || "5.0", weeklyCount: t.count || 0 };
    }).filter(Boolean);

    let finalTopRatedWeekly = [...topRatedWeeklyRaw];
    if (finalTopRatedWeekly.length < 5) {
      const existingIds = new Set(finalTopRatedWeekly.map(p => p.id));
      const fillers = topRatedAllTime.filter(p => !existingIds.has(p.id)).slice(0, 5 - finalTopRatedWeekly.length).map(p => ({ ...p, weeklyAvg: p.allTimeAvg, weeklyCount: p.allTimeCount }));
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
// 2. Custom Hooks
// =========================================================

// 🔥 تعديل: هوك الإعدادات (يحاول الـ API أولاً)
export const useSiteSettings = () => {
  const fetcher = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) return data;
      }
    } catch (e) {}
    return fetchDoc('settings/siteSettings'); // Fallback
  };
  return useSWR('settings/siteSettings', fetcher, {
    dedupingInterval: 3600000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
};

export const useProductsList = (limitCount = 20) => {
  return useSWR(['products', limitCount, 'title', 'asc'], fetchCollection);
};

export const useHomepageReviews = () => {
  return useSWR('homepage-reviews', fetchHomepageReviews, {
    dedupingInterval: 3600000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
};

export const useHomepageProductsSections = () => {
  return useSWR('homepage-products-sections', fetchHomepageProductsSections, {
    dedupingInterval: 3600000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
};

export const usePaginatedProducts = (categorySlug, limitCount = 10, lastVisibleDoc = null) => {
  const fetcher = async () => {
    const db = getDb();
    const productsRef = collection(db, "products");
    let q = query(productsRef, where("categories", "array-contains", categorySlug), orderBy("createdAt", "desc"), limit(limitCount));
    if (lastVisibleDoc) q = query(q, startAfter(lastVisibleDoc));
    const snap = await getDocs(q);
    return { products: snap.docs.map(d => ({ id: d.id, ...d.data() })), lastDoc: snap.docs[snap.docs.length - 1] || null };
  };
  return useSWR(`paginated-products-${categorySlug}-${lastVisibleDoc?.id || 'start'}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 600000,
  });
};

export const useProduct = (id) => {
  const fetcher = async () => {
    const db = getDb();
    const snap = await getDoc(doc(db, "products", id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  };
  return useSWR(id ? `product-${id}` : null, fetcher, { dedupingInterval: 3600000, revalidateOnFocus: false });
};

// 🔥 تعديل: هوك المنتجات ذات الصلة (يحاول الـ API أولاً)
export const useRelatedProducts = (product) => {
  const fetcher = async () => {
    if (!product?.id) return [];
    
    // 1. محاولة الجلب من API الكاش أولاً
    try {
      const res = await fetch(`/api/related-products?id=${product.id}&handle=${encodeURIComponent(product.handle || '')}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data)) return data;
      }
    } catch (e) {}

    // 2. Fallback: الكود الأصلي للفايربيز
    const db = getDb();
    const productsRef = collection(db, "products");
    let related = [];

    const pageHandlesStr = product.metafields?.pageCrossSellHandles;
    if (pageHandlesStr && pageHandlesStr.trim() !== "") {
      const handlesArray = pageHandlesStr.split(',').map(h => h.trim()).filter(Boolean);
      const docsSnaps = await Promise.all(handlesArray.map(h => getDoc(doc(db, "products", h))));
      docsSnaps.forEach(ds => {
        if (ds.exists() && ds.id !== product.id) related.push({ id: ds.id, ...ds.data() });
      });
    } 

    if (related.length === 0) {
      const fbRefValue = (Array.isArray(product.categories) && product.categories[0]) || product.category;
      if (fbRefValue) {
        const qCat = query(productsRef, where("categories", "array-contains", fbRefValue), limit(6));
        const snap = await getDocs(qCat);
        snap.forEach(d => { if (d.id !== product.id) related.push({ id: d.id, ...d.data() }); });
      }
    }

    if (related.length === 0) {
      const qFallback = query(productsRef, limit(6));
      const snapFallback = await getDocs(qFallback);
      snapFallback.forEach(d => { if (d.id !== product.id) related.push({ id: d.id, ...d.data() }); });
    }

    return Array.from(new Map(related.map(item => [item.id, item])).values()).slice(0, 5);
  };

  return useSWR(product?.id ? `related-${product.id}` : null, fetcher, {
    dedupingInterval: 3600000,
    revalidateOnFocus: false
  });
};

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

    if (filter === "images") q = query(q, where("hasImages", "==", true));
    if (filter === "5star") q = query(q, where("rating", "==", 5));
    q = query(q, limit(3));
    if (lastVisibleDoc) q = query(q, startAfter(lastVisibleDoc));

    const snap = await getDocs(q);
    return {
      reviews: snap.docs.map(d => ({ id: d.id, ...d.data() })),
      lastDoc: snap.docs[snap.docs.length - 1] || null
    };
  };

  return useSWR(productHandle ? `reviews-${productHandle}-${filter}-${lastVisibleDoc?.id || 'start'}` : null, fetcher, {
    dedupingInterval: 600000,
    revalidateOnFocus: false
  });
};