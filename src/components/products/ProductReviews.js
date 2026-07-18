"use client";
import React, { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { getDb } from '@/lib/firebase';
import { 
  collection, getDocs, query, limit, 
  orderBy, where, startAfter, addDoc, doc, getDoc, setDoc, increment 
} from 'firebase/firestore/lite';
import { X, CheckCircle, ImageIcon, ChevronDown, Star, Verified } from '@/components/icons-extra';
import { usePaginatedReviews } from "@/hooks/useFirestore";
import ImageUploader from "@/components/ImageUploader";

export default function ProductReviews({ productHandle, onReviewStatsUpdate }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // حالات إضافة تقييم جديد
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newReview, setNewReview] = useState({ name: '', rating: 5, text: '', imageUrls: [] });
  const [hoverRating, setHoverRating] = useState(0);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [localStats, setLocalStats] = useState({ avg: 5, total: 0 });

  // حالة الفلاتر
  const [filter, setFilter] = useState("all");

  // 🔥 جلب الإحصائيات من KV Cache عبر API أولاً — Firebase فقط كـ Fallback
  useEffect(() => {
    const fetchGlobalStats = async () => {
      if (!productHandle) return;
      try {
        // 1. جرب الـ API (KV Cache) أولاً — صفر قراءات Firebase
        const res = await fetch(`/api/product-stats?handle=${encodeURIComponent(productHandle)}`);
        if (res.ok) {
          const json = await res.json();
          const total = json.count || 0;
          const avg = json.rating || 5;
          setLocalStats({ avg, total });
          if (onReviewStatsUpdate) onReviewStatsUpdate(avg, total);
          return;
        }
      } catch {}

      // 2. Fallback: Firebase مباشرة (الكود الأصلي — لا تحذفه)
      try {
        const db = getDb();
        const statsRef = doc(db, "ProductStats", productHandle);
        const statsSnap = await getDoc(statsRef);

        if (statsSnap.exists()) {
          const data = statsSnap.data();
          const total = data.totalCount || 0;
          const avg = total > 0 ? (data.totalRatingSum / total) : 5;
          setLocalStats({ avg, total });
          if (onReviewStatsUpdate) onReviewStatsUpdate(avg, total);
        } else {
          // أول مرة نفتح المنتج — جرد شامل لمرة واحدة فقط
          const q = query(
            collection(db, "Reviews"),
            where("productHandle", "==", productHandle),
            where("status", "==", "published")
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const total = snap.size;
            const sum = snap.docs.reduce((acc, d) => acc + (d.data().rating || 5), 0);
            const avg = sum / total; // 🔥 تعريف الـ avg اللي كان ناقص
            await setDoc(statsRef, { totalCount: total, totalRatingSum: sum });
            setLocalStats({ avg, total });
            if (onReviewStatsUpdate) onReviewStatsUpdate(avg, total);
          }
        }
      } catch (e) { console.error("Stats Optimization Failed", e); }
    };
    fetchGlobalStats();
  }, [productHandle]);

  // ربط الجلب بالفلتر الحالي
  const { data: firstBatch, isValidating } = usePaginatedReviews(productHandle, null, filter);

  useEffect(() => {
    if (firstBatch) {
      setReviews(firstBatch.reviews);
      setLastDoc(firstBatch.lastDoc);
      setHasMore(firstBatch.reviews.length === 3);
      setLoading(false);
    }
  }, [firstBatch, filter]);

  // دالة تحميل 3 تقييمات إضافية من السيرفر (عند الضغط على الزر)
  const fetchMoreFromFirebase = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const db = getDb();
      let q = query(
        collection(db, "Reviews"),
        where("productHandle", "==", productHandle),
        where("status", "==", "published"),
        orderBy("date", "desc")
      );

      if (filter === "images") q = query(q, where("hasImages", "==", true));
      if (filter === "5star") q = query(q, where("rating", "==", 5));

      q = query(q, startAfter(lastDoc), limit(3));
      const snap = await getDocs(q);
      const newBatch = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setReviews(prev => [...prev, ...newBatch]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 3);
    } catch (error) {
      console.error("WIND Error: Fetch More", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleImageUpload = (urls) => {
    setUploadedImages(urls);
    setNewReview(prev => ({ ...prev, imageUrls: urls }));
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!newReview.text.trim()) return alert("يرجى كتابة رأيك أولاً");
    setIsSubmitting(true);
    try {
      const handleDeleteReview = async (reviewId, reviewRating) => {
        if (!confirm("هل أنت متأكد من حذف هذا التقييم؟")) return;
        try {
          const db = getDb();
          const statsRef = doc(db, "ProductStats", productHandle);
          await setDoc(statsRef, {
            totalCount: increment(-1),
            totalRatingSum: increment(-reviewRating)
          }, { merge: true });
          setReviews(prev => prev.filter(r => r.id !== reviewId));
          if (onReviewStatsUpdate) {
            const newTotal = Math.max(0, localStats.total - 1);
            const newAvg = newTotal > 0 ? (localStats.avg * localStats.total - reviewRating) / newTotal : 5;
            setLocalStats({ avg: newAvg, total: newTotal });
            onReviewStatsUpdate(newAvg, newTotal);
          }
          alert("تم حذف التقييم وتحديث الإحصائيات!");
        } catch (e) { console.error("Delete Failed", e); }
      };

      const db = getDb();
      const newReviewData = {
        productHandle: productHandle,
        reviewerName: newReview.name || "عميل مميز",
        rating: newReview.rating,
        text: newReview.text,
        date: new Date().toISOString(),
        status: "published",
        imageUrls: newReview.imageUrls || [],
        hasImages: (newReview.imageUrls && newReview.imageUrls.length > 0) || false,
        source: "website"
      };

      // 1. إضافة التقييم لجدول التقييمات
      const docRef = await addDoc(collection(db, "Reviews"), newReviewData);

      // 2. 🔥 تحديث العداد والنجوم أوتوماتيك (تمت إضافة totalRatingSum)
      const statsRef = doc(db, "ProductStats", productHandle);
      await setDoc(statsRef, {
        totalCount: increment(1),
        totalRatingSum: increment(Number(newReview.rating)) // 👈 هذا ما كان ينقصنا
      }, { merge: true });

      // 3. مسح KV Cache + تحديث فوري للواجهة
      try {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'product_stats',
            handle: productHandle 
          })
        });
        // مسح sessionStorage عشان الـ ProductCard يسحب فريش
        sessionStorage.removeItem(`wind_stats_${productHandle}`);
        // تحديث فوري لكل الـ SWR caches المرتبطة
        mutate('homepage/data');
        mutate('homepage-products-sections');
        mutate('homepage-reviews');
      } catch (e) {
        console.error("WIND Cache Revalidate Error:", e);
      }
      
      alert("تمت إضافة تقييمك بنجاح!");
      
      // 4. 🔥 الإغلاق التلقائي للمودال وتصفير البيانات
      setShowAddModal(false);
      setNewReview({ name: '', rating: 5, text: '', imageUrls: [] });
      setUploadedImages([]);
      
      // 5. التحديث اللحظي للواجهة وإصلاح خطأ النجوم الرمادية (NaN)
      setReviews(prev => [{ id: docRef.id, ...newReviewData }, ...prev]);
      if (onReviewStatsUpdate) {
        const newTotal = localStats.total + 1;
        // 🔥 استخدام Number() لضمان الحساب الرياضي الصحيح للنجوم
        const safeRating = Number(newReview.rating) || 5;
        const newAvg = ((localStats.avg * localStats.total) + safeRating) / newTotal;
        setLocalStats({ avg: newAvg, total: newTotal });
        onReviewStatsUpdate(newAvg, newTotal);
      }
      
    } catch (error) {
      console.error("Review submission error:", error);
      alert("حدث خطأ أثناء الإرسال: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredReviews = reviews.filter(r => {
    if (filter === "images") return r.imageUrls && r.imageUrls.length > 0;
    if (filter === "5star") return r.rating === 5;
    return true;
  });

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(isoString).toLocaleDateString('ar-EG', options);
  };

  return (
    <>
      <section className="bg-[#F5F5F5] py-12 md:py-16 font-sans mt-8" id="reviews-section" dir="rtl">
        <div className="max-w-[1400px] mx-auto px-4">

          <div className="flex flex-row justify-between items-center gap-4 mb-6">
            <h2 className="text-xl md:text-2xl font-black text-[#1A1A1A] tracking-tight" style={{fontFamily:"Cairo,sans-serif"}}>
              تقييمات العملاء
            </h2>
            <button onClick={() => setShowAddModal(true)} className="bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] px-5 py-2 font-bold text-sm hover:bg-[#1A1A1A] hover:text-white transition-all duration-300 rounded-[2px]" style={{fontFamily:"Cairo,sans-serif"}}>
              + أضف تجربتك
            </button>
          </div>

          {!loading && (reviews.length > 0 || filter !== "all") && (
            <div className="flex flex-wrap gap-2.5 mb-6">
              <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${filter === "all" ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-gray-600 border-[#EAEAEA]"}`}>الكل</button>
              <button onClick={() => setFilter("images")} className={`px-4 py-2 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-colors ${filter === "images" ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-gray-600 border-[#EAEAEA]"}`}><ImageIcon size={14} /> بصور</button>
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm font-bold animate-pulse font-cairo">جاري التحميل...</div>
          ) : filteredReviews.length === 0 ? (
            <div className="text-center bg-[#FAF9F6] rounded-xl p-10 border border-[#EAEAEA]">
              <Star className="mx-auto text-gray-300 mb-4" size={40} fill="currentColor" />
              <p className="text-[#1A1A1A] font-bold mb-2 font-cairo">
                {filter === "images" ? "لا توجد تقييمات تحتوي على صور حالياً" : "كن أول من يشاركنا رأيه!"}
              </p>
              {filter !== "all" && (
                <button onClick={() => setFilter("all")} className="text-[#E6AE00] text-sm font-bold underline mt-2 font-cairo">عرض كل التقييمات</button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 max-w-2xl mx-auto">
              {filteredReviews.map((rev) => (
                <div key={rev.id} className="bg-white rounded-[2px] shadow-sm p-6 md:p-8 relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border border-[#EAEAEA] flex items-center justify-center text-[#1A1A1A] font-black text-sm uppercase">
                        {rev.reviewerName?.charAt(0) || "ع"}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-[15px] md:text-[18px] text-[#1A1A1A] font-cairo">
                            {rev.reviewerName}
                          </h3>
                          <Verified size={14} className="text-[#1877F2] shrink-0" />
                        </div>
                        <div className="flex items-center gap-[1.5px] mt-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={11}
                              className={i < rev.rating ? "fill-[#E6AE00] text-[#E6AE00]" : "fill-gray-200 text-gray-200"}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">{formatDate(rev.date)}</span>
                  </div>
                  <p className="text-[#333333] text-[14px] md:text-[16px] leading-[1.7] font-tajawal">
                    "{rev.text}"
                  </p>
                  {rev.imageUrls && rev.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {rev.imageUrls.map((imgUrl, idx) => (
                        <div key={idx} className="w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden border border-[#EAEAEA] shadow-sm">
                          <img src={imgUrl} alt="Review" className="w-full h-full object-cover hover:scale-110 transition-transform duration-500 cursor-zoom-in" onClick={() => window.open(imgUrl, '_blank')} />
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              ))}

              {hasMore && (
                <button 
                  onClick={fetchMoreFromFirebase} 
                  disabled={loadingMore} 
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] rounded-xl font-bold text-sm hover:bg-[#1A1A1A] hover:text-white transition-all shadow-sm font-cairo"
                >
                  {loadingMore ? "جاري التحميل..." : "مشاهدة المزيد من التقييمات"}
                  <ChevronDown size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {showAddModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-[fadeIn_0.3s_ease-out]" dir="rtl">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full border border-[#EAEAEA] shadow-2xl relative">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 left-4 p-2 bg-[#FAF9F6] hover:bg-gray-100 rounded-full text-gray-500 transition-colors border border-[#EAEAEA]"><X size={16} /></button>
            <h2 className="text-xl font-black text-[#1A1A1A] mb-6" style={{fontFamily:"Cairo,sans-serif"}}>شاركنا تجربتك</h2>
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div className="flex items-center justify-center gap-2 mb-6 bg-[#FAF9F6] p-4 rounded-xl border border-[#EAEAEA]" dir="ltr">
                {[1, 2, 3, 4, 5].map((ratingValue) => (
                  <button type="button" key={ratingValue} className={`transition-transform hover:scale-110 ${ratingValue <= (hoverRating || newReview.rating) ? "text-[#E6AE00]" : "text-gray-300"}`} onClick={() => setNewReview({ ...newReview, rating: ratingValue })} onMouseEnter={() => setHoverRating(ratingValue)} onMouseLeave={() => setHoverRating(0)}>
                    <Star size={36} fill={ratingValue <= (hoverRating || newReview.rating)} />
                  </button>
                ))}
              </div>
              <input type="text" value={newReview.name} onChange={(e) => setNewReview({...newReview, name: e.target.value})} placeholder="الاسم" className="w-full p-3 bg-[#FAF9F6] border border-[#EAEAEA] rounded-xl outline-none focus:border-[#1A1A1A]" />
              <textarea required value={newReview.text} onChange={(e) => setNewReview({...newReview, text: e.target.value})} placeholder="رأيك..." rows="4" className="w-full p-3 bg-[#FAF9F6] border border-[#EAEAEA] rounded-xl outline-none focus:border-[#1A1A1A] resize-none"></textarea>
              
              <div className="space-y-3">
                <label className="block text-sm font-bold text-[#1A1A1A]">أضف صور (اختياري)</label>
                <ImageUploader onUploadSuccess={handleImageUpload} />
                {uploadedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {uploadedImages.map((url, index) => (
                      <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#EAEAEA]">
                        <img src={url} alt={`Uploaded image ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const newImages = uploadedImages.filter((_, i) => i !== index);
                            setUploadedImages(newImages);
                            setNewReview(prev => ({ ...prev, imageUrls: newImages }));
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <button type="submit" disabled={isSubmitting} className="w-full py-3.5 mt-4 bg-[#1A1A1A] text-white font-black text-sm rounded-full hover:bg-black shadow-md transition-all">
                {isSubmitting ? "جاري الإرسال..." : "تأكيد وإرسال"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}