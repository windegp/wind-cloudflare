"use client";
// Final Production Icon Fix - v2.1
import { useEffect, useState } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit, startAfter, doc, deleteDoc, updateDoc, increment, documentId } from "firebase/firestore/lite";
// 🔥 1. أضفنا useRouter بدل Link لقتل الـ Prefetch
import { useRouter } from 'next/navigation'; 
import { Plus, Edit, Trash2, Package, Search, Filter, Monitor, Archive, Layers, ChevronLeft, ChevronRight, AlertTriangle, X, Download, Eye, Calendar, Users, Activity, TrendingUp, ShoppingCart, ArrowRight, ArrowLeft, MapPin, Phone, ShoppingBag, ChevronDown, ChevronUp, Menu, Settings, Target, Mail, Crown, UserMinus, Database, Layout, MonitorSmartphone, LinkIcon, FolderTree, CheckSquare, Square, ExternalLink, Save, Loader2, ImageIcon, PackageSearch, Box, AlertCircle, Tag } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

// 🔥 2. العقل المدبر: ذاكرة مؤقتة على مستوى المتصفح (تمنع إعادة التحميل عند التنقل)
let globalProductsCache = {
  data: [],
  lastVisible: null,
  hasMore: true,
  isLoaded: false
};

// 🎯 OPTIMIZATION: Virtualization for large tables - limits rendered rows to prevent UI freeze
const VIRTUALIZATION_THRESHOLD = 100; // Start virtualizing after 100 products
const VIRTUALIZATION_PAGE_SIZE = 50;  // Render 50 products at a time

