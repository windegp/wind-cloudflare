"use client";
import { useEffect, useState, useRef } from "react";
import { useCart } from "../../context/CartContext";
import Link from "next/link";
import { ShoppingBag, Trash2, X, Plus, ZoomIn, Loader2, Minus, Eye } from '@/components/icons-extra';
import { getDb } from "../../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, documentId } from "firebase/firestore/lite";
import { products as staticProducts } from "../../lib/products";
import QuickViewModal from "@/components/QuickViewModal"; 

export default function CartDrawer() {
  const { cartItems, isCartOpen, toggleCart, removeFromCart, updateQty, subtotal } = useCart();
  
  const [suggestedProducts, setSuggestedProducts] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  // منع السكرول عند فتح السلة أو المودال
  useEffect(() => {
    if (isCartOpen || quickViewProduct) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isCartOpen, quickViewProduct]);

  // جلب المنتجات المقترحة (المنطق الأصلي مع تحسين الأداء)
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!isCartOpen || cartItems.length === 0) {
        setSuggestedProducts([]);
        return;
      }
      setIsLoadingSuggestions(true);
      try {
        let handles = [];
        cartItems.forEach(item => {
          const metafields = item.metafields || {};
          const crossSells = metafields.cartCrossSellHandles;
          if (crossSells && typeof crossSells === 'string') {
            handles.push(...crossSells.split(',').map(h => h.trim()).filter(Boolean));
          }
        });

        handles = [...new Set(handles)]; // مسح التكرار
        // Safe flatMap alternative for legacy browsers: use map + flat
        const cartIdsAndHandles = cartItems.map(item => [
          item.id.toString(), 
          item.handle, 
          (item.seo && item.seo.handle) || null
        ]).flat().filter(Boolean);
        handles = handles.filter(h => !cartIdsAndHandles.includes(h));

        let fetchedProducts = [];
        
        // 1. البحث في الملف الستاتيك (صفر كوتا)
        handles.forEach(h => {
          const sp = staticProducts.find(p => {
            const seoHandle = (p.seo && p.seo.handle) || null;
            return p.id.toString() === h || p.handle === h || seoHandle === h;
          });
          if (sp && !fetchedProducts.some(fp => fp.id === sp.id)) fetchedProducts.push(sp);
        });

        // 2. 🛡️ جلب المنتجات الناقصة من فايربيز في قراءة واحدة (Batch Fetch)
        // قص العدد لـ 10 بس (لأننا محتاجين 6 بس للعرض) عشان حماية الـ Limits
        const missingHandles = handles
          .filter(h => !fetchedProducts.some(fp => fp.id.toString() === h || fp.handle === h))
          .slice(0, 10);

        if (missingHandles.length > 0) {
          const db = getDb();
          
          // أ. البحث عن طريق الـ ID (العملية الأسرع)
          const qById = query(collection(db, "products"), where(documentId(), "in", missingHandles));
          const snapById = await getDocs(qById);
          
          snapById.docs.forEach(ds => {
            if (!cartIdsAndHandles.includes(ds.id)) {
              fetchedProducts.push({ id: ds.id, ...ds.data() });
            }
          });

          // ب. البحث عن طريق خانة الـ Handle للمنتجات اللي لسه مجاتش
          const foundIds = snapById.docs.map(d => d.id);
          const stillMissing = missingHandles.filter(h => !foundIds.includes(h));
          
          if (stillMissing.length > 0) {
            const qByField = query(collection(db, "products"), where("handle", "in", stillMissing));
            const snapByField = await getDocs(qByField);
            snapByField.docs.forEach(ds => {
              if (!cartIdsAndHandles.includes(ds.id)) {
                fetchedProducts.push({ id: ds.id, ...ds.data() });
              }
            });
          }
        }

        // 3. لو مفيش أي مقترحات مخصصة، نستخدم منطق الـ Fallback (المنتجات المشابهة)
        if (fetchedProducts.length === 0) {
          const firstItem = cartItems[0];
          const refValue = (Array.isArray(firstItem.categories) && firstItem.categories[0]) ||
                           (Array.isArray(firstItem.collections) && firstItem.collections[0]) ||
                           firstItem.type;

          if (refValue) {
            let fallbacks = staticProducts.filter(p => {
              const matchCat = Array.isArray(p.categories) ? p.categories.includes(refValue) : p.categories === refValue;
              const matchCol = Array.isArray(p.collections) ? p.collections.includes(refValue) : p.collections === refValue;
              return (matchCat || matchCol || p.type === refValue) && !cartIdsAndHandles.includes(p.id.toString());
            });
            fetchedProducts.push(...fallbacks);
          }
        }
        
        setSuggestedProducts(fetchedProducts.slice(0, 6));
      } catch (error) { 
        console.error("WIND Error: Suggested products fetch failed", error); 
      } finally { 
        setIsLoadingSuggestions(false); 
      }
    };
    fetchSuggestions();
  }, [isCartOpen, cartItems]);

  const formatVariable = (val) => {
    if (!val) return '';
    let str = val.toString().trim().replace(/\[\s*/g, '[ ').replace(/\s*\]/g, ' ]');
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getImageUrl = (product) => {
    let img = product?.mainImage || product?.image || product?.images?.[0];
    if (!img) return "https://placehold.co/150x200";
    if (img.startsWith("http")) return img;
    if (product?.folderName) return `/images/products/${product.folderName}/${img}`;
    return "https://placehold.co/150x200";
  };

  const openQuickView = (product) => {
    setQuickViewProduct(product);
  };

  // [DEBUG] Experiment 1: Force CartDrawer to render unconditionally
  // Ignoring isCartOpen state to test whether the issue is in state propagation
  // or in the rendering/portal mechanism itself.
  // if (!isCartOpen) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&family=Tajawal:wght@400;500;700&display=swap');
        .cart-drawer * { font-family: 'Cairo', sans-serif; }
        @keyframes slideInLeft { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .cart-panel { animation: slideInLeft 0.28s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .cart-overlay { animation: fadeIn 0.2s ease forwards; }
        .cart-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .cart-scroll::-webkit-scrollbar-track { background: transparent; }
        .cart-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
        .checkout-btn { background-color: #1A1A1A !important; color: #FFFFFF !important; transition: all 0.3s; }
        .checkout-btn:hover { background-color: #333333 !important; transform: translateY(-2px); }
        .suggested-item img { transition: transform 0.5s ease; }
        .suggested-item:hover img { transform: scale(1.05); }
      `}</style>

      {/* المودال الموحد - يقرأ الداتا بذكاء */}
      <QuickViewModal 
        product={quickViewProduct} 
        isOpen={!!quickViewProduct} 
        onClose={() => setQuickViewProduct(null)} 
      />

      <div className="cart-drawer fixed inset-0 z-[1000] overflow-hidden" dir="rtl">
        <div className="cart-overlay absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={toggleCart} />
        <div className="absolute inset-y-0 left-0 flex max-w-full">
          <div className="cart-panel w-[85vw] max-w-[390px] bg-white flex flex-col shadow-2xl">
            
            <div className="bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100 z-10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 bg-[#1A1A1A]/10 rounded-xl flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-[#1A1A1A]" />
                  </div>
                  {cartItems.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-[#1A1A1A] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                      {cartItems.reduce((acc, i) => acc + i.qty, 0)}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="font-light text-[#1A1A1A] text-base leading-tight">حقيبة التسوق</h2>
                  <p className="text-[11px] text-gray-500 font-normal">
                    {cartItems.length === 0 ? 'لا توجد منتجات' : `${cartItems.length} منتجات`}
                  </p>
                </div>
              </div>
              <button onClick={toggleCart} className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center border border-gray-100"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto cart-scroll bg-white">
              <div className="px-5 py-2">
                {cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-5"><ShoppingBag className="w-10 h-10 text-gray-300" strokeWidth={1.5} /></div>
                    <p className="font-bold text-[#1A1A1A] text-base mb-1">حقيبتك فارغة</p>
                    <button onClick={toggleCart} className="bg-[#1A1A1A] text-white px-8 py-3 rounded-full font-bold text-sm mt-6">مواصلة التسوق</button>
                  </div>
                ) : (
                  cartItems.map((item) => (
                    <div key={`${item.id}-${item.selectedSize}-${item.selectedColor || ''}`} className="flex gap-4 py-5 border-b border-gray-100 last:border-0">
                      <div className="relative w-20 h-28 bg-gray-50 rounded-xl overflow-hidden shrink-0 cursor-pointer" onClick={() => openQuickView(item)}>
                        <img src={getImageUrl(item)} alt={item.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"><ZoomIn className="text-white" size={24} /></div>
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-0.5 text-right">
                        <div>
                          <h3 className="font-bold text-[#1A1A1A] text-sm leading-snug line-clamp-1">
                            {item.title}
                          </h3>
                          {(item.selectedColor || item.selectedSize) && (
                            <p className="text-[11px] text-gray-400 font-medium mt-0.5 line-clamp-1">
                              {formatVariable(item.selectedColor)}{item.selectedColor && item.selectedSize ? ' / ' : ''}{formatVariable(item.selectedSize)}
                            </p>
                          )}
                          <div className="flex items-center gap-1 text-gray-500 text-sm mt-1.5 font-medium whitespace-nowrap">
                            <span className="font-bold text-[#1A1A1A]">{item.price}</span><span className="text-[#1A1A1A] font-light">ج.م</span>
                            <span className="mx-1 text-xs text-[#555]">×</span><span>{item.qty}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center border border-gray-200 rounded-md bg-white h-8">
                            <button onClick={() => updateQty(item.id, item.selectedSize, 1, item.selectedColor)} className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-black">+</button>
                            <span className="w-8 text-center text-sm font-bold text-[#1A1A1A]">{item.qty}</span>
                            <button onClick={() => updateQty(item.id, item.selectedSize, -1, item.selectedColor)} className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-black">−</button>
                          </div>
                          <button onClick={() => removeFromCart(item.id, item.selectedSize, item.selectedColor)} className="text-gray-400 hover:text-red-500 flex items-center gap-1.5 group">
                            <span className="text-sm font-medium underline decoration-gray-300 group-hover:decoration-red-500 underline-offset-4">إزالة</span>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cartItems.length > 0 && suggestedProducts.length > 0 && (
                <div className="bg-[#FAF9F6] border-t border-gray-100 pt-5 pb-6 px-5">
                  <h3 className="text-sm font-light text-[#1A1A1A] mb-4">أكمل إطلالتك</h3>
                  {isLoadingSuggestions ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto cart-scroll pb-2">
                      {suggestedProducts.map((product) => (
                        <div key={product.id} onClick={() => openQuickView(product)} className="suggested-item w-[110px] shrink-0 cursor-pointer">
                          <div className="w-full h-[140px] rounded-xl overflow-hidden bg-white border border-gray-100 mb-2 relative">
                            <img src={getImageUrl(product)} alt={product.title} className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-sm text-gray-800"><Eye size={14} /></div>
                          </div>
                          <h4 className="text-xs font-bold text-gray-800 line-clamp-1 mb-1">{formatVariable(product.title)}</h4>
                          <p className="text-xs text-gray-500 font-bold">{product.price} ج.م</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="bg-white border-t border-gray-100 px-5 pt-4 pb-6 z-10 shadow-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-light text-[#1A1A1A] whitespace-nowrap">المجموع الفرعي</span>
                  <span className="font-normal text-[#1A1A1A] text-lg whitespace-nowrap">{subtotal} <span className="text-sm font-light">ج.م</span></span>
                </div>
                <p className="text-[12px] text-gray-400 mb-5 font-medium">مصاريف الشحن تُحسب عند الدفع</p>
                <Link href="/checkout" onClick={toggleCart} className="checkout-btn block w-full text-center font-medium py-4 rounded-xl text-[15px] shadow-md tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">إتمام الطلب — {subtotal} ج.م</Link>
                <button onClick={toggleCart} className="block w-full text-center text-[13px] font-normal text-[#555] hover:text-[#1A1A1A] mt-4">متابعة التسوق</button>
                <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-gray-100">
                  {[
                    { name: "Mastercard", url: "https://ik.imagekit.io/windeg/WIND_Shopping/mastercard.svg" },
                    { name: "Visa",       url: "https://ik.imagekit.io/windeg/WIND_Shopping/visa.svg" },
                    { name: "Meeza",      url: "https://ik.imagekit.io/windeg/WIND_Shopping/Meeza.svg" },
                    { name: "Amex",       url: "https://ik.imagekit.io/windeg/WIND_Shopping/amex-svgrepo-com.svg" },
                  ].map((p) => (
                    <img key={p.name} src={p.url} alt={p.name} className="h-6 w-auto object-contain opacity-80" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}