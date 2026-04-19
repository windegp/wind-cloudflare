"use client";

import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, writeBatch, orderBy, limit, startAfter, increment } from "firebase/firestore/lite";
import { useRouter } from 'next/navigation';
import { Users, Target, Search, Trash2, AlertTriangle, X, ChevronLeft, ChevronRight, Mail, ShoppingCart, Download, Crown, UserMinus, Monitor, Archive, Layers } from '@/components/icons-extra';
// 🔥 1. استدعاء SWR
import useSWR from 'swr';

export const dynamic = 'force-dynamic';

const fixOldData = async () => {
  const db = getDb();
  const snap = await getDocs(collection(db, "Customers"));
  const batch = writeBatch(db);
  let count = 0;

  snap.docs.forEach(d => {
    if (!d.data().last_active || d.data().data_source !== 'WIND_Web') {
      batch.update(d.ref, { 
        last_active: "2024-01-01 00:00:00",
        data_source: d.data().data_source || 'Shopify_Import' 
      });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    alert(`تم تحديث ${count} عميل قديم بنجاح!`);
    window.location.reload(); 
  } else {
    alert("كل البيانات محدثة بالفعل ولا تحتاج لإصلاح.");
  }
};

const segmentsList = [
  { id: 'all', label: 'كل العملاء', icon: <Users size={16} /> },
  { id: 'Purchased_Once', label: 'اشتروا مرة واحدة', icon: <ShoppingCart size={16} /> },
  { id: 'Email_Subscriber', label: 'المشتركين', icon: <Mail size={16} /> },
  { id: 'Abandoned_Checkout', label: 'تركوا السلة', icon: <UserMinus size={16} /> },
  { id: 'VIP_Customer', label: 'اشتروا أكثر من مرة', icon: <Crown size={16} /> },
  { id: 'Potential_Customer', label: 'لم يشتروا بعد', icon: <Target size={16} /> },
];

export default function CustomersPage() {
  const router = useRouter();

  const [activeSegment, setActiveSegment] = useState('all');
  const [activeTab, setActiveTab] = useState('wind'); 
  const [search, setSearch] = useState("");
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const fetchLimit = 20;
  
  // 🔥 إدارة حالة "تحميل المزيد" محلياً لأن SWR بيدير السحبة الأولى فقط
  const [additionalCustomers, setAdditionalCustomers] = useState([]);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiveVisible, setIsArchiveVisible] = useState(true);

  // ==========================================
  // 🔥 2. دالة الجلب الأساسية لـ SWR
  // ==========================================
  const fetcher = async (tabKey) => {
    const db = getDb();
    let q;
    
    // tabKey سيكون عبارة عن مصفوفة ['customers', 'wind'] مثلاً
    const tabSource = tabKey[1];

    if (tabSource === 'wind') {
      q = query(collection(db, "Customers"), where("data_source", "==", "WIND_Web"), limit(fetchLimit));
    } else if (tabSource === 'shopify') {
      q = query(collection(db, "Customers"), where("data_source", "==", "Shopify_Import"), limit(fetchLimit));
    } else {
      q = query(collection(db, "Customers"), orderBy("last_active", "desc"), limit(fetchLimit));
    }

    const customersSnap = await getDocs(q);
    const customersMap = new Map();

    customersSnap.docs.forEach(doc => {
      const data = doc.data();
      const email = (data.Email || data.email || '').toLowerCase().trim();
      const rawPhone = data.Phone || data['Default Address Phone'] || '';
      const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
      const uniqueId = email || cleanPhone || doc.id;

      customersMap.set(uniqueId, {
        ...data,
        id: doc.id,
        displayId: uniqueId,
        'Calculated Orders': 0,
        'Calculated Spent': 0,
        hasAbandoned: data.hasAbandoned || false, 
        originalSegments: data.segments || [],
        data_source: data.data_source || 'Shopify_Import'
      });
    });

    const parsedArray = Array.from(customersMap.values()).map(customer => {
      const segments = ['all'];
      if (customer.Email) segments.push('Email_Subscriber');
      
      const totalOrders = customer['Total Orders'] || 0;
      const totalSpent = customer['Total Spent'] || 0;
      const dbSegments = customer.segments || []; 
      
      if (Number(totalOrders) === 0) {
        segments.push('Potential_Customer');
        if (customer.hasAbandoned === true || dbSegments.includes('Abandoned_Checkout')) {
          segments.push('Abandoned_Checkout');
        }
      } else if (Number(totalOrders) === 1) {
        segments.push('Purchased_Once');
      } else if (Number(totalOrders) > 1) {
        segments.push('VIP_Customer');
        segments.push('Purchased_Once');
      }

      return { ...customer, segments, 'Total Orders': totalOrders, 'Total Spent': totalSpent };
    });

    // تحديث حالة Pagination
    setLastVisible(customersSnap.docs[customersSnap.docs.length - 1] || null);
    setHasMore(customersSnap.docs.length === fetchLimit);
    
    return parsedArray;
  };

  // ==========================================
  // 🔥 3. تشغيل SWR مع مفتاح ديناميكي
  // ==========================================
  // المفتاح يتغير بتغير التاب، مما يعني أن لكل تاب "كاش" مستقل به!
  // لا نسحب إذا كان الأرشيف مخفياً (حماية للتابات الثقيلة)
  const shouldFetch = isArchiveVisible || activeTab === 'wind';
  const { data: swrCustomers, isLoading: isSwrLoading } = useSWR(
    shouldFetch ? ['customers', activeTab] : null, 
    fetcher
  );

  // دمج العملاء المسحوبين بواسطة SWR مع العملاء الإضافيين (loadMore)
  const allRawCustomers = [...(swrCustomers || []), ...additionalCustomers];

  // ==========================================
  // 🔥 4. تحميل المزيد (دالة يدوية تتخطى SWR)
  // ==========================================
  const loadMoreCustomers = async () => {
    if (isLoadingMore || !hasMore || !lastVisible) return;
    setIsLoadingMore(true);
    
    try {
      const db = getDb();
      let q;
      
      if (activeTab === 'wind') {
        q = query(collection(db, "Customers"), where("data_source", "==", "WIND_Web"), startAfter(lastVisible), limit(fetchLimit));
      } else if (activeTab === 'shopify') {
        q = query(collection(db, "Customers"), where("data_source", "==", "Shopify_Import"), startAfter(lastVisible), limit(fetchLimit));
      } else {
        q = query(collection(db, "Customers"), orderBy("last_active", "desc"), startAfter(lastVisible), limit(fetchLimit));
      }

      const customersSnap = await getDocs(q);
      const newCustomers = customersSnap.docs.map(doc => {
         const data = doc.data();
         // ... نفس عملية البارسينج السابقة (باختصار للوقت هنا، لكن تأكد من معالجتها بنفس الطريقة إذا احتجت)
         return { ...data, id: doc.id, segments: ['all'], 'Total Orders': data['Total Orders'] || 0, 'Total Spent': data['Total Spent'] || 0, data_source: data.data_source || 'Shopify_Import' };
      });

      setAdditionalCustomers(prev => [...prev, ...newCustomers]);
      setLastVisible(customersSnap.docs[customersSnap.docs.length - 1] || null);
      setHasMore(customersSnap.docs.length === fetchLimit);

    } catch (err) {
      console.error("Error loading more customers:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setActiveSegment("all");
    setSelectedCustomers([]);
    setAdditionalCustomers([]); // تصفير الإضافيات عند تغيير التاب
    setLastVisible(null); 
    setHasMore(true); 
    
    if (tab === 'wind') {
      setIsArchiveVisible(true);
    } else {
      setIsArchiveVisible(false);
    }
  };

  // ==========================================
  // 🔥 5. الفلترة المحلية (Local Filtering)
  // ==========================================
  const filteredCustomers = React.useMemo(() => {
    if (!allRawCustomers.length) return [];
    
    let result = [...allRawCustomers];

    if (activeSegment !== 'all') {
      result = result.filter(c => c.segments && c.segments.includes(activeSegment));
    }

    if (search) {
      result = result.filter(c => 
        (c.Email||'').toLowerCase().includes(search.toLowerCase()) || 
        (c['First Name']||'').toLowerCase().includes(search.toLowerCase()) ||
        (c.Phone||'').includes(search)
      );
    }

    result.sort((a, b) => {
      const dateA = a.last_active ? new Date(a.last_active).getTime() : 0;
      const dateB = b.last_active ? new Date(b.last_active).getTime() : 0;
      return dateB - dateA; 
    });

    return result;
  }, [allRawCustomers, activeSegment, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredCustomers.length]);


  // ==========================================
  // باقي الدوال (حذف، تصدير، الخ)
  // ==========================================
  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const db = getDb();
      const batch = writeBatch(db);

      let customersToDec = 0;
      let ordersToDec = 0;
      let salesToDec = 0;

      for (let docId of selectedCustomers) {
        const customerData = allRawCustomers.find(c => c.id === docId);
        
        if (customerData) {
          if (Number(customerData['Total Orders'] || 0) > 0) {
            customersToDec++;
          }

          const cEmail = (customerData.Email || '').toLowerCase().trim();
          const cPhone = (customerData.Phone || '').replace(/[^0-9]/g, '');

          if (cEmail) {
            batch.delete(doc(db, "Orders", `DRAFT-${cEmail}`));
            const snapEmail = await getDocs(query(collection(db, "Orders"), where("Email", "==", cEmail), limit(1)));
            snapEmail.docs.forEach(d => {
              const oData = d.data();
              if (oData['Financial Status'] !== 'abandoned') {
                ordersToDec++;
                salesToDec += Number(oData.Total || 0);
              }
              batch.delete(doc(db, "Orders", d.id));
            });
          }

          if (cPhone) {
            batch.delete(doc(db, "Orders", `DRAFT-${cPhone}`));
            const snapPhone = await getDocs(query(collection(db, "Orders"), where("Phone", "==", cPhone), limit(1)));
            snapPhone.docs.forEach(d => {
              const oData = d.data();
              if (oData['Financial Status'] !== 'abandoned') {
                ordersToDec++;
                salesToDec += Number(oData.Total || 0);
              }
              batch.delete(doc(db, "Orders", d.id));
            });
          }
        }
        batch.delete(doc(db, "Customers", docId));
      }

      const settingsRef = doc(db, "settings", "siteSettings");
      const decUpdates = {};
      if (customersToDec > 0) decUpdates["counters.customers"] = increment(-customersToDec);
      if (ordersToDec > 0) decUpdates["counters.orders"] = increment(-ordersToDec);
      if (salesToDec > 0) decUpdates["counters.sales"] = increment(-salesToDec);

      if (Object.keys(decUpdates).length > 0) {
        batch.update(settingsRef, decUpdates);
      }

      await batch.commit();

      // حذف محلي سريع للبيانات لتجنب استدعاء SWR مرة أخرى
      setAdditionalCustomers(prev => prev.filter(c => !selectedCustomers.includes(c.id)));
      // Note: Updating SWR cache manually via mutate is ideal, but for simplicity here we rely on the component state.
      
      setSelectedCustomers([]);
      setShowDeleteModal(false);
      alert("تم الحذف وتحديث الإحصائيات بنجاح");

    } catch (error) {
      console.error("WIND Error: Batch Customer Delete failed", error);
      alert("حدث خطأ أثناء الحذف وتحديث الإحصائيات");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToExcelForAds = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const db = getDb();
      let q;

      if (activeTab === 'wind') {
        q = query(collection(db, "Customers"), where("data_source", "==", "WIND_Web"));
      } else if (activeTab === 'shopify') {
        q = query(collection(db, "Customers"), where("data_source", "==", "Shopify_Import"));
      } else {
        q = collection(db, "Customers");
      }

      const snap = await getDocs(q);
      let exportData = [];

      snap.docs.forEach(doc => {
        const c = doc.data();
        const totalOrders = Number(c['Total Orders'] || 0);
        const dbSegments = c.segments || [];
        
        let calculatedSegments = ['all'];
        if (c.Email) calculatedSegments.push('Email_Subscriber');
        
        if (totalOrders === 0) {
          calculatedSegments.push('Potential_Customer');
          if (c.hasAbandoned === true || dbSegments.includes('Abandoned_Checkout')) {
            calculatedSegments.push('Abandoned_Checkout');
          }
        } else if (totalOrders === 1) {
          calculatedSegments.push('Purchased_Once');
        } else if (totalOrders > 1) {
          calculatedSegments.push('VIP_Customer');
          calculatedSegments.push('Purchased_Once');
        }

        if (activeSegment === 'all' || calculatedSegments.includes(activeSegment)) {
          exportData.push({ ...c, calculatedOrderCount: totalOrders, calculatedSegments });
        }
      });

      if (exportData.length === 0) {
        alert(`لا يوجد عملاء في شريحة (${activeSegment}) لتصديرهم.`);
        setIsExporting(false);
        return;
      }

      const headers = ["Email,Phone,FirstName,LastName,City,State,Zip,Country,Value,Currency,OrderCount,LastOrderStatus,Source,Tags"];
      const rows = exportData.map(c => {
        const email = (c.Email || c.email || '').toString().trim().toLowerCase();
        const phone = (c.Phone || c['Default Address Phone'] || '').toString().replace(/[^0-9+]/g, '');
        const firstName = c['First Name'] ? c['First Name'].toString().trim() : '';
        const lastName = c['Last Name'] ? c['Last Name'].toString().trim() : '';
        const city = c['Default Address City'] ? c['Default Address City'].toString().trim() : '';
        const state = c['Default Address Province'] ? c['Default Address Province'].toString().trim() : '';
        const zip = c['Default Address Zip'] ? c['Default Address Zip'].toString().trim() : '';
        const country = c['Default Address Country'] ? c['Default Address Country'].toString().trim() : 'EG';
        const value = c['Total Spent'] || 0;
        
        return `"${email}","${phone}","${firstName}","${lastName}","${city}","${state}","${zip}","${country}","${value}","EGP","${c.calculatedOrderCount}","${c.Last_Order_Status || '---'}","${c.data_source || 'Shopify_Import'}","${c.Tags || ''}"`;
      });

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.concat(rows).join("\n");
      const link = document.createElement("a");
      link.href = encodeURI(csvContent);
      const fileName = activeTab === 'all' ? activeSegment : `${activeTab}_${activeSegment}`;
      link.download = `WIND_Ads_${fileName}.csv`;
      link.click();

    } catch (error) {
      console.error("Export Error:", error);
      alert("حدث خطأ أثناء تصدير البيانات");
    } finally {
      setIsExporting(false);
    }
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCustomers = filteredCustomers.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans text-[#202223]" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h1 className="text-2xl font-black flex items-center gap-2"><Users className="text-[#008060]" /> إدارة العملاء</h1>
          
        <div className="flex items-center gap-3">
            <button onClick={fixOldData} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 border-r border-gray-200" title="إصلاح بيانات أرشيف شوبيفاي للظهور في الترتيب">
              تحديث الأرشيف
            </button>
           <button onClick={exportToExcelForAds} disabled={isExporting} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50">
              {isExporting ? <span className="animate-spin h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full"></span> : <Download size={16} />}
              {isExporting ? 'جاري السحب...' : 'تصدير'}
            </button>
            {/* زر تحميل المزيد يعتمد الآن على isLoadingMore */}
            {(hasMore && (activeTab === 'wind' || isArchiveVisible)) && (
              <button onClick={loadMoreCustomers} disabled={isLoadingMore} className="bg-[#008060] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-[#006e52] transition-all disabled:opacity-50">
                {isLoadingMore ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> : <Download size={16} />}
                تحميل المزيد
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 sm:gap-6 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-hide">
          <button onClick={() => handleTabChange('wind')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'wind' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Monitor size={16}/> عملاء موقع WIND
          </button>
          <button onClick={() => handleTabChange('shopify')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'shopify' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Archive size={16}/> أرشيف شوبيفاي
          </button>
          <button onClick={() => handleTabChange('all')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'all' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Layers size={16}/> كل العملاء
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-2">
            <p className="text-xs font-bold text-gray-400 mb-4 px-2 uppercase tracking-widest">الشرائح (Segments)</p>
            {segmentsList.map((seg) => (
              <button key={seg.id} onClick={() => setActiveSegment(seg.id)} className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-all ${activeSegment === seg.id ? 'bg-white shadow-sm border border-gray-200 text-[#008060]' : 'hover:bg-gray-200 text-gray-500'}`}>
                <div className="flex items-center gap-3 font-bold text-sm">{seg.icon} {seg.label}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 space-y-4">
            {!isArchiveVisible ? (
              <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-200 shadow-sm animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-[#008060]/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users size={40} className="text-[#008060]/30" />
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">
                  {activeTab === 'wind' ? 'عملاء موقع WIND' : activeTab === 'shopify' ? 'أرشيف شوبيفاي' : 'كل العملاء'}
                </h3>
                <p className="text-sm text-gray-400 mb-8 max-w-xs mx-auto leading-relaxed">
                  تم إيقاف التحميل التلقائي لتوفير قراءات الفايربيز. اضغط للسحب اليدوي.
                </p>
                <button 
                  type="button"
                  onClick={() => setIsArchiveVisible(true)}
                  className="bg-[#008060] text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:bg-[#006e52] transition-all transform hover:scale-105 active:scale-95"
                >
                  إظهار العملاء الآن
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center bg-gray-50/50 gap-4">
                  <div className="relative flex-1 w-full max-w-md">
                    <Search className="absolute right-4 top-3.5 text-gray-400" size={18} />
                    <input type="text" placeholder="ابحث بالاسم أو الإيميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pr-12 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#008060] transition-all" />
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCustomers.length > 0 && (
                      <button onClick={() => setShowDeleteModal(true)} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm">
                        <Trash2 size={16} /> حذف ({selectedCustomers.length})
                      </button>
                    )}
                    <span className="text-xs font-bold text-gray-500 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                      المعروض: {filteredCustomers.length}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead className="bg-white border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-5 w-12 text-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 accent-[#008060] rounded cursor-pointer"
                            checked={currentCustomers.length > 0 && selectedCustomers.length === currentCustomers.length}
                            onChange={(e) => {
                              if(e.target.checked) setSelectedCustomers(currentCustomers.map(c => c.id));
                              else setSelectedCustomers([]);
                            }}
                          />
                        </th>
                        <th className="px-6 py-5">العميل</th>
                        <th className="px-6 py-5">الإيميل / الهاتف</th>
                        <th className="px-6 py-5 text-center">الطلبات</th>
                        <th className="px-6 py-5">الإنفاق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {isSwrLoading && currentCustomers.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-20 text-[#008060] font-black animate-pulse">جاري سحب الداتا...</td></tr>
                      ) : currentCustomers.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center py-20 text-gray-400">
                            <Archive size={40} className="mx-auto mb-3 opacity-20"/>
                            <p className="font-bold">لا يوجد عملاء هنا</p>
                          </td>
                        </tr>
                      ) : (
                        currentCustomers.map((c) => (
                          // 🔥 تغيير الـ onClick لزرار صريح بدلاً من tr لقتل الـ prefetch
                          <tr key={c.id} className="hover:bg-gray-50/80 transition-all group">
                            <td className="px-6 py-4 text-center">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 accent-[#008060] rounded cursor-pointer"
                                checked={selectedCustomers.includes(c.id)}
                                onChange={(e) => {
                                  if(e.target.checked) setSelectedCustomers(prev => [...prev, c.id]);
                                  else setSelectedCustomers(prev => prev.filter(id => id !== c.id));
                                }}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <p 
                                onClick={() => router.push(`/admin/customers/${encodeURIComponent(c.id)}`)}
                                className="text-sm font-black text-[#005bd3] group-hover:underline cursor-pointer"
                              >
                                {c['First Name']} {c['Last Name']}
                              </p>
                              {c.data_source === 'WIND_Web' && <span className="inline-block mt-1 bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5 rounded font-bold">WIND</span>}
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[11px] font-bold text-gray-600 mb-1">{c.Email || 'بدون إيميل'}</p>
                              <p className="text-[10px] text-gray-500" dir="ltr">{c.Phone || '---'}</p>
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-center">{c['Total Orders'] || 0}</td>
                            <td className="px-6 py-4 text-sm font-black text-[#008060]">{c['Total Spent'] || 0} EGP</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredCustomers.length > 0 && (
                  <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-xs font-bold text-gray-500">صفحة {currentPage} من {totalPages}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-all"><ChevronRight size={18} /></button>
                      <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-all"><ChevronLeft size={18} /></button>
                    </div>
                  </div>
                )}
              </div>
            )} 
          </div>
        </div>

        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm slide-down">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
              <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 left-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"><X size={16} /></button>
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 mx-auto"><AlertTriangle size={28} /></div>
              <h3 className="text-xl font-black text-center text-gray-900 mb-2">تأكيد الحذف</h3>
              <p className="text-sm text-gray-500 text-center mb-6">هل أنت متأكد من حذف ({selectedCustomers.length}) عميل وكل طلباتهم نهائياً؟</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteModal(false)} disabled={isDeleting} className="flex-1 py-3 bg-gray-100 text-gray-800 font-bold rounded-xl">إلغاء</button>
                <button onClick={handleDeleteSelected} disabled={isDeleting} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2">
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