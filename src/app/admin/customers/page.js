"use client";

import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore/lite";
import { useRouter } from 'next/navigation';
import { Users, Target, Search, Trash2, AlertTriangle, X,
  ChevronLeft, ChevronRight, Package 
} from '@/components/icons-extra';
import { Mail, ShoppingCart, Download, Crown, UserMinus, Monitor, Archive, Layers } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

const segmentsList = [
  { id: 'all', label: 'كل العملاء', icon: <Users size={16} /> },
  { id: 'Purchased_Once', label: 'اشتروا مرة واحدة', icon: <ShoppingCart size={16} /> },
  { id: 'Email_Subscriber', label: 'المشتركين', icon: <Mail size={16} /> },
  { id: 'Abandoned_Checkout', label: 'تركوا السلة', icon: <UserMinus size={16} /> },
  { id: 'VIP_Customer', label: 'اشتروا أكثر من مرة', icon: <Crown size={16} /> },
  { id: 'Potential_Customer', label: 'لم يشتروا بعد', icon: <Target size={16} /> },
];

export default function CustomersPage() {
  const [allRawCustomers, setAllRawCustomers] = useState([]); // مخزن البيانات الخام
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeSegment, setActiveSegment] = useState('all');
  const [activeTab, setActiveTab] = useState('wind'); 
  const [search, setSearch] = useState("");
  
  // 🔥 متغيرات الـ Pagination الجديدة
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // 🔥 متغيرات ميزة الحذف الجديدة
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const router = useRouter();

  // 🔥 1. سحب البيانات مرة واحدة فقط عند تحميل الصفحة
  useEffect(() => { 
    fetchCustomers(); 
  }, []);

  // 🔥 2. تصفية التحديد عند تغيير الشريحة أو التبويب
  useEffect(() => {
    setSelectedCustomers([]); 
  }, [activeSegment, activeTab, search]);

  // 🔥 3. فلترة متقدمة (بحث + تبويبات المنشأ + ترتيب زمني) - تتم محلياً دون سحب جديد
  useEffect(() => {
    // الفلترة تبدأ دائماً من البيانات الخام
    let result = [...allRawCustomers];

    // الفلترة حسب الشريحة (Segments)
    if (activeSegment !== 'all') {
      result = result.filter(c => c.segments && c.segments.includes(activeSegment));
    }

    // الفلترة حسب المنشأ
    if (activeTab === 'shopify') {
      result = result.filter(c => c.data_source === 'Shopify_Import' || !c.data_source);
    } else if (activeTab === 'wind') {
      result = result.filter(c => c.data_source === 'WIND_Web'); 
    }

    // الفلترة حسب البحث
    if (search) {
      result = result.filter(c => 
        (c.Email||'').toLowerCase().includes(search.toLowerCase()) || 
        (c['First Name']||'').toLowerCase().includes(search.toLowerCase()) ||
        (c.Phone||'').includes(search)
      );
    }

    // ترتيب صارم: الأحدث فوق دايماً بناءً على أخر نشاط (last_active)
    result.sort((a, b) => {
      const dateA = a.last_active ? new Date(a.last_active).getTime() : 0;
      const dateB = b.last_active ? new Date(b.last_active).getTime() : 0;
      return dateB - dateA; // تنازلي
    });

    setFilteredCustomers(result);
    setCurrentPage(1); // إرجاع الصفحة للأولى عند أي فلترة جديدة
  }, [search, activeTab, activeSegment, allRawCustomers]);

  // 🔥 دالة الحذف النهائي للعملاء المحددين
  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const db = getDb();
      for (const uniqueId of selectedCustomers) {
        // 1. مسح الطلبات المرتبطة بالإيميل لو موجودة
        const qEmail = query(collection(db, "Orders"), where("Email", "==", uniqueId));
        const snapEmail = await getDocs(qEmail);
        for (const d of snapEmail.docs) {
          await deleteDoc(doc(db, "Orders", d.id));
        }

        // 2. مسح الطلبات المرتبطة برقم الهاتف لو موجودة
        const qPhone = query(collection(db, "Orders"), where("Phone", "==", uniqueId));
        const snapPhone = await getDocs(qPhone);
        for (const d of snapPhone.docs) {
          await deleteDoc(doc(db, "Orders", d.id));
        }
        
        // 3. مسح ملف العميل القديم من قاعدة العملاء (للنظافة التامة)
        await deleteDoc(doc(db, "Customers", uniqueId));
      }
      
      // 4. تحديث الشاشة فوراً وتنظيف التحديد
      setAllRawCustomers(prev => prev.filter(c => !selectedCustomers.includes(c.id)));
      setSelectedCustomers([]);
      setShowDeleteModal(false);
      
    } catch (error) {
      console.error("Error deleting customers:", error);
      alert("حدث خطأ أثناء الحذف، يرجى المحاولة مرة أخرى");
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const db = getDb();
      // 1. نجيب كل العملاء من الداتا بيز (عشان منخسرش أرشيف شوبيفاي المتروك أو اللي لسه مشتراش)
      const customersSnap = await getDocs(collection(db, "Customers"));
      const customersMap = new Map();

      customersSnap.docs.forEach(doc => {
        const data = doc.data();
        const email = (data.Email || data.email || '').toLowerCase().trim();
        const rawPhone = data.Phone || data['Default Address Phone'] || '';
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
        // المعرف الأساسي: الإيميل، ولو مفيش يبقى التليفون، ولو مفيش يبقى الـ ID بتاع الدوكيومنت
        const uniqueId = email || cleanPhone || doc.id;

        customersMap.set(uniqueId, {
          id: uniqueId,
          ...data,
          // هنصفر الأرقام دي ونحسبها من الطلبات الحقيقية عشان الدقة 100%
          'Calculated Orders': 0,
          'Calculated Spent': 0,
          hasAbandoned: false,
          originalSegments: data.segments || [],
          data_source: data.data_source || 'Shopify_Import' // تأمين المنشأ
        });
      });

      // 2. نجيب كل الطلبات ونحدث بيها بيانات العملاء المجمعة
      const ordersSnap = await getDocs(collection(db, "Orders"));
      const allOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      allOrders.forEach(order => {
        if (order['Financial Status'] === 'deleted') return;

        // تحديد هل الطلب سلة متروكة/غير مكتملة ولا أوردر حقيقي
        const isAbandoned = order['Financial Status'] === 'abandoned' || 
                            order['Financial Status'] === 'pending_payment' || 
                            order.Name?.startsWith('DRAFT-');

        const rawPhone = order.Phone || order['Shipping Phone'] || '';
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
        const email = (order.Email || '').toLowerCase().trim();
        const uniqueId = email || cleanPhone;
        
        if (!uniqueId) return; 

        if (!customersMap.has(uniqueId)) {
          const fullName = order['Billing Name'] || order['Shipping Name'] || '';
          const nameParts = fullName.split(' ');
          
          customersMap.set(uniqueId, {
            id: uniqueId, 
            'First Name': nameParts[0] || 'عميل',
            'Last Name': nameParts.slice(1).join(' ') || 'مجهول',
            Email: email,
            Phone: rawPhone,
            'Default Address City': order['Shipping City'] || order['Shipping Province'] || '',
            last_active: new Date(order['Created at'] || 0).getTime(),
            data_source: order.data_source || 'Shopify_Import',
            'Calculated Orders': 0,
            'Calculated Spent': 0,
            hasAbandoned: false,
            originalSegments: []
          });
        }

        const customer = customersMap.get(uniqueId);

        // تحديث بيانات العميل بأحدث نشاط واسم وعنوان
        const orderTime = new Date(order['Created at'] || 0).getTime();
        if (!customer.last_active || orderTime > customer.last_active) {
          customer.last_active = orderTime;
          const fullName = order['Billing Name'] || '';
          if (fullName && fullName !== 'عميل محتمل') {
             const nameParts = fullName.split(' ');
             customer['First Name'] = nameParts[0] || customer['First Name'];
             customer['Last Name'] = nameParts.slice(1).join(' ') || customer['Last Name'];
          }
          if (order['Shipping City']) customer['Default Address City'] = order['Shipping City'];
          // تحديث المنشأ لو عمل أوردر من WIND
          if (order.data_source === 'WIND_Web') customer.data_source = 'WIND_Web';
        }

        // حساب الأوردرات والمبالغ للطلبات الحقيقية فقط
        if (!isAbandoned) {
          customer['Calculated Orders'] += 1;
          customer['Calculated Spent'] += Number(order.Total || 0);
        } else {
          customer.hasAbandoned = true;
        }
      });

      // 3. تصنيف العملاء للشرائح بدقة تامة
      let customersArray = [];
      
      Array.from(customersMap.values()).forEach(c => {
        const segments = ['all'];
        if (c.Email) segments.push('Email_Subscriber');

        const realOrdersCount = c['Calculated Orders'] || 0;

        if (realOrdersCount === 0) {
          // 🔥 فصل أرشيف شوبيفاي عن عملاء WIND بشكل قاطع
          if (c.data_source === 'Shopify_Import' || !c.data_source) {
            // شوبيفاي: نعتمد على الأرشيف القديم
            if (c.originalSegments.includes('Purchased_Once')) {
               segments.push('Purchased_Once');
               c['Total Orders'] = 1;
            } else if (c.originalSegments.includes('VIP_Customer')) {
               segments.push('VIP_Customer');
               c['Total Orders'] = c['Total Orders'] || 2;
            } else {
               segments.push('Potential_Customer');
               if (c.hasAbandoned || c.originalSegments.includes('Abandoned_Checkout')) {
                   segments.push('Abandoned_Checkout');
               }
               c['Total Orders'] = 0;
            }
          } else {
            // 🚀 عملاء WIND_Web: نعتمد على الحقيقة فقط من الطلبات!
            // لو العميل معندوش أوردر ومعندوش سلة متروكة كمان (hasAbandoned = false)
            // يبقى ده "شبح" نتج عن تغيير العميل لبياناته وهو بيكتب.. نتجاهله وميظهرش خالص!
            if (!c.hasAbandoned) return; 

            // لو داس كاشير (pending_payment) أو ساب سلة ومكملش (Draft)، هينزل هنا بشكل سليم
            segments.push('Potential_Customer');
            segments.push('Abandoned_Checkout');
            c['Total Orders'] = 0;
          }
        } else {
          // لو عنده أوردرات حقيقية في السيستم (الدفع تم بنجاح أو دفع عند الاستلام)
          c['Total Orders'] = realOrdersCount;
          c['Total Spent'] = c['Calculated Spent'];

          if (realOrdersCount === 1) segments.push('Purchased_Once');
          if (realOrdersCount > 1) segments.push('VIP_Customer');
          if (c.hasAbandoned) segments.push('Abandoned_Checkout'); 
        }

        c.segments = segments;
        customersArray.push(c);
      });

      // حفظ الداتا الكاملة في المخزن الرئيسي
      setAllRawCustomers(customersArray);

    } catch (err) {
      console.error("Error generating customers from orders:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 دالة التصدير للإعلانات
  const exportToExcelForAds = () => {
    if(filteredCustomers.length === 0) return alert("لا توجد بيانات للتصدير");

    const headers = ["Email,Phone,FirstName,LastName,City,State,Zip,Country,Value,Currency,OrderCount,LastOrderStatus,Source,Tags"];

    const rows = filteredCustomers.map(c => {
      const email = (c.Email || c.email || '').toString().trim().toLowerCase();
      const phone = (c.Phone || c['Default Address Phone'] || '').toString().replace(/[^0-9+]/g, '');
      const firstName = c['First Name'] ? c['First Name'].toString().trim() : '';
      const lastName = c['Last Name'] ? c['Last Name'].toString().trim() : '';
      
      const city = c['Default Address City'] ? c['Default Address City'].toString().trim() : '';
      const state = c['Default Address Province'] ? c['Default Address Province'].toString().trim() : '';
      const zip = c['Default Address Zip'] ? c['Default Address Zip'].toString().trim() : '';
      const country = c['Default Address Country'] ? c['Default Address Country'].toString().trim() : 'EG';
      
      const value = c['Total Spent'] || 0;
      const currency = "EGP";
      const orderCount = c['Total Orders'] || 0;
      
      const lastOrderStatus = c.Last_Order_Status || '---'; 
      const source = c.data_source || 'Shopify_Import';
      const tags = c.Tags ? c.Tags.toString().trim().replace(/"/g, '""') : '';

      return `"${email}","${phone}","${firstName}","${lastName}","${city}","${state}","${zip}","${country}","${value}","${currency}","${orderCount}","${lastOrderStatus}","${source}","${tags}"`;
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.concat(rows).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    const fileName = activeTab === 'all' ? activeSegment : `${activeTab}_${activeSegment}`;
    link.download = `WIND_Ads_${fileName}.csv`;
    link.click();
  };

  // 🔥 حسابات الـ Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCustomers = filteredCustomers.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans text-[#202223]" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black flex items-center gap-2"><Users className="text-[#008060]" /> إدارة العملاء</h1>
          
        <div className="flex items-center gap-3">
            {selectedCustomers.length > 0 && (
              <button 
                onClick={() => setShowDeleteModal(true)} 
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-red-600 transition-all slide-down"
              >
                <Trash2 size={16} /> حذف المحددين ({selectedCustomers.length})
              </button>
            )}
            
            <button 
              onClick={exportToExcelForAds} 
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-all"
            >
              <Download size={16} /> تصدير
            </button>
          </div>
        </div>

        {/* التبويبات (Tabs) لفصل القديم عن الجديد */}
        <div className="flex gap-2 sm:gap-6 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('wind')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'wind' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Monitor size={16}/> عملاء موقع WIND
          </button>
          <button onClick={() => setActiveTab('shopify')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'shopify' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Archive size={16}/> أرشيف شوبيفاي
          </button>
          <button onClick={() => setActiveTab('all')} className={`flex items-center gap-2 pb-3 px-2 font-black text-sm transition-all whitespace-nowrap ${activeTab === 'all' ? 'border-b-2 border-[#008060] text-[#008060]' : 'text-gray-400 hover:text-gray-600'}`}>
            <Layers size={16}/> كل العملاء
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* الشرائح الجانبية */}
          <div className="lg:col-span-1 space-y-2">
            <p className="text-xs font-bold text-gray-400 mb-4 px-2 uppercase tracking-widest">الشرائح (Segments)</p>
            {segmentsList.map((seg) => (
              <button key={seg.id} onClick={() => setActiveSegment(seg.id)} className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-all ${activeSegment === seg.id ? 'bg-white shadow-sm border border-gray-200 text-[#008060]' : 'hover:bg-gray-200 text-gray-500'}`}>
                <div className="flex items-center gap-3 font-bold text-sm">{seg.icon} {seg.label}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 space-y-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute right-4 top-3.5 text-gray-400" size={18} />
                <input type="text" placeholder="ابحث بالاسم أو الإيميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pr-12 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#008060] transition-all shadow-sm" />
              </div>
              <span className="text-xs font-bold text-gray-500 px-3 py-1.5 bg-white border border-gray-200 rounded-lg">
                إجمالي المعروض: {filteredCustomers.length} عميل
              </span>
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
                    <th className="px-6 py-5">الموقع</th>
                    <th className="px-6 py-5 text-center">الطلبات</th>
                    <th className="px-6 py-5">الإنفاق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? <tr><td colSpan="6" className="text-center py-20 text-[#008060] font-black animate-pulse">جاري سحب الداتا...</td></tr> : 
                    currentCustomers.length === 0 ? (
                      <tr><td colSpan="6" className="text-center py-20 text-gray-400 font-bold"><Archive size={40} className="mx-auto mb-3 opacity-20"/>لا يوجد عملاء في هذا القسم</td></tr>
                    ) : (
                    currentCustomers.map((c) => {
                      const safeId = c.Email || c.Phone || c.id; 
                      const displayEmail = c.Email || c.email;
                      const displayPhone = c.Phone || c['Default Address Phone'];
                      
                      return (
                        <tr key={c.id} className="hover:bg-gray-50/80 cursor-pointer group transition-all" onClick={() => router.push(`/admin/customers/${encodeURIComponent(safeId)}`)}>
                          <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
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
                            <p className="text-sm font-black text-[#005bd3] group-hover:underline">{c['First Name']} {c['Last Name']}</p>
                            {c.data_source === 'WIND_Web' && <span className="inline-block mt-1 bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5 rounded font-bold">WIND Customer</span>}
                          </td>
                          <td className="px-6 py-4">
                            {displayEmail ? <p className="text-[11px] font-bold font-mono text-gray-600 mb-1">{displayEmail}</p> : <p className="text-[11px] text-gray-400 mb-1">بدون إيميل</p>}
                            {displayPhone && <p className="text-[10px] text-gray-500 font-bold" dir="ltr">{displayPhone}</p>}
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-gray-700 line-clamp-1 max-w-[150px] mt-3">{c['Default Address City'] || '---'}</td>
                          <td className="px-6 py-4 text-sm font-black text-center">{c['Total Orders'] || 0}</td>
                          <td className="px-6 py-4 text-sm font-black text-[#008060]">{c['Total Spent'] || 0} EGP</td>
                        </tr>
                      )
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
                      هل أنت متأكد من رغبتك في حذف <span className="font-bold text-red-600">({selectedCustomers.length})</span> عميل؟ لا يمكن التراجع عن هذا الإجراء.
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

            {/* 🔥 شريط الـ Pagination */}
            {filteredCustomers.length > 0 && (
              <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-xs font-bold text-gray-500">
                  عرض <span className="text-black">{indexOfFirstItem + 1}</span> إلى <span className="text-black">{Math.min(indexOfLastItem, filteredCustomers.length)}</span> من أصل <span className="text-black">{filteredCustomers.length}</span> عميل
                </p>
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
    </div>
  );
}