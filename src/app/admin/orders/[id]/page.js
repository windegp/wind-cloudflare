"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDb } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore/lite";
import { ArrowRight, Package, User, MapPin, Printer } from '@/components/icons-extra';
// 🔥 حماية الكوتا
import { kvGet, kvSet, kvDelete, TTL } from '@/lib/kv-cache';
import { logRead } from '@/lib/firestoreQuota';

export const dynamic = 'force-dynamic';

const ORDER_CACHE_PREFIX = 'admin_order_detail';
const CACHE_VERSION = 'v2'; // For TTL support

export default function OrderDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [productsList, setProductsList] = useState([]);

  useEffect(() => { if (id) fetchOrderDetails(); }, [id]);

  const fetchOrderDetails = async () => {
    try {
      const cacheKey = `${ORDER_CACHE_PREFIX}_${id}_${CACHE_VERSION}`;
      
      // 🚀 محاولة KV cache أولاً
      const cached = await kvGet(cacheKey);
      if (cached && cached.order) {
        setOrder(cached.order);
        setProductsList(cached.productsList || []);
        logRead('fetchOrderDetails', 'Orders+products', 1 + (cached.productsList?.length || 0), 'cache');
        return;
      }
      
      const db = getDb();
      const decodedId = decodeURIComponent(id).trim();
      
      let orderIdToFetch = decodedId;
      if (!decodedId.startsWith('WIND') && !decodedId.startsWith('DRAFT') && !decodedId.startsWith('#')) {
        orderIdToFetch = `#${decodedId}`;
      }

      const docSnap = await getDoc(doc(db, "Orders", orderIdToFetch));
      logRead('fetchOrderDetails', 'Orders', 1, 'firestore');
      
      if (docSnap.exists()) {
        const orderData = docSnap.data();
        setOrder(orderData);

        const isWind = orderData.data_source === 'WIND_Web';

        let finalProductsList = [];
        
        if (isWind) {
          finalProductsList = orderData.lineItems || [];
          setProductsList(finalProductsList);
        } else {
          // داتا شوبيفاي القديمة - مع limit 1
          const items = orderData.lineItems || [];
          const itemsWithImages = await Promise.all(items.map(async (item) => {
            const baseName = item.name.split(' - ')[0].trim(); 
            const pQ = query(collection(db, "products"), where("title", "==", baseName), limit(1));
            const pSnap = await getDocs(pQ);
            logRead('fetchOrderDetails', 'products', pSnap.docs.length, 'firestore');
            let img = null;
            if (!pSnap.empty) {
              img = pSnap.docs[0].data().images?.[0]; 
            }
            return { ...item, image: img, baseName };
          }));
          finalProductsList = itemsWithImages;
          setProductsList(itemsWithImages);
        }
        
        // 💾 تخزين في KV مع TTL 2 دقيقة
        await kvSet(cacheKey, { order: orderData, productsList: finalProductsList }, TTL.ADMIN_MEDIUM);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  if (!order) return <div className="p-20 text-center text-red-500 font-bold">الطلب غير موجود. <button onClick={()=>router.back()} className="underline text-blue-500">عودة</button></div>;

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl border shadow-sm overflow-hidden">
        
        <div className="p-6 sm:p-8 border-b flex justify-between items-center bg-gray-50/30">
          <div className="flex items-center gap-4">
             <button onClick={()=>router.back()} className="p-2 bg-white border rounded-lg hover:bg-gray-50"><ArrowRight size={20}/></button>
             <div>
             <h1 className="text-xl sm:text-2xl font-black text-[#202223] flex items-center gap-2">
                 طلب رقم {order.Name}
                 {order.data_source === 'WIND_Web' && !order.Name?.startsWith('DRAFT') && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">WIND Web</span>}
                 {order.Name?.startsWith('DRAFT') && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">سلة متروكة</span>}
               </h1>
               <p className="text-xs text-gray-400 mt-1 font-bold">التاريخ: {order['Created at']}</p>
             </div>
          </div>
          <button onClick={() => window.print()} className="p-3 bg-white border rounded-xl hover:bg-gray-50 text-gray-600"><Printer size={20}/></button>
        </div>

        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
           
           <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><User size={14}/> بيانات العميل</h3>
              <p className="text-sm font-black text-[#202223]">{order['Billing Name']}</p>
              <p className="text-xs text-gray-500 mb-4">{order.Email || 'لا يوجد إيميل'}</p>
              
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 mt-6">
                <p className="text-[10px] text-gray-400 font-bold mb-2 flex items-center gap-1"><MapPin size={12}/> عنوان الشحن</p>
                <p className="text-xs text-gray-700 leading-relaxed font-bold">
                  {order['Shipping Address1']}<br/>
                  {order['Shipping City']} - {order['Shipping Province']}<br/>
                  <span className="text-[#008060] mt-2 inline-block">الهاتف: <span dir="ltr">{order['Shipping Phone'] || order.Phone || '---'}</span></span>
                </p>
              </div>
           </div>

           <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Package size={14}/> المنتجات المطلوبة</h3>
              
              <div className="space-y-4 mb-6">
                {productsList.map((product, idx) => (
                  <div key={idx} className="flex gap-4 items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 shrink-0">
                      {product.image ? <img src={product.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={16}/></div>}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-[#005bd3] line-clamp-2">{product.name}</p>
                      <p className="text-[10px] text-gray-500 font-bold mt-1">
                        الكمية: <span className="text-[#008060] bg-green-50 px-1 rounded">{product.quantity}</span>
                      </p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-sm font-black">{product.price} <span className="text-[9px]">EGP</span></p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="space-y-3 pt-4 border-t border-gray-200">
                 <div className="flex justify-between text-xs text-gray-500 font-bold">
                   <span>المبلغ الفرعي:</span><span>{order.Subtotal} EGP</span>
                 </div>
                 {order.Shipping > 0 && (
                   <div className="flex justify-between text-xs text-gray-500 font-bold">
                     <span>مصاريف الشحن:</span><span>{order.Shipping} EGP</span>
                   </div>
                 )}
                 {order['Discount Code'] && (
                   <div className="flex justify-between text-xs text-red-500 font-bold bg-red-50 p-2 rounded-lg">
                     <span>كود الخصم:</span>
                     <span>({order['Discount Code']})</span>
                   </div>
                 )}
                 <div className="flex justify-between text-lg font-black pt-4 border-t border-gray-200 text-[#008060]">
                   <span>الإجمالي:</span><span>{order.Total} EGP</span>
                 </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}