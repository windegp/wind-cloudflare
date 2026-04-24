"use client";

import React, { useState, useEffect, useRef } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, deleteDoc, doc, writeBatch, orderBy, updateDoc, setDoc, increment, where, limit, startAfter } from "firebase/firestore/lite";
import Papa from 'papaparse';
import { mutate } from 'swr';
import { Star, Upload, Plus, MessageSquare, CheckCircle, X, Trash2, Calendar, Save, Heart, Eye, Loader2 } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

export default function ReviewsAdminPage() {
  const [reviews, setReviews] = useState([]);
  const [products, setProducts] = useState([]);
  const [productStats, setProductStats] = useState({}); // لتخزين العدادات الذكية
  const [selectedProductReviews, setSelectedProductReviews] = useState([]); // لتقييمات المنتج المختار
  const [loadingReviews, setLoadingReviews] = useState(false); 
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  // حالة الإعجابات (للتعديل المباشر من الجدول)
  const [editingLikes, setEditingLikes] = useState({});
  const [savingLikes, setSavingLikes] = useState(null);

  // حالات النوافذ المنبثقة
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedProductForReviews, setSelectedProductForReviews] = useState(null); // لفتح نافذة التقييمات
  const [lastReviewDoc, setLastReviewDoc] = useState(null); // عشان نعرف وقفنا فين في السحب
  const [hasMoreReviews, setHasMoreReviews] = useState(false); // عشان نظهر أو نخفي زرار "المزيد"
  const [loadingMore, setLoadingMore] = useState(false); // أنيميشن زرار المزيد
  const [isRecalculating, setIsRecalculating] = useState(false); // أنيميشن زرار الطوارئ

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
    const db = getDb();
    try {
      // 🔥 إلغاء كاش المتصفح نهائياً لصفحة الأدمن لضمان رؤية التقييمات الجديدة فوراً بعد الـ Refresh
      const [pSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, "products"), limit(1000))),
        getDocs(query(collection(db, "ProductStats"), limit(1000)))
      ]);
      const pDocs = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), handle: doc.data().handle || doc.id }));
      const statsMap = {};
      sSnap.docs.forEach(doc => { statsMap[doc.id] = doc.data(); });
      setProducts(pDocs);
      setProductStats(statsMap);
      const likesState = {};
      pDocs.forEach(p => likesState[p.id] = p.likesCount);
      setEditingLikes(likesState);
      
      const rQuery = query(collection(db, "Reviews"), orderBy("date", "desc"), limit(20));
      const rSnap = await getDocs(rQuery);
      setReviews(rSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) { 
      console.error("Fetch Error:", err); 
    } finally {
      setLoading(false);
    }
  };
  const fetchProducts = async () => {
    try {
      const db = getDb();
      // 🔥 وضع صمام أمان (Limit 1000) لمنع استنزاف الكوتا
      const q = query(collection(db, "products"), limit(1000));
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
      // سحب آخر 20 تقييم فقط بدل الكل
      const q = query(collection(db, "Reviews"), orderBy("date", "desc"), limit(20)); 
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

      // مسح KV Cache + تحديث فوري للواجهة
      try {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'likes',
            id: productId,
            handle: productToUpdate.handle || productId
          })
        });
        sessionStorage.removeItem(`wind_stats_${productToUpdate.handle || productId}`);
        mutate('homepage/data');
        mutate('homepage-products-sections');
      } catch (e) {
        console.error("WIND Likes Revalidate Error:", e);
      }

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
          const statsUpdates = {}; 

          results.data.forEach((row) => {
            if (row.body && row.rating && row.product_handle) {
              const pHandle = row.product_handle.trim();
              const pRating = Number(row.rating);
              const reviewRef = doc(collection(db, "Reviews"));

              batch.set(reviewRef, {
                productHandle: pHandle,
                reviewerName: row.reviewer_name || "عميل WIND",
                rating: pRating,
                text: row.body,
                date: new Date().toISOString(),
                status: "published",
                imageUrls: row.picture_urls ? row.picture_urls.split(',') : [],
                source: "csv_import"
              });

              if (!statsUpdates[pHandle]) {
                statsUpdates[pHandle] = { count: 0, sum: 0 };
              }
              statsUpdates[pHandle].count += 1;
              statsUpdates[pHandle].sum += pRating;
              count++;
            }
          });

          Object.keys(statsUpdates).forEach((handle) => {
            const statsRef = doc(db, "ProductStats", handle);
            batch.set(statsRef, {
              totalCount: increment(statsUpdates[handle].count),
              totalRatingSum: increment(statsUpdates[handle].sum)
            }, { merge: true });
          });

          if (count > 0) {
            await batch.commit();
            // 🔥 مسح الكاش وسحب الداتا من جديد عشان كل المنتجات تتحدث أوتوماتيك
            localStorage.removeItem("wind_admin_data_cache");
            fetchData();
            
            // 🔥 مسح KV Cache + تحديث فوري لكل المنتجات المتأثرة
            const affectedHandles = Object.keys(statsUpdates);
            try {
              await Promise.all(affectedHandles.map(async (pHandle) => {
                const productId = products.find(p => p.handle === pHandle)?.id || pHandle;
                await fetch('/api/revalidate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'product_stats',
                    handle: pHandle,
                    id: productId
                  })
                });
                sessionStorage.removeItem(`wind_stats_${pHandle}`);
              }));
              // تحديث فوري لكل الـ SWR caches
              mutate('homepage/data');
              mutate('homepage-reviews');
              mutate('homepage-products-sections');
              // تحديث كل المنتجات المتأثرة
              affectedHandles.forEach(pHandle => {
                const productId = products.find(p => p.handle === pHandle)?.id || pHandle;
                mutate(`product-${productId}`);
              });
            } catch (e) {
              console.error("WIND CSV Revalidate Error:", e);
            }
            
            alert(`تم رفع ${count} تقييم وتحديث إحصائيات ${affectedHandles.length} منتج بدقة ✅`);
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
      const db = getDb();
      const batch = writeBatch(db);
      const finalISODate = new Date(newReview.reviewDate).toISOString();
      const pHandle = newReview.productHandle.trim();
      const pRating = Number(newReview.rating);

      // 1. حجز مكان للتقييم الجديد
      const reviewRef = doc(collection(db, "Reviews"));
      batch.set(reviewRef, {
        productHandle: pHandle,
        reviewerName: newReview.reviewerName || "عميل WIND",
        rating: pRating,
        text: newReview.text,
        date: finalISODate,
        status: "published",
        imageUrls: newReview.imageUrl ? [newReview.imageUrl] : [],
        source: "manual"
      });

      // 2. تحديث العداد في فايربيز
      const statsRef = doc(db, "ProductStats", pHandle);
      batch.set(statsRef, {
        totalCount: increment(1),
        totalRatingSum: increment(pRating)
      }, { merge: true });

      await batch.commit();

      // 🔥 3. التحديث الفوري للجدول (عشان الرقم تحت النجوم يزيد في لحظتها)
      setProductStats(prev => ({
        ...prev,
        [pHandle]: {
          ...prev[pHandle],
          totalCount: (prev[pHandle]?.totalCount || 0) + 1,
          totalRatingSum: (prev[pHandle]?.totalRatingSum || 0) + pRating
        }
      }));

      // 🔥 4. مسح KV Cache + تحديث فوري للواجهة (مثل likes)
      const productId = products.find(p => p.handle === pHandle)?.id || pHandle;
      try {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'product_stats',
            handle: pHandle,
            id: productId
          })
        });
        sessionStorage.removeItem(`wind_stats_${pHandle}`);
        mutate('homepage/data');
        mutate('homepage-reviews');
        mutate('homepage-products-sections');
        mutate(`product-${productId}`);
      } catch (e) {
        console.error("WIND Revalidate Error:", e);
      }

      // 🔥 5. مسح الكاش المحلي
      localStorage.removeItem("wind_admin_data_cache");

      setShowAddModal(false);
      setNewReview({ productHandle: '', reviewerName: '', rating: 5, text: '', imageUrl: '', reviewDate: new Date().toISOString().split('T')[0] });
      alert("تمت إضافة التقييم وتحديث الإحصائيات بنجاح!");
    } catch (error) {
      console.error("Error adding review:", error);
      alert("حدث خطأ أثناء الإضافة.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleViewProductReviews = async (product) => {
    if (!product) return;
    setSelectedProductForReviews(product);
    setLoadingReviews(true);
    try {
      const db = getDb();
      // 🔥 سحب 3 تقييمات فقط
      const q = query(collection(db, "Reviews"), where("productHandle", "==", product.handle), orderBy("date", "desc"), limit(3));
      const snap = await getDocs(q);
      setSelectedProductReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // حفظ آخر تقييم عشان نبدا منه المرة الجاية
      setLastReviewDoc(snap.docs[snap.docs.length - 1]);
      setHasMoreReviews(snap.docs.length === 3); 
    } catch (e) { 
      console.error("Error fetching product reviews:", e); 
    } finally {
      setLoadingReviews(false); 
    }
  };

  // 🔥 دالة سحب المزيد من التقييمات (الـ 3 اللي بعدهم)
  const handleLoadMoreReviews = async () => {
    if (!lastReviewDoc || !selectedProductForReviews) return;
    setLoadingMore(true);
    try {
      const db = getDb();
      const q = query(
        collection(db, "Reviews"), 
        where("productHandle", "==", selectedProductForReviews.handle), 
        orderBy("date", "desc"), 
        startAfter(lastReviewDoc), 
        limit(3)
      );
      const snap = await getDocs(q);
      const newDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setSelectedProductReviews(prev => [...prev, ...newDocs]); // إضافة الجديد على القديم
      setLastReviewDoc(snap.docs[snap.docs.length - 1]);
      setHasMoreReviews(snap.docs.length === 3); // لو جاب 3 يبقى غالباً لسه فيه تاني
    } catch (e) { console.error(e); } finally { setLoadingMore(false); }
  };

  const handleDeleteReview = async (id, productHandle, reviewRating) => {
    if(!window.confirm("هل أنت متأكد؟ سيتم تحديث إحصائيات المنتج أوتوماتيكياً.")) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, "Reviews", id));

      const statsRef = doc(db, "ProductStats", productHandle);
      await setDoc(statsRef, {
        totalCount: increment(-1),
        totalRatingSum: increment(-Number(reviewRating))
      }, { merge: true });
      
      // 🔥 إشارة WIND الموحدة: تحديث إحصائيات المنتج والصفحات المرتبطة فوراً
      // استخدام selectedProductForReviews.id (Firestore doc ID) للـ product cache
      const productId = selectedProductForReviews?.id || productHandle;
      try {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'product_stats',
            handle: productHandle,
            id: productId
          })
        });
        sessionStorage.removeItem(`wind_stats_${productHandle}`);
        mutate('homepage/data');
        mutate('homepage-products-sections');
        mutate('homepage-reviews');
        mutate(`product-${productId}`);
      } catch (e) {
        console.error("WIND Cache Revalidate Error:", e);
      }

      // تحديث المودال
      setSelectedProductReviews(prev => prev.filter(r => r.id !== id));
      
      // تحديث الجدول فوراً 
      setProductStats(prev => ({
        ...prev,
        [productHandle]: {
          ...prev[productHandle],
          totalCount: Math.max(0, (prev[productHandle]?.totalCount || 1) - 1),
          totalRatingSum: Math.max(0, (prev[productHandle]?.totalRatingSum || reviewRating) - Number(reviewRating))
        }
      }));

      // 🔥 مسح الكاش عشان الأرقام القديمة مترجعش بعد الريفريش
      localStorage.removeItem("wind_admin_data_cache");

      alert("تم الحذف وتحديث الإحصائيات بنجاح!");
    } catch (error) { console.error("Error deleting:", error); }
  };

  // 🔥 زر الطوارئ: إعادة حساب وتصحيح جميع إحصائيات المنتجات من الصفر
  const recalculateAllProductStats = async () => {
    if (!window.confirm("تحذير: هل أنت متأكد من مزامنة جميع التقييمات؟ ستقوم هذه العملية بجمع النجوم الحقيقية من قاعدة البيانات وإعادة ضبط الإحصائيات لجميع المنتجات.")) return;
    
    setIsRecalculating(true);
    try {
      const db = getDb();
      // 1. جلب جميع التقييمات
      const reviewsSnap = await getDocs(query(collection(db, "Reviews")));
      const allReviews = reviewsSnap.docs.map(d => d.data());

      // 2. تجميع النجوم والعدد لكل منتج بدقة
      const statsMap = {};
      allReviews.forEach(rev => {
        const h = rev.productHandle;
        if (h) {
          if (!statsMap[h]) statsMap[h] = { count: 0, sum: 0 };
          statsMap[h].count += 1;
          statsMap[h].sum += Number(rev.rating || 5);
        }
      });

      // 3. تحديث الإحصائيات باستخدام Batch لضمان السرعة وتوفير الكوتا
      const batch = writeBatch(db);
      Object.keys(statsMap).forEach((handle) => {
        const sRef = doc(db, "ProductStats", handle);
        batch.set(sRef, {
          totalCount: statsMap[handle].count,
          totalRatingSum: statsMap[handle].sum,
        }, { merge: true });
      });
      
      if (Object.keys(statsMap).length > 0) {
        await batch.commit();
      }

      // تحديث واجهة الأدمن
      localStorage.removeItem("wind_admin_data_cache");
      fetchData();
      
      alert("🚀 تمت عملية المزامنة بنجاح! جميع التقييمات والنجوم مطابقة الآن لقاعدة البيانات.");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء مزامنة التقييمات.");
    } finally {
      setIsRecalculating(false);
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
            <MessageSquare className="text-[#008060]" /> 
            <span>إدارة التقييمات والإعجابات</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            
            {/* 🔥 زر مزامنة التقييمات (الطوارئ) */}
            <button 
              onClick={recalculateAllProductStats} 
              disabled={isRecalculating} 
              className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-100 transition-all shadow-sm"
            >
              {isRecalculating ? <Loader2 size={16} className="animate-spin" /> : <span className="font-bold text-lg">↻</span>}
              مزامنة التقييمات
            </button>

            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="bg-white border border-[#008060] text-[#008060] px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-50 transition-all shadow-sm">
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
                {loading ? (
                  <tr><td colSpan="5" className="text-center py-10">جاري التحميل...</td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-10 text-gray-400 font-bold">لا توجد منتجات حالياً</td></tr>
                ) : (
                  products.map((p) => {
                    const stats = productStats[p.handle] || { totalCount: 0, totalRatingSum: 0 };
                    const count = stats.totalCount || 0;
                    const avgRating = count > 0 ? (stats.totalRatingSum / count).toFixed(1) : "0.0";
                    const isLikesChanged = editingLikes[p.id] !== undefined && editingLikes[p.id] != p.likesCount;

                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-all">
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-[#1A1A1A] block mb-1 line-clamp-1">{p.title}</span>
                          <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">{p.handle}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 bg-[#FFF8D6] text-[#8A6D00] border border-[#FFE885] px-2.5 py-1 rounded-md text-xs font-black">
                              {avgRating} <Star size={12} fill="currentColor" /> 
                            </div>
                            <span className="text-[11px] text-gray-500 font-bold">({count} تقييم)</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
  <div className="flex flex-wrap gap-1 justify-center">
    {/* فلترة التقييمات الـ 20 اللي حملناهم عشان نعرف مصدر المنتج ده إيه */}
    {reviews.filter(r => r.productHandle === p.handle).length > 0 
      ? [...new Set(reviews.filter(r => r.productHandle === p.handle).map(r => r.source === 'manual' ? 'يدوي' : 'CSV'))].map((src, i) => (
          <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-bold">
            {src}
          </span>
        ))
      : <span className="text-[10px] text-gray-400">---</span>
    }
  </div>
</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative">
                              <Heart size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-400" />
                              <input 
                                type="number" 
                                value={editingLikes[p.id] !== undefined ? editingLikes[p.id] : p.likesCount}
                                onChange={(e) => setEditingLikes({...editingLikes, [p.id]: e.target.value})}
                                className="w-20 pl-2 pr-7 py-1.5 text-center bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none"
                              />
                            </div>
                            {isLikesChanged && (
                              <button onClick={() => handleUpdateLikes(p.id)} className="text-red-600 p-1.5 hover:bg-red-50 rounded-lg">
                                {savingLikes === p.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => handleViewProductReviews(p)}
                            disabled={count === 0}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 w-full mx-auto transition-colors ${count > 0 ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                          >
                            {loadingReviews && selectedProductForReviews?.id === p.id ? <Loader2 size={14} className="animate-spin" /> : <><Eye size={14} /> عرض التقييمات</>}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
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
                    {selectedProductReviews.length === 0 ? (
                      <tr><td colSpan="4" className="text-center py-10 text-gray-400">لا توجد تقييمات مسجلة</td></tr>
                    ) : (
                      selectedProductReviews.map((review) => {
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
                              <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">المصدر: {review.source === 'manual' ? 'يدوي' : 'CSV'}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => handleDeleteReview(review.id, review.productHandle, review.rating)} className="text-red-400 hover:text-red-600">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {hasMoreReviews && (
                <div className="p-4 bg-[#FAF9F6] border-t border-gray-100 flex justify-center">
                  <button 
                    onClick={handleLoadMoreReviews} 
                    disabled={loadingMore} 
                    className="px-6 py-2.5 bg-white text-[#008060] font-bold text-xs rounded-xl border border-[#008060] hover:bg-green-50 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    عرض المزيد من التقييمات
                  </button>
                </div>
              )}
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