export default function ProductsList() {
  const router = useRouter(); // 🔥 تعريف الـ Router
  
  // 🔥 3. نربط الـ State بالذاكرة المؤقتة مباشرة
  const [products, setProducts] = useState(globalProductsCache.data);
  const [lastVisible, setLastVisible] = useState(globalProductsCache.lastVisible);
  const [hasMore, setHasMore] = useState(globalProductsCache.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  
  // 🎯 OPTIMIZATION: Virtualization state for large tables
  const [displayLimit, setDisplayLimit] = useState(VIRTUALIZATION_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const itemsPerPage = 20;

  useEffect(() => {
    // 🔥 4. لا نسحب الداتا إلا إذا كانت الذاكرة فارغة (0 قراءات عند العودة للصفحة)
    if (!globalProductsCache.isLoaded) {
      fetchProducts();
    }
  }, []);

  const fetchProducts = async (loadMore = false) => {
    try {
      setIsLoading(true);
      const db = getDb();
      
      let q = query(
        collection(db, "products"),
        orderBy(documentId()),
        limit(itemsPerPage)
      );
      
      if (loadMore && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }
      
      const querySnapshot = await getDocs(q);
      const newProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
      const newHasMore = querySnapshot.docs.length === itemsPerPage;
      
      let finalProductsList;
      if (loadMore) {
        finalProductsList = [...products, ...newProducts];
        setProducts(finalProductsList);
      } else {
        finalProductsList = newProducts;
        setProducts(finalProductsList);
      }
      
      setLastVisible(newLastVisible);
      setHasMore(newHasMore);
      
      // 🔥 5. تحديث الذاكرة المؤقتة بالبيانات الجديدة
      globalProductsCache.data = finalProductsList;
      globalProductsCache.lastVisible = newLastVisible;
      globalProductsCache.hasMore = newHasMore;
      globalProductsCache.isLoaded = true;
      
      // 🎯 OPTIMIZATION: Reset display limit when loading more
      setDisplayLimit(VIRTUALIZATION_PAGE_SIZE);
      
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchProducts(true);
    }
  };

  const handleDelete = async (id) => {
    if(!confirm("هل أنت متأكد من حذف هذا المنتج بشكل نهائي؟")) return;
    try {
      const db = getDb();
      
      await deleteDoc(doc(db, "products", id));
      
      try {
        const settingsRef = doc(db, "settings", "siteSettings");
        await updateDoc(settingsRef, {
          "counters.products": increment(-1)
        });
      } catch (counterError) {
        console.error("WIND Error: Product counter decrement failed", counterError);
      }

      // 🔥 6. تحديث الواجهة والذاكرة معاً بعد الحذف بدون إعادة سحب
      // 🔥 مسح KV Cache للمنتج المحذوف
      try {
        await fetch('/api/revalidate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'product', id: id }) // استخدم المتغير id الصح
});
      } catch {}

      const updatedProducts = products.filter(p => p.id !== id);
      setProducts(updatedProducts);
      globalProductsCache.data = updatedProducts;
    } catch (error) {
      console.error("WIND Error: Deleting product failed", error);
      alert("حدث خطأ أثناء الحذف");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#202223] font-sans p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#202223]">المنتجات</h1>
            <p className="text-sm text-gray-500 mt-1">إدارة جميع منتجات متجرك، وتحديث المخزون والأسعار.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* 🎯 OPTIMIZATION: Search input for large product lists */}
            <div className="relative">
              <input
                type="text"
                placeholder="بحث في المنتجات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 px-4 py-2.5 pr-10 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20 focus:border-[#008060]"
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            
            {/* 🔥 7. استبدال Link بـ button مع router.push لقتل التحميل المسبق */}
            <button 
              onClick={() => router.push('/admin/products/create')}
              className="w-full sm:w-auto bg-[#008060] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#006e52] transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Plus size={18} /> إضافة منتج
            </button>
            
            {hasMore && (
              <button 
                onClick={loadMore}
                disabled={isLoading}
                className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {isLoading ? <span className="animate-spin h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full"></span> : <Download size={18} />}
                تحميل المزيد
              </button>
            )}
          </div>
        </div>

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
                {/* 🎯 OPTIMIZATION: Virtualized rendering for large tables */}
                {(searchQuery 
                  ? products.filter(p => p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  : products.slice(0, Math.max(VIRTUALIZATION_PAGE_SIZE, displayLimit))
                ).map((product) => {
                  
                  const productImages = product.images || [];
                  const displayImage = productImages[0] || product.mainImageUrl || product.image;
                  const firstVariant = (product.variants && product.variants[0]) || {};
                  const displayPrice = product.price || firstVariant.price || "0";
                  
                  let displayCategory = 'عام';
                  if (product.type) displayCategory = product.type;
                  else if (product.category) displayCategory = product.category;
                  else if (product.collections) displayCategory = product.collections;
                  else if (Array.isArray(product.categories) && product.categories.length > 0) displayCategory = product.categories.join('، ');

                  // Safe nullish coalescing alternative for legacy browser compatibility
                  const displayStock = (product.inventory_quantity != null ? product.inventory_quantity : (product.stock != null ? product.stock : "متوفر"));
                  const status = product.status || 'active'; 

                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="p-4">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                          {displayImage ? (
                            <img src={displayImage} className="w-full h-full object-cover" alt={product.title || 'Product'} />
                          ) : (
                            <ImageIcon size={20} className="text-gray-400" />
                          )}
                        </div>
                      </td>
                      
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

                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          status === 'active' ? 'bg-[#cceebd] text-[#006e52]' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-[#006e52]' : 'bg-gray-500'}`}></span>
                          {status === 'active' ? 'نشط' : 'مسودة'}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="text-xs text-gray-600 font-medium flex items-center gap-1.5">
                          {displayStock === 0 ? (
                            <span className="text-red-500 flex items-center gap-1"><AlertCircle size={14}/> نفذت الكمية</span>
                          ) : (
                            <>{displayStock} متوفر</>
                          )}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="bg-gray-100 border border-gray-200 text-gray-600 text-[11px] px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 w-fit">
                          <Tag size={12} className="text-gray-400" /> {displayCategory}
                        </span>
                      </td>

                      <td className="p-4 font-bold text-sm text-[#202223]">
                        {displayPrice} <span className="text-[10px] text-gray-500 font-normal">ج.م</span>
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {/* 🔥 8. استبدال Link بـ button لقتل التحميل المسبق لصفحة التعديل */}
                          <button 
                            onClick={() => router.push(`/admin/products/create?id=${product.id}`)}
                            className="p-2 text-gray-500 hover:text-[#005bd3] hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="تعديل المنتج"
                          >
                            <Edit size={16} />
                          </button>
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
            
            {/* 🎯 OPTIMIZATION: Virtualization controls for large tables */}
            {!searchQuery && products.length > VIRTUALIZATION_THRESHOLD && displayLimit < products.length && (
              <div className="p-4 border-t border-gray-100 bg-gray-50/50 text-center">
                <button
                  onClick={() => setDisplayLimit(prev => prev + VIRTUALIZATION_PAGE_SIZE)}
                  className="text-sm font-bold text-[#008060] hover:text-[#006e52] transition-colors px-4 py-2 bg-white border border-green-200 rounded-lg shadow-sm"
                >
                  عرض المزيد ({products.length - displayLimit} متبقي)
                </button>
              </div>
            )}
            
            {searchQuery && products.filter(p => p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="p-8 text-center text-gray-500">
                لا توجد منتجات مطابقة للبحث
              </div>
            )}
          </div>

          {products.length === 0 && !isLoading && (
            <div className="p-16 text-center flex flex-col items-center justify-center bg-white">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                <PackageSearch size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-[#202223] mb-2">لا توجد منتجات حتى الآن</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm">
                متجرك جاهز للعمل! ابدأ بإضافة منتجاتك الأولى لعرضها للعملاء وتحقيق المبيعات.
              </p>
              <button 
                onClick={() => router.push('/admin/products/create')}
                className="bg-white border border-gray-300 text-[#202223] px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus size={16} /> إضافة منتجك الأول
              </button>
            </div>
          )}
          
          {isLoading && products.length === 0 && (
            <div className="p-16 text-center flex flex-col items-center justify-center bg-white">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                <span className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-transparent rounded-full"></span>
              </div>
              <h3 className="text-lg font-bold text-[#202223] mb-2">جاري تحميل المنتجات</h3>
              <p className="text-sm text-gray-500">يرجى الانتظار...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}