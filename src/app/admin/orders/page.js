"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDb } from "@/lib/firebase";
import { parseDateToMs } from '@/lib/analytics-helpers';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  orderBy,
  limit,
  startAfter,
  increment,
  updateDoc,
  serverTimestamp
} from "firebase/firestore/lite";
import { useRouter } from 'next/navigation';
import { ShoppingBag, Search, Filter, Monitor, Archive, Layers, ChevronLeft, ChevronRight, Trash2, AlertTriangle, X, Download } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

export default function OrdersListPage() {
  // 🔥 مصدر الحقيقة (الداتا الخام)
  const [allRawOrders, setAllRawOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState('wind'); 
  const [currentPage, setCurrentPage] = useState(1);
  
  const fetchLimit = 20; 
  const itemsPerPage = 20;
  
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false); 
  
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
    const [isArchiveVisible, setIsArchiveVisible] = useState(true); // WIND مرئي افتراضياً
  const [isExporting, setIsExporting] = useState(false);
  const [savingOrderStatus, setSavingOrderStatus] = useState({});

  // 🔥 In-memory cache للتابات — بيمنع إعادة الجلب لو رجعت لتاب اتجلب قبل كده
  const tabCacheRef = useRef({});
  const tabLastVisibleRef = useRef({});

  const router = useRouter();

  // ==========================================
  // 🔥 1. دالة سحب الطلبات (محسنة ومحمية)
  // ==========================================
  // أضف هذا الـ State في الأعلى مع الـ States الأخرى
  const [initialLoadDone, setInitialLoadDone] = useState(false);

 const fetchOrders = useCallback(async (loadMore = false) => {
    if (isLoading) return;

    // ✅ لو مش loadMore وعندنا cache للتاب ده، استخدمه بدون أي read
    if (!loadMore && tabCacheRef.current[activeTab]) {
      setAllRawOrders(tabCacheRef.current[activeTab]);
      setLastVisible(tabLastVisibleRef.current[activeTab] || null);
      setHasMore(false);
      return;
    }

    setIsLoading(true);
    try {
      const db = getDb();
      const currentLastVisible = loadMore ? lastVisible : null;

      let constraints = [
        collection(db, "Orders"),
        orderBy("Created at", "desc"),
        limit(fetchLimit)
      ];

      if (activeTab === 'wind') {
        constraints.push(where("data_source", "==", "WIND_Web"));
      } else if (activeTab === 'shopify') {
        constraints.push(where("data_source", "==", "Shopify_Import"));
      }

      if (loadMore && currentLastVisible) {
        constraints.push(startAfter(currentLastVisible));
      }

      const q = query(...constraints);
      const querySnapshot = await getDocs(q);
      const newDocs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const updatedDocs = loadMore
        ? [...(tabCacheRef.current[activeTab] || []), ...newDocs]
        : newDocs;

      // ✅ احفظ في الـ cache
      tabCacheRef.current[activeTab] = updatedDocs;
      tabLastVisibleRef.current[activeTab] = querySnapshot.docs[querySnapshot.docs.length - 1] || null;

      setAllRawOrders(updatedDocs);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === fetchLimit);

    } catch (err) {
      console.error("WIND Error: Fetch failed", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, lastVisible, isLoading]);

  // ==========================================
  // 🔥 2. التحكم الآمن في التابات (يمنع الـ Loop)
  // ==========================================
  useEffect(() => {
    if (isArchiveVisible && allRawOrders.length === 0 && !isLoading) {
      fetchOrders(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isArchiveVisible]);

 const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setSelectedOrders([]);
    setAllRawOrders([]); 
    setLastVisible(null); 
    setHasMore(true); 
    // لا نحتاج لتغيير initialLoadDone هنا لأن length بقت 0 وده كفاية للـ useEffect
    
    if (tab === 'shopify' || tab === 'all') {
      setIsArchiveVisible(false);
    } else {
      setIsArchiveVisible(true);
    }
  };

  // ==========================================
  // 🔥 3. الفلترة المحلية (0 Reads)
  // ==========================================
  useEffect(() => {
    if ((activeTab === 'shopify' || activeTab === 'all') && !isArchiveVisible) {
      setFilteredOrders([]);
      return;
    }

    let result = allRawOrders.filter(o => o['Financial Status'] !== 'deleted');
    
    const isAbandonedDraft = (o) => {
      return o['Financial Status'] === 'abandoned' || 
             o['Financial Status'] === 'pending_payment' || 
             o.Name?.startsWith('DRAFT-');
    };

    if (activeTab === 'abandoned') {
      result = result.filter(isAbandonedDraft);
    } else {
      result = result.filter(o => !isAbandonedDraft(o));
      if (activeTab === 'shopify') {
        result = result.filter(o => o.data_source === 'Shopify_Import' || !o.data_source);
      } else if (activeTab === 'wind') {
        result = result.filter(o => o.data_source === 'WIND_Web'); 
      }
    }

    if (search) {
      result = result.filter(o => 
        o.Name?.toLowerCase().includes(search.toLowerCase()) || 
        o.Email?.toLowerCase().includes(search.toLowerCase()) ||
        o.Phone?.includes(search)
      );
    }

    result.sort((a, b) => {
      const dateA = new Date(a['Created at'] || 0).getTime();
      const dateB = new Date(b['Created at'] || 0).getTime();
      return dateB - dateA; 
    });

    setFilteredOrders(result);
    setCurrentPage(1); 
  }, [search, activeTab, allRawOrders, isArchiveVisible]);

  // ==========================================
  // دوال الحذف والتصدير الأصلية بتاعتك
  // ==========================================
  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const db = getDb();
      const batch = writeBatch(db);

      const ordersToProcess = allRawOrders.filter(o => selectedOrders.includes(o.id));
      
      let totalAmountToSubtract = 0;
      let totalCountToSubtract = 0;

      ordersToProcess.forEach(order => {
        if (order['Financial Status'] !== 'abandoned') {
          totalAmountToSubtract += Number(order.Total || 0);
          totalCountToSubtract += 1;
        }
        batch.delete(doc(db, "Orders", order.id));
      });

      if (totalCountToSubtract > 0) {
        const settingsRef = doc(db, "settings", "siteSettings");
        batch.update(settingsRef, {
          "counters.orders": increment(-totalCountToSubtract),
          "counters.sales": increment(-totalAmountToSubtract)
        });
      }

      await batch.commit();

      const updated = allRawOrders.filter(o => !selectedOrders.includes(o.id));
      tabCacheRef.current[activeTab] = updated;
      setAllRawOrders(updated);
      setSelectedOrders([]);
      setShowDeleteModal(false);
      
    } catch (error) {
      console.error("WIND Error: Batch delete & decrement failed", error);
      alert("حدث خطأ أثناء الحذف وتحديث الإحصائيات");
    } finally {
      setIsDeleting(false);
    }
  };

  // 🔥 دالة التصدير الذكية: تسحب القسم الكامل عند الضغط فقط
  const exportOrdersToExcel = async () => {
    if (isExporting) return;
    
    // تأكيد من المستخدم لو العدد كبير (اختياري)
    const confirmExport = confirm(`هل تريد تصدير كافة طلبات قسم (${activeTab === 'wind' ? 'موقع ويند' : activeTab === 'abandoned' ? 'السلات المتروكة' : 'الأرشيف'})؟ قد يستغرق ذلك ثواني.`);
    if (!confirmExport) return;

    setIsExporting(true);

    try {
      const db = getDb();
      let allExportData = [];
      let lastDoc = null;
      let fetchMore = true;

      // 1. 🛡️ بناء الاستعلام الموجه للقسم المختار (لتقليل القراءات)
      // ملاحظة: لا نسحب أي بيانات إلا بعد ضغط الزرار
      while (fetchMore) {
        let constraints = [
          collection(db, "Orders"),
          orderBy("Created at", "desc"),
          limit(500) // نسحب دفعات كبيرة (500) لسرعة التنزيل وتقليل عدد الطلبات
        ];

        // توجيه البحث بناءً على السجمنت المفتوح
        if (activeTab === 'wind') {
          constraints.push(where("data_source", "==", "WIND_Web"));
        } else if (activeTab === 'shopify') {
          constraints.push(where("data_source", "==", "Shopify_Import"));
        }

        if (lastDoc) constraints.push(startAfter(lastDoc));

        const q = query(...constraints);
        const snap = await getDocs(q);

        if (snap.empty) {
          fetchMore = false;
        } else {
          const docsData = snap.docs.map(doc => doc.data());
          allExportData = [...allExportData, ...docsData];
          lastDoc = snap.docs[snap.docs.length - 1];
          
          // لو الدفعة أقل من 500 يبقى خلصنا كل الداتا اللي في السيرفر للقسم ده
          if (snap.docs.length < 500) fetchMore = false;
        }
      }

      // 2. 🔍 الفلترة النهائية (لضمان استبعاد المحذوف والسلات المتروكة بدقة)
      const isAbandonedDraft = (o) => (
        o['Financial Status'] === 'abandoned' || 
        o['Financial Status'] === 'pending_payment' || 
        o.Name?.startsWith('DRAFT-')
      );

      let finalFilteredData = allExportData.filter(o => {
        if (o['Financial Status'] === 'deleted') return false;
        
        if (activeTab === 'abandoned') return isAbandonedDraft(o);
        if (activeTab === 'wind') return !isAbandonedDraft(o) && o.data_source === 'WIND_Web';
        if (activeTab === 'shopify') return !isAbandonedDraft(o) && (o.data_source === 'Shopify_Import' || !o.data_source);
        return !isAbandonedDraft(o); // لحالة 'all'
      });

      if (finalFilteredData.length === 0) {
        alert("لا توجد بيانات لتصديرها في هذا القسم.");
        setIsExporting(false);
        return;
      }

      // 3. 📄 توليد ملف الـ CSV
      const headers = ["Order Number,Date,Customer Name,Email,Phone,Product,Quantity,Total,Status,Source"];
      const rows = finalFilteredData.map(o => {
        const isWind = o.data_source === 'WIND_Web';
        const orderLink = isWind ? (o.Name || '') : (o.Name?.replace('#', '') || '');
        const date = o['Created at']?.split(' ')[0] || o['Created at'] || '';
        const customerName = (o['Billing Name'] || 'عميل مجهول').replace(/"/g, '""');
        const email = (o.Email || '').toLowerCase();
        const phone = (o.Phone || o['Shipping Phone'] || '').replace(/[^0-9+]/g, '');
        const product = (isWind ? (o.lineItems?.[0]?.name || '') : (o['Lineitem name'] || '')).replace(/"/g, '""');
        const qty = isWind ? (o.lineItems?.[0]?.quantity || 1) : (o['Lineitem quantity'] || 1);
        const total = o.Total || 0;
        const status = o['Financial Status'] || '';
        const source = o.data_source || 'Shopify_Import';

        return `"${orderLink}","${date}","${customerName}","${email}","${phone}","${product}","${qty}","${total}","${status}","${source}"`;
      });

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.concat(rows).join("\n");
      const link = document.createElement("a");
      link.href = encodeURI(csvContent);
      link.download = `WIND_${activeTab}_Full_Export.csv`;
      link.click();

    } catch (error) {
      console.error("Critical Export Error:", error);
      alert("حدث خطأ أثناء سحب البيانات الكاملة من السيرفر.");
    } finally {
      setIsExporting(false);
    }
  };

  
  // ألوان حالة الدفع
  const getStatusColor = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';

      case 'pending':
      case 'pending_payment':
        return 'bg-orange-100 text-orange-800 border-orange-200';

      case 'partially_paid':
      case 'authorized':
        return 'bg-blue-100 text-blue-800 border-blue-200';

      case 'refunded':
      case 'partially_refunded':
      case 'voided':
        return 'bg-red-100 text-red-800 border-red-200';

      case 'abandoned':
        return 'bg-gray-100 text-gray-500 border-gray-200';

      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // ألوان حالة التجهيز والشحن
  const getShippingStatusColor = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'unfulfilled':
      case 'not_shipped':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';

      case 'processing':
      case 'ready_to_ship':
        return 'bg-orange-100 text-orange-800 border-orange-200';

      case 'shipped':
      case 'handed_to_courier':
      case 'in_transit':
      case 'out_for_delivery':
        return 'bg-blue-100 text-blue-800 border-blue-200';

      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-200';

      case 'delivery_failed':
      case 'returned':
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';

      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // تنسيق التاريخ وفق توقيت القاهرة دون أي قراءة إضافية
  const formatRelativeOrderDate = (rawDate) => {
    const timestamp = parseDateToMs(rawDate);

    if (!Number.isFinite(timestamp)) {
      return rawDate || 'غير مسجل';
    }

    const date = new Date(timestamp);
    const now = new Date();

    const cairoDayNumber = (value) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(value);

      const getPart = (type) =>
        Number(parts.find(part => part.type === type)?.value);

      return Math.floor(
        Date.UTC(
          getPart('year'),
          getPart('month') - 1,
          getPart('day')
        ) / 86400000
      );
    };

    const difference = cairoDayNumber(now) - cairoDayNumber(date);

    const time = date.toLocaleTimeString('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      minute: '2-digit'
    });

    if (difference <= 0) {
      return `اليوم في ${time}`;
    }

    if (difference === 1) {
      return `أمس في ${time}`;
    }

    if (difference < 7) {
      const days = difference === 2
        ? 'يومين'
        : `${difference} أيام`;

      return `منذ ${days} • ${time}`;
    }

    if (difference < 30) {
      const weeks = Math.floor(difference / 7);

      const label = weeks === 1
        ? 'أسبوع'
        : weeks === 2
          ? 'أسبوعين'
          : `${weeks} أسابيع`;

      return `منذ ${label} • ${time}`;
    }

    if (difference < 365) {
      const months = Math.floor(difference / 30);

      const label = months === 1
        ? 'شهر'
        : months === 2
          ? 'شهرين'
          : `${months} شهور`;

      return `منذ ${label} • ${time}`;
    }

    const years = Math.floor(difference / 365);

    const label = years === 1
      ? 'سنة'
      : years === 2
        ? 'سنتين'
        : `${years} سنوات`;

    return `منذ ${label} • ${time}`;
  };

  // قراءة حالة الشحن من الحقل الجديد أو الحقل القديم
  const getShippingStatusValue = (order) => {
    if (order.shippingStatus) return order.shippingStatus;

    const fulfillment = String(
      order['Fulfillment Status'] ||
      order.fulfillment_status ||
      order['Fulfillment'] ||
      ''
    ).toLowerCase();

    if (fulfillment === 'fulfilled') return 'shipped';

    if (
      fulfillment === 'partial' ||
      fulfillment === 'partially_fulfilled'
    ) {
      return 'processing';
    }

    return 'unfulfilled';
  };


  // حفظ تغيير حالة الطلب مباشرة دون قراءة جديدة
  const handleInlineStatusChange = async (order, field, value) => {
    if (!order?.id) return;

    const paymentMethod = String(
      order['Payment Method'] || ''
    ).toLowerCase();

    const financialStatus = String(
      order['Financial Status'] || ''
    ).toLowerCase();

    // لا نسمح بالتعديل اليدوي على الدفع الإلكتروني
    // لأن Kashier هو مصدر تأكيد الدفع
    if (
      field === 'Financial Status' &&
      (
        paymentMethod === 'card' ||
        financialStatus === 'pending_payment' ||
        financialStatus === 'abandoned'
      )
    ) {
      return;
    }

    const savingKey = `${order.id}:${field}`;

    if (savingOrderStatus[savingKey]) return;

    setSavingOrderStatus(prev => ({
      ...prev,
      [savingKey]: true
    }));

    try {
      await updateDoc(
        doc(getDb(), 'Orders', order.id),
        {
          [field]: value,
          statusUpdatedAt: serverTimestamp()
        }
      );

      setAllRawOrders(prev => {
        const updated = prev.map(item =>
          item.id === order.id
            ? { ...item, [field]: value }
            : item
        );

        // تحديث الـ cache نفسه حتى لا تظهر الحالة القديمة عند العودة للتاب
        tabCacheRef.current[activeTab] = updated;

        return updated;
      });

    } catch (error) {
      console.error('WIND Inline Order Status Error:', error);

      window.alert(
        error?.code === 'permission-denied'
          ? 'قواعد Firebase لا تسمح بتحديث هذا الطلب.'
          : 'تعذر حفظ الحالة. حاول مرة أخرى.'
      );

    } finally {
      setSavingOrderStatus(prev => {
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;

  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchOrders(true);
    }
  };

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans text-[#202223]" dir="rtl">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <ShoppingBag className="text-[#008060]" /> جميع الطلبات
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm hidden sm:block">
              إجمالي المعروض: <span className="text-[#008060] font-black">{filteredOrders.length}</span> طلب
            </span>
            <button 
              onClick={exportOrdersToExcel} 
              disabled={isExporting}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              {isExporting ? <span className="animate-spin h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full"></span> : <Download size={16} />}
              {isExporting ? 'جاري السحب...' : 'تصدير الطلبات'}
            </button>
            {hasMore && (activeTab === 'wind' || activeTab === 'abandoned' || isArchiveVisible) && (
              <button 
                onClick={loadMore}
                disabled={isLoading}
                className="bg-[#008060] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-[#006e52] transition-all disabled:opacity-50"
              >
                {isLoading ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> : <Download size={16} />}
                تحميل المزيد
              </button>
            )}
          </div>
        </div>

        {/* أزرار التنقل بين التابات */}
        <div className="flex gap-2 sm:gap-6 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-hide">
          <button onClick={() => handleTabChange('wind')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'wind' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Monitor size={16}/> طلبات موقع WIND
          </button>
          <button onClick={() => handleTabChange('abandoned')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'abandoned' ? 'border-b-2 text-red-600 border-red-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Archive size={16}/> سلات متروكة
          </button>
          <button onClick={() => handleTabChange('shopify')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'shopify' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Archive size={16}/> أرشيف شوبيفاي
          </button>
          <button onClick={() => handleTabChange('all')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'all' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Layers size={16}/> كل الطلبات
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          {((activeTab === 'shopify' || activeTab === 'all') && !isArchiveVisible) ? (
            <div className="p-24 text-center bg-gray-50/20 animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Archive size={40} className="text-gray-300" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">أرشيف الطلبات الضخم</h3>
              <p className="text-sm text-gray-400 mb-8 max-w-sm mx-auto leading-relaxed">
                تم إيقاف التحميل التلقائي لهذا القسم لتوفير قراءات الفايربيز. اضغط للسحب اليدوي بنظام 20 بـ 20.
              </p>
              <button 
                type="button"
                onClick={() => setIsArchiveVisible(true)}
                className="bg-[#008060] text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:bg-[#006e52] transition-all transform hover:scale-105 active:scale-95"
              >
                إظهار البيانات الآن
              </button>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 bg-gray-50/50">
                <div className="relative flex-1">
                  <Search className="absolute right-4 top-3.5 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="ابحث برقم الطلب، أو الهاتف..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                    className="w-full pr-12 pl-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#008060] transition-all shadow-sm" 
                  />
                </div>
                <div className="flex items-center gap-2">
                  {selectedOrders.length > 0 && (
                    <button 
                      onClick={() => setShowDeleteModal(true)}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-all shadow-sm"
                    >
                      <Trash2 size={16} /> حذف ({selectedOrders.length})
                    </button>
                  )}
                  <button className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all shadow-sm">
                    <Filter size={16} /> فلاتر
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse min-w-[1150px]">
                  <thead>
                    <tr className="bg-white border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                      <th className="px-6 py-5 w-12 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-[#008060] rounded cursor-pointer"
                          checked={currentOrders.length > 0 && selectedOrders.length === currentOrders.length}
                          onChange={(e) => {
                            if(e.target.checked) setSelectedOrders(currentOrders.map(o => o.id));
                            else setSelectedOrders([]);
                          }}
                        />
                      </th>
                                            <th className="px-5 py-5">رقم الطلب</th>
                      <th className="px-5 py-5">التاريخ</th>
                      <th className="px-5 py-5">العميل</th>
                      <th className="px-5 py-5 text-center">الإجمالي</th>
                      <th className="px-5 py-5 text-center">حالة الدفع</th>
                      <th className="px-5 py-5 text-center">حالة الشحن</th>
                      <th className="px-5 py-5 text-center">القطع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-sans">
                    {isLoading && currentOrders.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center py-20 text-[#008060] font-black animate-pulse">جاري سحب الداتا...</td>
                      </tr>
                    ) : currentOrders.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center py-24 text-gray-400">
                          <Archive size={40} className="mx-auto mb-3 opacity-20"/>
                          <p className="font-bold">لا توجد طلبات في هذا القسم</p>
                        </td>
                      </tr>
                    ) : (
                      currentOrders.map((order) => {
                        const isWind = order.data_source === 'WIND_Web';
const orderLink = isWind ? order.Name : order.Name.replace('#', '');

// بيانات المنتجات الموجودة داخل الطلب بالفعل — دون أي قراءة جديدة
const orderItems = Array.isArray(order.lineItems) ? order.lineItems : [];

// إجمالي القطع فقط دون أسماء أو تفاصيل المنتجات
const totalPieces = orderItems.length
  ? orderItems.reduce((sum, item) => {
      const qty = Number(item.quantity ?? item.qty ?? 1);
      return sum + (
        Number.isFinite(qty) && qty > 0 ? qty : 1
      );
    }, 0)
  : Math.max(0, Number(order['Lineitem quantity']) || 0);

// قراءة المبلغ النهائي الذي سيدفعه العميل
const toOrderAmount = (value) => {
  const parsed = Number(
    String(value ?? 0)
      .replace(/,/g, '')
      .replace(/[^\d.-]/g, '')
  );

  return Number.isFinite(parsed) ? parsed : 0;
};

const orderTotalValue = toOrderAmount(order.Total);

return (
                          <tr key={order.id} className="hover:bg-gray-50/80 transition-all cursor-pointer group" onClick={() => router.push(`/admin/orders/${encodeURIComponent(orderLink)}`)}>
                            <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 accent-[#008060] rounded cursor-pointer"
                                checked={selectedOrders.includes(order.id)}
                                onChange={(e) => {
                                  if(e.target.checked) setSelectedOrders(prev => [...prev, order.id]);
                                  else setSelectedOrders(prev => prev.filter(id => id !== order.id));
                                }}
                              />
                            </td>
                            
                            {/* رقم الطلب */}
                            <td className="px-5 py-4">
                              <p className="text-sm font-black text-[#005bd3] group-hover:underline whitespace-nowrap">
                                {order.displayOrderNumber || order.Name || order.id}
                              </p>
                            </td>

                            {/* التاريخ والوقت */}
                            <td className="px-5 py-4">
                              <p className="text-xs text-gray-600 font-medium whitespace-nowrap" dir="auto">
                                {formatRelativeOrderDate(order['Created at'])}
                              </p>
                            </td>

                            {/* اسم العميل فقط */}
                            <td className="px-5 py-4">
                              <p className="text-sm font-bold text-gray-900 whitespace-nowrap">
                                {order['Billing Name'] || 'عميل مجهول'}
                              </p>
                            </td>

                            {/* الإجمالي النهائي فقط */}
                            <td className="px-5 py-4 text-center">
  <p className="text-sm font-black text-gray-900 whitespace-nowrap" dir="ltr">
    {orderTotalValue.toLocaleString('en-EG')} {order.Currency || 'EGP'}
  </p>
</td>

                            {/* حالة الدفع */}
                            <td
                              className="px-3 py-4 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const paymentMethod = String(
                                  order['Payment Method'] || ''
                                ).toLowerCase();

                                const currentFinancialStatus =
                                  String(order['Financial Status'] || 'pending').toLowerCase();

                                const isCardPayment =
                                  paymentMethod === 'card' ||
                                  currentFinancialStatus === 'pending_payment';

                                const isAbandoned =
                                  currentFinancialStatus === 'abandoned';

                                const isFinancialReadOnly = [
                                  'refunded',
                                  'partially_refunded',
                                  'voided',
                                  'authorized'
                                ].includes(currentFinancialStatus);

                                const specialPaymentLabels = {
                                  pending_payment: 'بانتظار الدفع الإلكتروني',
                                  abandoned: 'سلة متروكة',
                                  refunded: 'مسترد',
                                  partially_refunded: 'مسترد جزئياً',
                                  voided: 'ملغي مالياً',
                                  authorized: 'تم اعتماد الدفع'
                                };

                                return (
                                  <div className="flex flex-col items-center gap-1">
                                    <select
                                      value={currentFinancialStatus}
                                      disabled={
                                        isCardPayment ||
                                        isAbandoned ||
                                        isFinancialReadOnly ||
                                        Boolean(savingOrderStatus[`${order.id}:Financial Status`])
                                      }
                                      onChange={(e) =>
                                        handleInlineStatusChange(
                                          order,
                                          'Financial Status',
                                          e.target.value
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      className={`w-full min-w-[135px] max-w-[165px] border rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-[#008060] disabled:opacity-70 disabled:cursor-not-allowed ${
                                        getStatusColor(currentFinancialStatus)
                                      }`}
                                    >
                                      <option value="pending">بانتظار الدفع</option>
                                      <option value="paid">مدفوع</option>
                                      <option value="partially_paid">مدفوع جزئياً</option>

                                      {![
                                        'pending',
                                        'paid',
                                        'partially_paid'
                                      ].includes(currentFinancialStatus) && (
                                        <option value={currentFinancialStatus}>
                                          {specialPaymentLabels[currentFinancialStatus] || currentFinancialStatus}
                                        </option>
                                      )}
                                    </select>

                                    {isCardPayment && (
                                      <span className="text-[9px] text-gray-400">
                                        من Kashier
                                      </span>
                                    )}

                                    {savingOrderStatus[`${order.id}:Financial Status`] && (
                                      <span className="text-[10px] text-gray-400">
                                        جارٍ الحفظ...
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* حالة التجهيز والشحن */}
                            <td
                              className="px-3 py-4 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const shippingStatus = getShippingStatusValue(order);

                                return (
                                  <div className="flex flex-col items-center gap-1">
                                    <select
                                      value={shippingStatus}
                                      disabled={Boolean(savingOrderStatus[`${order.id}:shippingStatus`])}
                                      onChange={(e) =>
                                        handleInlineStatusChange(
                                          order,
                                          'shippingStatus',
                                          e.target.value
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      className={`w-full min-w-[155px] max-w-[185px] border rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-[#008060] disabled:opacity-60 disabled:cursor-not-allowed ${getShippingStatusColor(shippingStatus)}`}
                                    >
                                      <option value="unfulfilled">لم يتم التجهيز</option>
                                      <option value="processing">قيد التجهيز</option>
                                      <option value="ready_to_ship">جاهز للشحن</option>
                                      <option value="not_shipped">لم يتم الشحن</option>
                                      <option value="shipped">تم الشحن</option>
                                      <option value="handed_to_courier">لدى شركة الشحن</option>
                                      <option value="in_transit">الشحنة في الطريق</option>
                                      <option value="out_for_delivery">خرج للتوصيل</option>
                                      <option value="delivered">تم التسليم</option>
                                      <option value="delivery_failed">تعذر التسليم</option>
                                      <option value="returned">مرتجع</option>
                                      <option value="cancelled">ملغي</option>
                                    </select>

                                    {savingOrderStatus[`${order.id}:shippingStatus`] && (
                                      <span className="text-[10px] text-gray-400">
                                        جارٍ الحفظ...
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* عدد القطع فقط */}
                            <td className="px-5 py-4 text-center">
                              <span className="text-sm font-bold text-gray-800 whitespace-nowrap">
                                {totalPieces} {totalPieces === 1 ? 'قطعة' : 'قطع'}
                              </span>
                            </td>

                            
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredOrders.length > 0 && (
                <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <p className="text-xs font-bold text-gray-500">
                    صفحة <span className="text-black">{currentPage}</span> من اصل <span className="text-black">{totalPages}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-all"><ChevronRight size={18} /></button>
                    <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-all"><ChevronLeft size={18} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm slide-down">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
              <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 left-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"><X size={16} /></button>
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 mx-auto"><AlertTriangle size={28} /></div>
              <h3 className="text-xl font-black text-center text-gray-900 mb-2">تأكيد الحذف</h3>
              <p className="text-sm text-gray-500 text-center mb-6">هل أنت متأكد من حذف ({selectedOrders.length}) طلب نهائياً؟</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-800 font-bold rounded-xl">إلغاء</button>
                <button onClick={handleDeleteSelected} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                  {isDeleting ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> : 'نعم، احذف'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}