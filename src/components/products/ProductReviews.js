"use client";
import React, { useEffect, useState } from 'react';
import { getDb } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore/lite';
import { X, CheckCircle, ImageIcon, ThumbsUp, ChevronDown, Star } from '@/components/icons-extra';

export default function ProductReviews({ productHandle, onReviewStatsUpdate }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // حالات إضافة تقييم جديد
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newReview, setNewReview] = useState({ name: '', rating: 5, text: '', imageUrl: '' });
  const [hoverRating, setHoverRating] = useState(0);

  // حالة الفلاتر والأوكرديون
  const [filter, setFilter] = useState("all");
  const [showAllReviews, setShowAllReviews] = useState(false);

  const fetchProductReviews = async () => {
    if(!productHandle) return;
    try {
      const q = query(collection(getDb(), "Reviews"), where("productHandle", "==", productHandle));
      const snap = await getDocs(q);
      const fetchedReviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      fetchedReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
      setReviews(fetchedReviews);
      
      if(fetchedReviews.length > 0 && onReviewStatsUpdate) {
        const avg = (fetchedReviews.reduce((acc, r) => acc + r.rating, 0) / fetchedReviews.length);
        onReviewStatsUpdate(avg, fetchedReviews.length);
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductReviews();
  }, [productHandle]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!newReview.text.trim()) return alert("يرجى كتابة رأيك أولاً");
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(getDb(), "Reviews"), {
        productHandle: productHandle,
        reviewerName: newReview.name || "عميل مميز",
        rating: newReview.rating,
        text: newReview.text,
        date: new Date().toISOString(),
        status: "published",
        imageUrls: newReview.imageUrl ? [newReview.imageUrl] : [],
        source: "website"
      });
      
      setShowAddModal(false);
      setNewReview({ name: '', rating: 5, text: '', imageUrl: '' });
      fetchProductReviews(); 
    } catch (error) {
      console.error("Error adding review:", error);
      alert("حدث خطأ أثناء الإرسال.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // حساب الإحصائيات
  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0 ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1) : "0.0";
  
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => {
    if(ratingCounts[r.rating] !== undefined) ratingCounts[r.rating]++;
  });

  // تطبيق الفلاتر
  const filteredReviews = reviews.filter(r => {
    if (filter === "images") return r.imageUrls && r.imageUrls.length > 0;
    if (filter === "5star") return r.rating === 5;
    return true;
  });

  // التحكم في عدد التقييمات المعروضة (الأوكرديون)
  const displayedReviews = showAllReviews ? filteredReviews : filteredReviews.slice(0, 3);
  const hiddenCount = filteredReviews.length - 3;

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(isoString).toLocaleDateString('ar-EG', options);
  };

  return (
    <>
      <section className="bg-white rounded-2xl border border-[#EAEAEA] p-5 md:p-8 shadow-sm font-sans mt-8" id="reviews-section" dir="rtl">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-[4px] h-[24px] bg-[#E6AE00] rounded-full" />
            <h2 className="text-xl md:text-2xl font-black text-[#1A1A1A] tracking-tight" style={{fontFamily:"Cairo,sans-serif"}}>
              تقييمات العملاء
            </h2>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] px-6 py-2.5 font-bold text-sm hover:bg-[#1A1A1A] hover:text-white transition-all duration-300 rounded-full shadow-sm"
            style={{fontFamily:"Cairo,sans-serif"}}
          >
            + أضف تجربتك
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-10 text-sm font-bold animate-pulse">جاري تحميل التقييمات...</div>
        ) : totalReviews === 0 ? (
          <div className="text-center bg-[#FAF9F6] rounded-xl p-10 border border-[#EAEAEA]">
            <Star className="mx-auto text-gray-300 mb-4" size={40} fill="currentColor" />
            <p className="text-[#1A1A1A] font-bold mb-2" style={{fontFamily:"Cairo,sans-serif"}}>كن أول من يشاركنا رأيه في هذا المنتج!</p>
            <p className="text-gray-500 text-sm">رأيك يساعد العملاء الآخرين في اتخاذ القرار الصحيح.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-8 items-center mb-8 pb-8 border-b border-[#EAEAEA]">
              
              <div className="flex flex-col items-center justify-center md:w-1/3 text-center">
                <div className="text-5xl md:text-6xl font-black text-[#1A1A1A] tracking-tighter mb-2" style={{fontFamily:"Impact, sans-serif"}}>
                  {averageRating}
                </div>
                <div className="flex items-center gap-1 text-[#E6AE00] mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={20} fill={star <= Math.round(averageRating)} className={star > Math.round(averageRating) ? "text-gray-300" : ""} />
                  ))}
                </div>
                <p className="text-sm font-bold text-gray-500 font-tajawal">
                  بناءً على {totalReviews} تقييم
                </p>
              </div>

              <div className="w-full md:w-2/3 flex flex-col gap-2.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingCounts[star];
                  const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-600 w-8 text-left">{star} نجوم</span>
                      <div className="flex-1 h-2.5 bg-[#FAF9F6] rounded-full overflow-hidden border border-[#EAEAEA]">
                        <div 
                          className="h-full bg-[#1A1A1A] rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right font-medium">{percentage.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 mb-8">
              <button onClick={() => { setFilter("all"); setShowAllReviews(false); }} className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold border transition-colors shadow-sm ${filter === "all" ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-gray-600 border-[#EAEAEA] hover:border-gray-300"}`} style={{fontFamily:"Cairo,sans-serif"}}>
                الكل ({totalReviews})
              </button>
              <button onClick={() => { setFilter("images"); setShowAllReviews(false); }} className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold border flex items-center gap-1.5 transition-colors shadow-sm ${filter === "images" ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-gray-600 border-[#EAEAEA] hover:border-gray-300"}`} style={{fontFamily:"Cairo,sans-serif"}}>
                <ImageIcon size={14} /> بصور
              </button>
              <button onClick={() => { setFilter("5star"); setShowAllReviews(false); }} className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold border flex items-center gap-1.5 transition-colors shadow-sm ${filter === "5star" ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-gray-600 border-[#EAEAEA] hover:border-gray-300"}`} style={{fontFamily:"Cairo,sans-serif"}}>
                5 نجوم فقط
              </button>
            </div>

            <div className="flex flex-col gap-6">
              {displayedReviews.length > 0 ? (
                displayedReviews.map((rev) => (
                  <div key={rev.id} className="border-b border-[#EAEAEA] pb-6 last:border-0 last:pb-0 animate-[fadeIn_0.4s_ease-out]">
                    
                    <div className="flex justify-between items-start mb-3">
                      {/* توافق وتوسيط الأفاتار بالمللي */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-[#FAF9F6] border border-[#EAEAEA] flex items-center justify-center text-[#1A1A1A] font-black text-sm uppercase">
                          <span className="translate-y-[1px] leading-none">{rev.reviewerName ? rev.reviewerName.charAt(0) : "ع"}</span>
                        </div>
                        <div className="flex flex-col justify-center">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-[#1A1A1A]" style={{fontFamily:"Cairo,sans-serif"}}>{rev.reviewerName}</span>
                            <span className="flex items-center gap-1 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 font-bold">
                              <CheckCircle size={11} strokeWidth={2.5} /> موثق
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 text-[#E6AE00] mt-1.5">
                            {[...Array(5)].map((_, i) => (
                              <ProStar key={i} size={12} filled={i < rev.rating} className={i >= rev.rating ? "text-gray-300" : ""} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 font-medium pt-1">{formatDate(rev.date)}</span>
                    </div>

                    <p className="text-gray-600 text-sm md:text-base leading-relaxed mb-4 pl-4 font-tajawal">
                      {rev.text}
                    </p>

                    {rev.imageUrls && rev.imageUrls.length > 0 && (
                      <div className="flex gap-2 mb-4 overflow-x-auto hide-scrollbar-horizontal">
                        {rev.imageUrls.map((img, idx) => (
                          <div key={idx} className="w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-lg overflow-hidden border border-[#EAEAEA] cursor-pointer hover:border-[#1A1A1A] transition-colors">
                            <img src={img} alt="صورة التقييم" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-gray-400">
                      <button className="flex items-center gap-1.5 text-xs font-bold hover:text-[#1A1A1A] transition-colors">
                        <ThumbsUp size={14} /> <span>مفيد</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-400 font-bold" style={{fontFamily:"Cairo,sans-serif"}}>
                  لا توجد تقييمات مطابقة للفلتر المحدد.
                </div>
              )}

              {/* الأوكرديون (زر العرض والإخفاء) */}
              {hiddenCount > 0 && !showAllReviews && (
                <button 
                  onClick={() => setShowAllReviews(true)}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-3 bg-[#FAF9F6] border border-[#EAEAEA] rounded-xl text-[#1A1A1A] font-bold text-sm hover:bg-gray-100 hover:border-gray-300 transition-all duration-300"
                  style={{fontFamily:"Cairo,sans-serif"}}
                >
                  عرض باقي التقييمات ({hiddenCount})
                  <ChevronDown size={16} />
                </button>
              )}

              {showAllReviews && hiddenCount > 0 && (
                <button 
                  onClick={() => {
                    setShowAllReviews(false);
                    document.getElementById('reviews-section').scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-white border border-[#EAEAEA] rounded-xl text-gray-500 font-bold text-sm hover:bg-[#FAF9F6] transition-all duration-300"
                  style={{fontFamily:"Cairo,sans-serif"}}
                >
                  إخفاء التقييمات السابقة
                  <ChevronDown size={16} className="rotate-180" />
                </button>
              )}

            </div>
          </>
        )}
      </section>

      {showAddModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-[fadeIn_0.3s_ease-out]" dir="rtl">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full border border-[#EAEAEA] shadow-2xl relative">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 left-4 p-2 bg-[#FAF9F6] hover:bg-gray-100 rounded-full text-gray-500 transition-colors border border-[#EAEAEA]"><X size={16} /></button>
            
            <div className="flex items-center gap-2 mb-6">
              <div className="w-[4px] h-[20px] bg-[#E6AE00] rounded-full" />
              <h2 className="text-xl font-black text-[#1A1A1A] tracking-tight" style={{fontFamily:"Cairo,sans-serif"}}>شاركنا تجربتك</h2>
            </div>
            
            <form onSubmit={handleSubmitReview} className="space-y-4">
              
              <div className="flex items-center justify-center gap-2 mb-6 bg-[#FAF9F6] p-4 rounded-xl border border-[#EAEAEA]" dir="ltr">
                {[...Array(5)].map((_, index) => {
                  const ratingValue = index + 1;
                  return (
                    <button
                      type="button"
                      key={ratingValue}
                      className={`transition-transform hover:scale-110 ${ratingValue <= (hoverRating || newReview.rating) ? "text-[#E6AE00]" : "text-gray-300"}`}
                      onClick={() => setNewReview({ ...newReview, rating: ratingValue })}
                      onMouseEnter={() => setHoverRating(ratingValue)}
                      onMouseLeave={() => setHoverRating(0)}
                    >
                      <Star size={36} fill={ratingValue <= (hoverRating || newReview.rating)} />
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">الاسم (اختياري)</label>
                <input type="text" value={newReview.name} onChange={(e) => setNewReview({...newReview, name: e.target.value})} placeholder="الاسم الذي سيظهر للعملاء" className="w-full p-3 bg-[#FAF9F6] border border-[#EAEAEA] rounded-xl text-[#1A1A1A] outline-none focus:border-[#1A1A1A] transition-colors shadow-inner" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">رأيك *</label>
                <textarea required value={newReview.text} onChange={(e) => setNewReview({...newReview, text: e.target.value})} placeholder="صف لنا تجربتك مع جودة المنتج وسرعة التوصيل..." rows="4" className="w-full p-3 bg-[#FAF9F6] border border-[#EAEAEA] rounded-xl text-[#1A1A1A] outline-none focus:border-[#1A1A1A] resize-none transition-colors shadow-inner"></textarea>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-2">
                  <ImageIcon size={14} /> إضافة صورة (اختياري)
                </label>
                <input type="url" value={newReview.imageUrl} onChange={(e) => setNewReview({...newReview, imageUrl: e.target.value})} placeholder="رابط الصورة (URL)" className="w-full p-3 bg-[#FAF9F6] border border-[#EAEAEA] rounded-xl text-[#1A1A1A] outline-none focus:border-[#1A1A1A] text-left transition-colors shadow-inner" dir="ltr" />
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full py-3.5 mt-4 bg-[#1A1A1A] text-white font-black text-sm rounded-full hover:bg-black shadow-md transition-all duration-300 flex justify-center items-center gap-2" style={{fontFamily:"Cairo,sans-serif"}}>
                {isSubmitting ? "جاري الإرسال..." : "تأكيد وإرسال"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}