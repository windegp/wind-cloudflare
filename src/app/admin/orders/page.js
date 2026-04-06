"use client";

import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, deleteDoc, doc } from "firebase/firestore/lite";
import { useRouter } from 'next/navigation';
import { ShoppingBag, Search, Filter, Monitor, Archive, Layers, ChevronLeft, ChevronRight, Trash2, AlertTriangle, X, Download } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

export default function OrdersListPage() {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState('wind'); 
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; 
  
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const router = useRouter();

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    setSelectedOrders([]);
  }, [activeTab, search]);

  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const db = getDb();
      for (const id of selectedOrders) {
        await deleteDoc(doc(db, "Orders", id));
      }
      setOrders(prev => prev.filter(o => !selectedOrders.includes(o.id)));
      setSelectedOrders([]);
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting orders:", error);
      alert("حدث خطأ أثناء الحذف");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let result = orders.filter(o => o['Financial Status'] !== 'deleted');
    
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
  }, [search, activeTab, orders]);

  const fetchOrders = async () => {
    try {
      // 🔥 تم إزالة الـ limit(300) بناءً على طلبك، لجلب كل الأرشيف (600+ طلب)
      const db = getDb();
      const q = query(collection(db, "Orders"));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(docs);
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  };

  // 🔥 دالة تصدير الطلبات إلى إكسيل (مضافة حديثاً)
  const exportOrdersToExcel = () => {
    if(filteredOrders.length === 0) return alert("لا توجد طلبات للتصدير");

    const headers = ["Order Number,Date,Customer Name,Email,Phone,Product,Quantity,Total,Status,Source"];

    const rows = filteredOrders.map(o => {
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
    const fileName = activeTab === 'all' ? 'All_Orders' : `${activeTab}_Orders`;
    link.download = `WIND_${fileName}.csv`;
    link.click();
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'pending_payment': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'refunded': return 'bg-red-100 text-red-700 border-red-200';
      case 'abandoned': return 'bg-gray-100 text-gray-500 border-gray-200'; 
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;

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
            {/* 🔥 زر التصدير (Export) */}
            <button 
              onClick={exportOrdersToExcel} 
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-all"
            >
              <Download size={16} /> تصدير الطلبات
            </button>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-6 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('wind')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'wind' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Monitor size={16}/> طلبات موقع WIND
          </button>
          <button onClick={() => setActiveTab('abandoned')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'abandoned' ? 'border-b-2 text-red-600 border-red-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Archive size={16}/> سلات متروكة
          </button>
          <button onClick={() => setActiveTab('shopify')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'shopify' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Archive size={16}/> أرشيف شوبيفاي
          </button>
          <button onClick={() => setActiveTab('all')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'all' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Layers size={16}/> كل الطلبات
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 bg-gray-50/50">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-3.5 text-gray-400" size={18} />
              <input type="text" placeholder="ابحث برقم الطلب، أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pr-12 pl-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#008060] transition-all shadow-sm" />
            </div>
            <div className="flex items-center gap-2">
              {selectedOrders.length > 0 && (
                <button 
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-all shadow-sm slide-down"
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
            <table className="w-full text-right border-collapse min-w-[900px]">
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
                  <th className="px-6 py-5">الطلب والتاريخ</th>
                  <th className="px-6 py-5">العميل</th>
                  <th className="px-6 py-5">المنتج والكمية</th>
                  <th className="px-6 py-5 text-center">حالة الدفع</th>
                  <th className="px-6 py-5">الإجمالي</th>
                  <th className="px-6 py-5 text-center">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-sans">
                {currentOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-24 text-gray-400">
                      <Archive size={40} className="mx-auto mb-3 opacity-20"/>
                      <p className="font-bold">لا توجد طلبات في هذا القسم</p>
                    </td>
                  </tr>
                ) : (
                  currentOrders.map((order) => {
                    const isWind = order.data_source === 'WIND_Web';
                    const hasMultiple = order.lineItems && order.lineItems.length > 1;
                    
                    const displayProductName = isWind 
                      ? (order.lineItems?.[0]?.name || 'منتج غير محدد')
                      : (order['Lineitem name'] || 'منتج غير محدد');
                      
                    const displayQuantity = isWind
                      ? (order.lineItems?.[0]?.quantity || 1)
                      : (order['Lineitem quantity'] || 1);

                    const orderLink = isWind ? order.Name : order.Name.replace('#', '');

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
                        <td className="px-6 py-4">
                          <p className="text-sm font-black text-[#005bd3] group-hover:underline">{isWind ? order.Name : `#${orderLink}`}</p>
                          <p className="text-[10px] text-gray-400 font-bold mt-1">{order['Created at']?.split(' ')[0] || order['Created at']}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-gray-900">{order['Billing Name'] || 'عميل مجهول'}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5" dir="ltr">{order.Phone || order['Shipping Phone'] || order.Email}</p>
                        </td>
                        <td className="px-6 py-4">
                           <p className="text-xs font-bold text-gray-700 line-clamp-1 max-w-[220px]">{displayProductName}</p>
                           <p className="text-[10px] text-gray-500 font-bold mt-1.5 flex items-center gap-2">
                             <span>الكمية: <span className="text-[#008060] font-black">{displayQuantity}</span></span>
                             {hasMultiple && <span className="bg-gray-100 text-gray-600 px-1.5 rounded-sm text-[9px]">+ منتجات أخرى</span>}
                           </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(order['Financial Status'])}`}>
                            {order['Financial Status'] === 'abandoned' ? 'متروكة' : order['Financial Status']}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-black text-gray-900">{order.Total} EGP</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center mx-auto group-hover:border-[#008060] group-hover:bg-green-50 transition-colors"><ChevronLeft size={16} className="text-gray-400 group-hover:text-[#008060]" /></div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {showDeleteModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm slide-down">
                <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
                  <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 left-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"><X size={16} /></button>
                  
                  <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 mx-auto">
                    <AlertTriangle size={28} />
                  </div>
                  
                  <h3 className="text-xl font-black text-center text-gray-900 mb-2">تأكيد الحذف</h3>
                  <p className="text-sm text-gray-500 text-center mb-6">
                    هل أنت متأكد من رغبتك في حذف <span className="font-bold text-red-600">({selectedOrders.length})</span> طلب؟ لا يمكن التراجع عن هذا الإجراء وسيتم مسحهم نهائياً.
                  </p>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDeleteModal(false)}
                      disabled={isDeleting}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-all"
                    >
                      إلغاء
                    </button>
                    <button 
                      onClick={handleDeleteSelected}
                      disabled={isDeleting}
                      className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {isDeleting ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> : 'نعم، احذف'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {filteredOrders.length > 0 && (
            <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-xs font-bold text-gray-500">عرض <span className="text-black">{indexOfFirstItem + 1}</span> إلى <span className="text-black">{Math.min(indexOfLastItem, filteredOrders.length)}</span> من أصل <span className="text-black">{filteredOrders.length}</span> طلب</p>
              <div className="flex items-center gap-2">
                <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronRight size={18} /></button>
                <span className="text-xs font-bold px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">صفحة {currentPage} من {totalPages}</span>
                <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronLeft size={18} /></button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}