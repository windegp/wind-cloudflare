"use client";
// Final Production Icon Fix - v2.1
import { useEffect, useState } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore/lite";
import Link from 'next/link';
import { Plus, Edit, Trash2, Package, Search, Filter, Monitor, Archive, Layers, ChevronLeft, ChevronRight, AlertTriangle, X, Download, Eye, Calendar, Users, Activity, TrendingUp, ShoppingCart, ArrowRight, ArrowLeft, MapPin, Phone, ShoppingBag, ChevronDown, ChevronUp, Menu, Settings, Target, Mail, Crown, UserMinus, Database, Layout, MonitorSmartphone, LinkIcon, FolderTree, CheckSquare, Square, ExternalLink, Save, Loader2, ImageIcon, PackageSearch, Box, AlertCircle, Tag } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

export default function ProductsList() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const db = getDb();
        const querySnapshot = await getDocs(collection(db, "products"));
        const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(list);
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    };
    fetchProducts();
  }, []);

  const handleDelete = async (id) => {
    if(!confirm("هل أنت متأكد من حذف هذا المنتج بشكل نهائي؟")) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, "products", id));
      setProducts(products.filter(p => p.id !== id));
      // تم الحذف بنجاح (ممكن تستخدم Toast مستقبلاً بدل Alert)
    } catch (error) {
      alert("حدث خطأ أثناء الحذف");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#202223] font-sans p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        
        {/* الهيدر العلوي */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#202223]">المنتجات</h1>
            <p className="text-sm text-gray-500 mt-1">إدارة جميع منتجات متجرك، وتحديث المخزون والأسعار.</p>
          </div>
          <Link 
            href="/admin/products/create" 
            className="w-full sm:w-auto bg-[#008060] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#006e52] transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus size={18} /> إضافة منتج
          </Link>
        </div>

        {/* كارت الجدول */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-4 w-16 text-center">الصورة</th>
                  <th className="p-4">تفاصيل المنتج</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">المخزون</th>
                  <th className="p-4">القسم</th>
                  <th className="p-4">السعر</th>
                  <th className="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => {
                  
                  // --- معالجة ذكية للبيانات لدعم الطريقة القديمة والجديدة (Shopify) ---
                  
                  // 1. تحديد الصورة
                  const displayImage = product.images?.[0] || product.mainImageUrl || product.image;
                  
                  // 2. تحديد السعر
                  const displayPrice = product.price || (product.variants && product.variants[0]?.price) || "0";
                  
                  // 3. تحديد القسم (نعطي الأولوية لبيانات شوبيفاي ثم القديمة)
                  let displayCategory = 'عام';
                  if (product.type) displayCategory = product.type;
                  else if (product.category) displayCategory = product.category;
                  else if (product.collections) displayCategory = product.collections;
                  else if (Array.isArray(product.categories) && product.categories.length > 0) displayCategory = product.categories.join('، ');

                  // 4. المخزون والحالة (قيم افتراضية للجماليات إذا لم تكن موجودة في الداتا)
                  const displayStock = product.inventory_quantity ?? product.stock ?? "متوفر";
                  const status = product.status || 'active'; // افتراض أن المنتج نشط

                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors group">
                      
                      {/* الصورة */}
                      <td className="p-4">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                          {displayImage ? (
                            <img 
                              src={displayImage} 
                              className="w-full h-full object-cover" 
                              alt={product.title || 'Product'}
                            />
                          ) : (
                            <ImageIcon size={20} className="text-gray-400" />
                          )}
                        </div>
                      </td>
                      
                      {/* تفاصيل المنتج (الاسم والـ ID) */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-[#005bd3] group-hover:underline cursor-pointer transition-all">
                            {product.title || 'بدون اسم'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono mt-0.5" dir="ltr">
                            #{product.id.slice(0, 8)}
                          </span>
                        </div>
                      </td>

                      {/* الحالة */}
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          status === 'active' ? 'bg-[#cceebd] text-[#006e52]' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-[#006e52]' : 'bg-gray-500'}`}></span>
                          {status === 'active' ? 'نشط' : 'مسودة'}
                        </span>
                      </td>

                      {/* المخزون */}
                      <td className="p-4">
                        <span className="text-xs text-gray-600 font-medium flex items-center gap-1.5">
                          {displayStock === 0 ? (
                            <span className="text-red-500 flex items-center gap-1"><AlertCircle size={14}/> نفذت الكمية</span>
                          ) : (
                            <>{displayStock} متوفر</>
                          )}
                        </span>
                      </td>

                      {/* القسم */}
                      <td className="p-4">
                        <span className="bg-gray-100 border border-gray-200 text-gray-600 text-[11px] px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 w-fit">
                          <Tag size={12} className="text-gray-400" /> {displayCategory}
                        </span>
                      </td>

                      {/* السعر */}
                      <td className="p-4 font-bold text-sm text-[#202223]">
                        {displayPrice} <span className="text-[10px] text-gray-500 font-normal">ج.م</span>
                      </td>

                      {/* إجراءات (تعديل وحذف) */}
                      <td className="p-4 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {/* رابط التعديل يرسل الـ ID كـ Query Parameter ليتم سحبه في صفحة الإنشاء */}
                          <Link 
                            href={`/admin/products/create?id=${product.id}`} 
                            className="p-2 text-gray-500 hover:text-[#005bd3] hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="تعديل المنتج"
                          >
                            <Edit size={16} />
                          </Link>
                          <button 
                            onClick={() => handleDelete(product.id)} 
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="حذف المنتج"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* حالة الفراغ (Empty State) إذا لم توجد منتجات */}
          {products.length === 0 && (
            <div className="p-16 text-center flex flex-col items-center justify-center bg-white">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                <PackageSearch size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-[#202223] mb-2">لا توجد منتجات حتى الآن</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm">
                متجرك جاهز للعمل! ابدأ بإضافة منتجاتك الأولى لعرضها للعملاء وتحقيق المبيعات.
              </p>
              <Link 
                href="/admin/products/create" 
                className="bg-white border border-gray-300 text-[#202223] px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus size={16} /> إضافة منتجك الأول
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}