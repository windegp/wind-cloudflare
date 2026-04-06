"use client";

import React, { useState, useEffect, useRef } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, addDoc, deleteDoc, doc, writeBatch, orderBy, updateDoc } from "firebase/firestore/lite";
import Papa from 'papaparse';
import { Star, Upload, Plus, MessageSquare, CheckCircle, X, ThumbsUp, ChevronDown, Trash2, Calendar, Heart, Save, Eye, Loader2 } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

export default function ReviewsAdminPage() {
  const [reviews, setReviews] = useState([]);
  const [products, setProducts] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  // حالة الإعجابات (للتعديل المباشر من الجدول)
  const [editingLikes, setEditingLikes] = useState({});
  const [savingLikes, setSavingLikes] = useState(null);

  // حالات النوافذ المنبثقة
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedProductForReviews, setSelectedProductForReviews] = useState(null); // لفتح نافذة التقييمات

  const [newReview, setNewReview] = useState({
    productHandle: '',
    reviewerName: '',
    rating: 5,
    text: '',
    imageUrl: '',
    reviewDate: new Date().toISOString().split('T')[0] 
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchProducts(), fetchReviews()]);
    setLoading(false);
  };

  const fetchProducts = async () => {
    try {
      const db = getDb();
      const q = query(collection(db, "products"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(doc => ({ 
        id: doc.id, 
        title: doc.data().title || "بدون اسم",
        handle: doc.data().handle || doc.data().seo?.handle || doc.id,
        likesCount: doc.data().likesCount || 0,
        likesUpdatedAt: doc.data().likesUpdatedAt || null,
        currentWeekId: doc.data().currentWeekId || null,
        weeklyLikesCount: doc.data().weeklyLikesCount || 0
      }));
      setProducts(docs);
      
      // تهيئة حالة الإعجابات
      const likesState = {};
      docs.forEach(p => likesState[p.id] = p.likesCount);
      setEditingLikes(likesState);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchReviews = async () => {
    try {
      const db = getDb();
      const q = query(collection(db, "Reviews"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReviews(docs);
    } catch (err) {
      console.error("Error fetching reviews:", err);
    }
  };

  // 🔥 دالة مساعدة للحصول على رقم الأسبوع الحالي 🔥
  const getCurrentWeekString = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };

  // 🔥 دالة تحديث الإعجابات للمنتج (مدمج معها لوجيك الأسبوع)
  const handleUpdateLikes = async (productId) => {
    const newLikes = Number(editingLikes[productId]);
    if (isNaN(newLikes)) return;

    setSavingLikes(productId);
    try {
      const db = getDb();
      const productRef = doc(db, "products", productId);
      const updateTime = new Date().toISOString(); // التاريخ الدقيق للحظة التحديث
      const currentWeekIdStr = getCurrentWeekString();
      const productToUpdate = products.find(p => p.id === productId);
      
      const oldLikes = productToUpdate.likesCount || 0;
      const diff = newLikes - oldLikes;
      
      let updateData = {
        likesCount: newLikes,
        likesUpdatedAt: updateTime
      };

      // حساب الإعجابات الأسبوعية بناءً على التعديل اليدوي
      if (productToUpdate.currentWeekId === currentWeekIdStr) {
        updateData.weeklyLikesCount = Math.max(0, (productToUpdate.weeklyLikesCount || 0) + diff);
      } else {
        updateData.currentWeekId = currentWeekIdStr;
        updateData.weeklyLikesCount = Math.max(0, diff);
      }

      await updateDoc(productRef, updateData);

      // تحديث الواجهة أوتوماتيك
      setProducts(products.map(p => p.id === productId ? { 
        ...p, 
        likesCount: newLikes, 
        likesUpdatedAt: updateTime,
        currentWeekId: updateData.currentWeekId || p.currentWeekId,
        weeklyLikesCount: updateData.weeklyLikesCount
      } : p));
    } catch (error) {
      console.error("Error updating likes:", error);
      alert("حدث خطأ أثناء تحديث الإعجابات.");
    } finally {
      setSavingLikes(null);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const db = getDb();
          const batch = writeBatch(db);
          let count = 0;
          
          results.data.forEach((row) => {
            if (row.body && row.rating && row.product_handle) {
              const reviewRef = doc(collection(db, "Reviews"));
              let finalDate = new Date().toISOString();
              if (row.review_date) {
                const parsedDate = new Date(row.review_date);
                if (!isNaN(parsedDate)) finalDate = parsedDate.toISOString();
              }

              batch.set(reviewRef, {
                productHandle: row.product_handle.trim(),
                reviewerName: row.reviewer_name || "عميل WIND",
                rating: Number(row.rating),
                text: row.body,
                date: finalDate,
                status: "published",
                imageUrls: row.picture_urls ? row.picture_urls.split(',') : [],
                source: "csv_import"
              });
              count++;
            }
          });

          if (count > 0) {
            await batch.commit();
            alert(`تم رفع ${count} تقييم بنجاح إلى قاعدة البيانات!`);
            fetchReviews();
          }
        } catch (error) {
          console.error("Error uploading batch:", error);
          alert("حدث خطأ أثناء الرفع.");
        } finally {
          setIsUploading(false);
          if(fileInputRef.current) fileInputRef.current.value = "";
        }
      }
    });
  };

  const handleAddManualReview = async (e) => {
    e.preventDefault();
    if (!newReview.productHandle || !newReview.text) return alert("يرجى اختيار المنتج وكتابة نص التقييم");
    
    setIsAdding(true);
    try {
      const finalISODate = new Date(newReview.reviewDate).toISOString();
      const db = getDb();

      await addDoc(collection(db, "Reviews"), {
        productHandle: newReview.productHandle.trim(),
        reviewerName: newReview.reviewerName || "عميل WIND",
        rating: Number(newReview.rating),
        text: newReview.text,
        date: finalISODate,
        status: "published",
        imageUrls: newReview.imageUrl ? [newReview.imageUrl] : [],
        source: "manual"
      });
      setShowAddModal(false);
      fetchReviews();
      setNewReview({ productHandle: '', reviewerName: '', rating: 5, text: '', imageUrl: '', reviewDate: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error("Error adding review:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteReview = async (id) => {
    if(!window.confirm("هل أنت متأكد من حذف هذا التقييم؟")) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, "Reviews", id));
      setReviews(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  // دوال الإحصائيات المجمعة للمنتج
  const getProductStats = (handle) => {
    const productReviews = reviews.filter(r => r.productHandle === handle);
    const count = productReviews.length;
    let avgRating = 0;
    if (count > 0) {
      const sum = productReviews.reduce((acc, curr) => acc + Number(curr.rating || 5), 0);
      avgRating = (sum / count).toFixed(1);
    }
    
    // استخراج المصادر الفريدة
    const sources = [...new Set(productReviews.map(r => r.source || "غير محدد"))];
    
    return { count, avgRating, sources, reviewsList: productReviews };
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans text-[#202223]" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <MessageSquare className="text-[#008060]" /> إدارة التقييمات والإعجابات
          </h1>
          
          <div className="flex items-center gap-3">
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="bg-white border border-[#008060] text-[#008060] px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-50 transition-all">
              {isUploading ? <span className="animate-spin h-4 w-4 border-2 border-[#008060] border-t-transparent rounded-full"></span> : <Upload size={16} />}
              رفع شيت التقييمات
            </button>
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

            <button onClick={() => setShowAddModal(true)} className="bg-[#008060] text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-[#006e52] transition-all">
              <Plus size={16} /> إضافة تقييم يدوي
            </button>
          </div>
        </div>

        {/* 🔥 الجدول الجديد المجمع (لكل منتج) */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden mb-10">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                  <th className="px-6 py-4">المنتج</th>
                  <th className="px-6 py-4 text-center">إحصائيات التقييمات</th>
                  <th className="px-6 py-4">مصادر التقييمات</th>
                  <th className="px-6 py-4 text-center">الإعجابات (Likes)</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? <tr><td colSpan="5" className="text-center py-10">جاري التحميل...</td></tr> : 
                  products.length === 0 ? <tr><td colSpan="5" className="text-center py-10 text-gray-400 font-bold">لا توجد منتجات حالياً</td></tr> :
                  products.map(product => {
                    const stats = getProductStats(product.handle);
                    const isLikesChanged = editingLikes[product.id] !== product.likesCount;

                    return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-all">
                      
                      {/* اسم المنتج */}
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-[#1A1A1A] block mb-1 line-clamp-1">{product.title}</span>
                        <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">{product.handle}</span>
                      </td>

                      {/* إحصائيات التقييمات */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1 bg-[#FFF8D6] text-[#8A6D00] border border-[#FFE885] px-2.5 py-1 rounded-md text-xs font-black">
                            {stats.avgRating} <Star size={12} fill="currentColor" /> 
                          </div>
                          <span className="text-[11px] text-gray-500 font-bold">({stats.count} تقييم)</span>
                        </div>
                      </td>

                      {/* مصادر التقييمات */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {stats.sources.length > 0 ? stats.sources.map((src, i) => (
                            <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium">
                              {src === 'manual' ? 'يدوي' : src === 'csv_import' ? 'ملف CSV' : src}
                            </span>
                          )) : <span className="text-[10px] text-gray-400">-</span>}
                        </div>
                      </td>

                      {/* 🔥 الإعجابات وتحديثها */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className="relative">
                            <Heart size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-400" />
                            <input 
                              type="number" 
                              min="0"
                              value={editingLikes[product.id] !== undefined ? editingLikes[product.id] : product.likesCount}
                              onChange={(e) => setEditingLikes({...editingLikes, [product.id]: e.target.value})}
                              className="w-24 pl-2 pr-8 py-1.5 text-center bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-red-400 outline-none"
                            />
                          </div>
                          {isLikesChanged && (
                            <button 
                              onClick={() => handleUpdateLikes(product.id)}
                              disabled={savingLikes === product.id}
                              className="bg-red-50 text-red-600 border border-red-200 p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                              title="حفظ التعديل"
                            >
                              {savingLikes === product.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            </button>
                          )}
                        </div>
                        {product.likesUpdatedAt && (
                          <div className="text-[9px] text-gray-400 text-center mt-1">
                            آخر تحديث: {new Date(product.likesUpdatedAt).toLocaleDateString('ar-EG')}
                          </div>
                        )}
                      </td>

                      {/* الإجراءات */}
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => setSelectedProductForReviews(product)}
                          disabled={stats.count === 0}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 w-full mx-auto transition-colors ${stats.count > 0 ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                        >
                          <Eye size={14} /> عرض التقييمات
                        </button>
                      </td>
                    </tr>
                  )})}
              </tbody>
            </table>
          </div>
        </div>


        {/* 🔥 نافذة عرض التقييمات الخاصة بمنتج معين */}
        {selectedProductForReviews && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm slide-down">
            <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
              
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-[#FAF9F6]">
                <div>
                  <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <MessageSquare className="text-[#008060]" size={20} /> تقييمات المنتج
                  </h2>
                  <p className="text-xs text-gray-500 font-bold mt-1">{selectedProductForReviews.title}</p>
                </div>
                <button onClick={() => setSelectedProductForReviews(null)} className="p-2 bg-white hover:bg-gray-100 rounded-full text-gray-500 shadow-sm border border-gray-200"><X size={16} /></button>
              </div>

              <div className="p-0 overflow-y-auto flex-1 bg-gray-50/50">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase">
                      <th className="px-6 py-3">العميل والتاريخ</th>
                      <th className="px-6 py-3">التقييم</th>
                      <th className="px-6 py-3">النص والمصدر</th>
                      <th className="px-6 py-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {getProductStats(selectedProductForReviews.handle).reviewsList.map(review => {
                      const rDate = new Date(review.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
                      return (
                        <tr key={review.id} className="bg-white hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-gray-900">{review.reviewerName}</div>
                            <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Calendar size={10} /> {rDate}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex text-[#F5C518]">
                              {[...Array(5)].map((_, i) => <Star key={i} size={13} fill={i < review.rating ? "currentColor" : "none"} className={i >= review.rating ? "text-gray-300" : ""} />)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-700">
                            <p className="mb-1 leading-relaxed">{review.text}</p>
                            <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">المصدر: {review.source}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button onClick={() => handleDeleteReview(review.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* المودال: إضافة تقييم يدوي */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl relative slide-down">
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 left-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"><X size={16} /></button>
              <h2 className="text-xl font-black text-gray-900 mb-6">إضافة تقييم جديد</h2>
              
              <form onSubmit={handleAddManualReview} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-2">اختر المنتج *</label>
                  <select required value={newReview.productHandle} onChange={(e) => setNewReview({...newReview, productHandle: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#008060] font-bold text-gray-700">
                    <option value="" disabled>-- اختر منتجاً من المتجر --</option>
                    {products.map(p => {
                      const c = getProductStats(p.handle).count;
                      return <option key={p.id} value={p.handle}>{p.title} {c > 0 ? `(${c} تقييم)` : ''}</option>;
                    })}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2">اسم العميل</label>
                    <input type="text" value={newReview.reviewerName} onChange={(e) => setNewReview({...newReview, reviewerName: e.target.value})} placeholder="مثال: سارة أحمد" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#008060]" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2">النجوم (1 إلى 5)</label>
                    <input type="number" min="1" max="5" value={newReview.rating} onChange={(e) => setNewReview({...newReview, rating: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#008060]" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-2">تاريخ التقييم (يمكنك تعديله)</label>
                  <input type="date" value={newReview.reviewDate} onChange={(e) => setNewReview({...newReview, reviewDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#008060] font-sans" dir="ltr" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-2">نص التقييم *</label>
                  <textarea required value={newReview.text} onChange={(e) => setNewReview({...newReview, text: e.target.value})} placeholder="مثال: خامة ممتازة وتدفئة رائعة..." rows="3" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#008060]"></textarea>
                </div>

                <button type="submit" disabled={isAdding} className="w-full py-3.5 mt-4 bg-[#008060] text-white font-black rounded-xl hover:bg-[#006e52] transition-colors flex justify-center items-center gap-2">
                  {isAdding ? "جاري الإضافة..." : <><CheckCircle size={18} /> حفظ التقييم</>}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}