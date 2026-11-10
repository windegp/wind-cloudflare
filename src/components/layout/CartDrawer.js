"use client";
import { useEffect, useState, useRef } from "react";
import { useCart } from "../../context/CartContext";
import Link from "next/link";
import { ShoppingBag, Trash2, X, Plus, ZoomIn, Loader2, Minus, Eye, Edit2 } from '@/components/icons-extra';
import { getDb } from "../../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, documentId } from "firebase/firestore/lite";
import QuickViewModal from "@/components/QuickViewModal"; 

export default function CartDrawer() {
  const {
    cartItems,
    offerGiftSelections,
    customerChoiceGiftSelections,
    customerChoiceGiftStatus,
    offers,
    appliedOffer,
    discountSource,
    isCartOpen,
    toggleCart,
    removeFromCart,
    removeCustomerChoiceGift,
    addCustomerChoiceGift,
    updateQty,
    updateCartItemVariant,
    subtotal,
    discount,
    shipping,
    offerBenefits,
  } = useCart();

  const [suggestedProducts, setSuggestedProducts] = useState([]);
  const [customerChoiceGiftProducts, setCustomerChoiceGiftProducts] = useState([]);
  const [isLoadingCustomerChoiceGiftProducts, setIsLoadingCustomerChoiceGiftProducts] = useState(false);
  const [customerChoicePurchaseProducts, setCustomerChoicePurchaseProducts] = useState([]);
  const [isLoadingCustomerChoicePurchaseProducts, setIsLoadingCustomerChoicePurchaseProducts] = useState(false);
  const [giftProductToAdd, setGiftProductToAdd] = useState(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [editingCartItem, setEditingCartItem] = useState(null);
  const [offerCelebration, setOfferCelebration] = useState(false);
  const previousOfferBenefitRef = useRef(false);
  const hasOfferBenefit = Boolean(
    offerBenefits?.lines?.some((line) => line.discountedUnits?.length) ||
    offerBenefits?.giftLines?.some((line) => line.discountedUnits?.length)
  );

  useEffect(() => {
    if (!isCartOpen) return;
    if (hasOfferBenefit && !previousOfferBenefitRef.current) setOfferCelebration(true);
    previousOfferBenefitRef.current = hasOfferBenefit;
  }, [hasOfferBenefit, isCartOpen]);

  useEffect(() => {
    if (!offerCelebration) return;
    const timer = window.setTimeout(() => setOfferCelebration(false), 1800);
    return () => window.clearTimeout(timer);
  }, [offerCelebration]);

  const [isNavigatingToCheckout, setIsNavigatingToCheckout] = useState(false);
  const checkoutNavigationTimerRef = useRef(null);

  // منع السكرول عند فتح السلة أو المودال
  useEffect(() => {
    if (isCartOpen || quickViewProduct) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isCartOpen, quickViewProduct]);
  // تنظيف مؤقت التنقل عند إزالة السلة من الصفحة.
  useEffect(() => {
    return () => {
      if (checkoutNavigationTimerRef.current) {
        clearTimeout(checkoutNavigationTimerRef.current);
        checkoutNavigationTimerRef.current = null;
      }
    };
  }, []);
    // إلغاء التحويل الاحتياطي إذا أغلق العميل السلة قبل اكتمال التنقل.
  useEffect(() => {
    if (isCartOpen) return;

    if (checkoutNavigationTimerRef.current) {
      clearTimeout(checkoutNavigationTimerRef.current);
      checkoutNavigationTimerRef.current = null;
    }

    setIsNavigatingToCheckout(false);
  }, [isCartOpen]);
  const customerChoiceOffer = customerChoiceGiftStatus?.offerId
    ? offers.find((offer) =>
        String(offer?.id ?? "") === String(customerChoiceGiftStatus.offerId) &&
        offer?.type === "buy_x_get_y_select_gift"
      )
    : null;
  const customerChoiceGiftProductIds = Array.isArray(customerChoiceOffer?.giftProductIds)
    ? customerChoiceOffer.giftProductIds.map(String).filter(Boolean)
    : [];
  const customerChoiceGiftProductIdsKey = JSON.stringify(customerChoiceGiftProductIds);
  const requiredCustomerChoiceGiftQty = Math.max(0, Number(customerChoiceGiftStatus?.requiredGiftQty) || 0);
  const selectedCustomerChoiceGiftQty = Math.max(0, Number(customerChoiceGiftStatus?.selectedGiftQty) || 0);
  const canSelectMoreCustomerChoiceGifts =
    requiredCustomerChoiceGiftQty > selectedCustomerChoiceGiftQty;

  const customerChoicePurchaseProductIds = Array.isArray(customerChoiceOffer?.purchaseProductIds)
    ? customerChoiceOffer.purchaseProductIds.map(String).filter(Boolean)
    : [];
  const customerChoicePurchaseProductIdsKey = JSON.stringify(customerChoicePurchaseProductIds);

  const customerChoiceBuyQty = Math.max(
    1,
    Math.floor(Number(customerChoiceOffer?.config?.buyQty) || 1)
  );

  const totalCartQty = cartItems.reduce(
    (sum, item) => sum + Math.max(0, parseInt(item?.qty, 10) || 0),
    0
  );

  const eligiblePurchaseQty = Math.max(
    0,
    Number(customerChoiceGiftStatus?.eligiblePurchaseQty) || 0
  );

  const nextEligiblePurchaseThreshold =
    (Math.floor(eligiblePurchaseQty / customerChoiceBuyQty) + 1) * customerChoiceBuyQty;

  const remainingEligiblePurchaseQty = Math.max(
    0,
    nextEligiblePurchaseThreshold - eligiblePurchaseQty
  );

  const shouldShowEligiblePurchasePrompt = Boolean(
    customerChoiceOffer &&
    totalCartQty >= nextEligiblePurchaseThreshold &&
    eligiblePurchaseQty < nextEligiblePurchaseThreshold
  );

  // جلب منتجات مجموعة الهدايا المختارة فقط، بدفعات صغيرة لتفادي حدود استعلام Firestore.
  useEffect(() => {
    if (!isCartOpen || !customerChoiceGiftProductIdsKey || customerChoiceGiftProductIdsKey === "[]") {
      setCustomerChoiceGiftProducts([]);
      setIsLoadingCustomerChoiceGiftProducts(false);
      return;
    }

    let cancelled = false;
    const fetchGiftProducts = async () => {
      setIsLoadingCustomerChoiceGiftProducts(true);
      try {
        const ids = JSON.parse(customerChoiceGiftProductIdsKey);
        const db = getDb();
        const batches = [];
        for (let index = 0; index < ids.length; index += 10) {
          batches.push(ids.slice(index, index + 10));
        }

        const snapshots = await Promise.all(
          batches.map((batch) =>
            getDocs(query(collection(db, "products"), where(documentId(), "in", batch)))
          )
        );
        if (cancelled) return;

        const productById = new Map();
        snapshots.forEach((snapshot) => {
          snapshot.docs.forEach((productDoc) => {
            productById.set(productDoc.id, { ...productDoc.data(), id: productDoc.id });
          });
        });
        setCustomerChoiceGiftProducts(ids.map((id) => productById.get(id)).filter(Boolean));
      } catch (error) {
        console.error("WIND Error: Customer-choice gift products fetch failed", error);
        if (!cancelled) setCustomerChoiceGiftProducts([]);
      } finally {
        if (!cancelled) setIsLoadingCustomerChoiceGiftProducts(false);
      }
    };

    fetchGiftProducts();
    return () => { cancelled = true; };
  }, [isCartOpen, customerChoiceGiftProductIdsKey]);

  // جلب المنتجات المؤهلة للشراء عند الحاجة إلى استكمال شرط العرض فقط.
  useEffect(() => {
    if (
      !isCartOpen ||
      !shouldShowEligiblePurchasePrompt ||
      !customerChoicePurchaseProductIdsKey ||
      customerChoicePurchaseProductIdsKey === "[]"
    ) {
      setCustomerChoicePurchaseProducts([]);
      setIsLoadingCustomerChoicePurchaseProducts(false);
      return;
    }

    let cancelled = false;

    const fetchPurchaseProducts = async () => {
      setIsLoadingCustomerChoicePurchaseProducts(true);

      try {
        const ids = JSON.parse(customerChoicePurchaseProductIdsKey);
        const db = getDb();
        const batches = [];

        for (let index = 0; index < ids.length; index += 10) {
          batches.push(ids.slice(index, index + 10));
        }

        const snapshots = await Promise.all(
          batches.map((batch) =>
            getDocs(query(collection(db, "products"), where(documentId(), "in", batch)))
          )
        );

        if (cancelled) return;

        const productById = new Map();

        snapshots.forEach((snapshot) => {
          snapshot.docs.forEach((productDoc) => {
            productById.set(productDoc.id, {
              ...productDoc.data(),
              id: productDoc.id,
            });
          });
        });

        setCustomerChoicePurchaseProducts(
          ids.map((id) => productById.get(id)).filter(Boolean)
        );
      } catch (error) {
        console.error("WIND Error: Eligible purchase products fetch failed", error);
        if (!cancelled) setCustomerChoicePurchaseProducts([]);
      } finally {
        if (!cancelled) setIsLoadingCustomerChoicePurchaseProducts(false);
      }
    };

    fetchPurchaseProducts();

    return () => {
      cancelled = true;
    };
  }, [
    isCartOpen,
    shouldShowEligiblePurchasePrompt,
    customerChoicePurchaseProductIdsKey,
  ]);

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

        // 🛡️ جلب المنتجات المقترحة من فايربيز في قراءة واحدة (Batch Fetch)
        // قص العدد لـ 10 بس (لأننا محتاجين 6 بس للعرض) عشان حماية الـ Limits
        const missingHandles = handles.slice(0, 10);

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
    let img = product?.image || product?.mainImage || product?.mainImageUrl || product?.images?.[0];
    if (!img) return "https://placehold.co/150x200";
    if (img.startsWith("http")) return img;
    if (product?.folderName) return `/images/products/${product.folderName}/${img}`;
    return "https://placehold.co/150x200";
  };

  const openQuickView = (product) => {
    setEditingCartItem(null);
    setGiftProductToAdd(null);
    setQuickViewProduct(product);
  };

  const openCustomerChoiceGiftProduct = (product) => {
    setEditingCartItem(null);
    setGiftProductToAdd(product);
    setQuickViewProduct(product);
  };

  const openCustomerChoiceGiftEditor = (item) => {
    setGiftProductToAdd(null);
    setEditingCartItem({
      ...item,
      __customerChoiceGiftSelectionId: item.selectionId,
    });
    setQuickViewProduct(item);
  };

  const openCartItemEditor = (item, cartIndex, benefit = null) => {
    // Editing an automatically added gift only saves its own color/size selection.
    // Editing a discounted paid unit keeps the existing split-unit behavior.
    setEditingCartItem({
      ...item,
      ...(benefit?.autoAdded
        ? { __autoOfferGiftKey: benefit.giftKey }
        : benefit
          ? { __offerBenefitUnit: true, __cartIndex: cartIndex }
          : {}),
    });
    setQuickViewProduct(item);
  };

  const closeQuickView = () => {
    setQuickViewProduct(null);
    setEditingCartItem(null);
    setGiftProductToAdd(null);
  };

  const getBenefitLabel = (benefit) => {
    if (benefit.free) return "هدية مجانية";
    const labels = (benefit.benefits || []).map((entry) => {
      if (entry.offerType === "nth_percent" || entry.offerType === "cart_percent") {
        return `خصم ${entry.config?.percent || Math.round((entry.discount / entry.originalPrice) * 100)}%`;
      }
      if (entry.offerType === "cart_fixed") return `خصم ${Number(entry.discount.toFixed(2))} ج.م`;
      if (entry.offerType === "buy_x_get_y") {
        const percent = entry.originalPrice > 0 ? Math.round((entry.discount / entry.originalPrice) * 100) : 0;
        return percent >= 100 ? "هدية مجانية" : `خصم ${percent}%`;
      }
      return "خصم العرض";
    });
    return labels.length ? labels.join(" + ") : "خصم العرض";
  };

  const paidCartDisplayRows = cartItems.flatMap((item, cartIndex) => {
    const benefitLine = offerBenefits?.lines?.find((line) => line.cartIndex === cartIndex);
    if (!benefitLine) {
      return [{ key: `regular-${cartIndex}`, item, qty: item.qty, benefit: null, cartIndex }];
    }

    const rows = [];
    if (benefitLine.regularQty > 0) {
      rows.push({ key: `regular-${cartIndex}`, item, qty: benefitLine.regularQty, benefit: null, cartIndex });
    }
    benefitLine.discountedUnits.forEach((benefit) => {
      const giftSelection = benefit.autoAdded
        ? (offerGiftSelections?.[benefit.giftKey] || {})
        : {};
      const displayItem = benefit.autoAdded
        ? {
            ...item,
            selectedColor: giftSelection.selectedColor ?? item.selectedColor,
            selectedSize: giftSelection.selectedSize ?? item.selectedSize,
            image: giftSelection.image || item.image,
            price: benefit.finalPrice,
            compareAtPrice: benefit.originalPrice,
            __autoOfferGiftKey: benefit.giftKey,
          }
        : item;
      rows.push({
        key: `benefit-${cartIndex}-${benefit.unitIndex}`,
        item: displayItem,
        qty: 1,
        benefit,
        cartIndex,
        isAutoAddedGift: benefit.autoAdded === true,
      });
    });
    return rows;
  });

  const customerChoiceGiftBenefitLines = new Map(
    (offerBenefits?.type === "buy_x_get_y_select_gift" ? offerBenefits.giftLines || [] : [])
      .map((line) => [line.selectionId, line])
  );
  const customerChoiceGiftDisplayRows = customerChoiceGiftSelections.map((selection) => {
    const benefitLine = customerChoiceGiftBenefitLines.get(String(selection.selectionId));
    const benefit = benefitLine?.discountedUnits?.[0] || null;
    const isApplied = Boolean(
      offerBenefits?.type === "buy_x_get_y_select_gift" &&
      offerBenefits?.offerId === customerChoiceGiftStatus?.offerId &&
      benefitLine
    );
    const displayItem = benefit
      ? { ...selection, price: benefit.finalPrice, compareAtPrice: benefit.originalPrice }
      : selection;

    return {
      key: `customer-choice-gift-${selection.selectionId}`,
      item: displayItem,
      qty: 1,
      benefit,
      isCustomerChoiceGift: true,
      isPendingCustomerChoiceGift: !isApplied,
      selectionId: selection.selectionId,
      selection,
    };
  });
  const cartDisplayRows = [...paidCartDisplayRows, ...customerChoiceGiftDisplayRows];


  if (!isCartOpen) return null;

  return (
    <>
      {offerCelebration && (
        <div className="offer-confetti-layer" aria-hidden="true">
          {Array.from({ length: 28 }, (_, index) => (
            <span
              key={index}
              className="offer-confetti-piece"
              style={{
                left: `${(index * 37) % 100}%`,
                backgroundColor: ["#E11D48", "#F59E0B", "#10B981", "#3B82F6", "#A855F7"][index % 5],
                animationDelay: `${(index % 7) * 45}ms`,
                transform: `rotate(${index * 31}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes offerConfettiFall {
          0% { opacity: 1; translate: 0 -20px; rotate: 0deg; }
          100% { opacity: 0; translate: 0 105vh; rotate: 720deg; }
        }
        .offer-confetti-layer { position: fixed; inset: 0; z-index: 100; overflow: hidden; pointer-events: none; }
        .offer-confetti-piece { position: absolute; top: -18px; width: 8px; height: 13px; border-radius: 2px; animation: offerConfettiFall 1.55s ease-out forwards; }
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
        onClose={closeQuickView}
        initialSelection={editingCartItem ? {
          selectedSize: editingCartItem.selectedSize,
          selectedColor: editingCartItem.selectedColor,
        } : null}
        variantActionLabel={giftProductToAdd ? "إضافة الهدية" : "حفظ التعديل"}
        variantLoadingLabel={giftProductToAdd ? "جاري إضافة الهدية..." : "جاري الحفظ..."}
        onVariantSelect={giftProductToAdd
          ? (selection) => addCustomerChoiceGift({
              ...giftProductToAdd,
              selectedSize: selection.selectedSize,
              selectedColor: selection.selectedColor,
              image: selection.image || giftProductToAdd.image,
              qty: 1,
            })
          : editingCartItem
            ? (selection) => updateCartItemVariant(editingCartItem, selection)
            : null}
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
                      {cartDisplayRows.reduce((acc, row) => acc + row.qty, 0)}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="font-light text-[#1A1A1A] text-base leading-tight">حقيبة التسوق</h2>
                  <p className="text-[11px] text-gray-500 font-normal">
                    {cartDisplayRows.length === 0 ? 'لا توجد منتجات' : `${cartDisplayRows.length} منتجات`}
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
                  cartDisplayRows.map((row) => {
                    const { item, benefit } = row;
                    return (
                    <div key={row.key} className="flex gap-4 py-5 border-b border-gray-100 last:border-0">
                      <div
                        className="relative w-20 h-28 bg-gray-50 rounded-xl overflow-hidden shrink-0 cursor-pointer"
                        onClick={() => row.isCustomerChoiceGift
                          ? openCustomerChoiceGiftEditor(row.selection)
                          : openCartItemEditor(item, row.cartIndex, benefit)}
                      >
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
                          {row.isPendingCustomerChoiceGift ? (
                            <p className="mt-1.5 text-[11px] text-amber-700 leading-5">
                              اختيار معلّق — لن يُحتسب ضمن الطلب قبل اكتمال العرض.
                            </p>
                          ) : benefit ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                              <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-red-50 text-red-700 border border-red-100">{getBenefitLabel(benefit)}</span>
                              <span className="text-gray-400 line-through text-xs">{benefit.originalPrice} ج.م</span>
                              <span className="font-bold text-[#1A1A1A]">{benefit.finalPrice} ج.م</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-gray-500 text-sm mt-1.5 font-medium whitespace-nowrap">
                              <span className="font-bold text-[#1A1A1A]">{item.price}</span><span className="text-[#1A1A1A] font-light">ج.م</span>
                              <span className="mx-1 text-xs text-[#555]">×</span><span>{row.qty}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          {row.isCustomerChoiceGift ? (
                            <span className={`text-[10px] font-bold rounded-full px-2 py-1 ${row.isPendingCustomerChoiceGift ? "text-amber-700 bg-amber-50 border border-amber-100" : benefit?.free ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-gray-600 bg-gray-100 border border-gray-200"}`}>
                              {row.isPendingCustomerChoiceGift ? "اختيار هدية" : benefit?.free ? "هدية مجانية" : "اختيار ضمن العرض"}
                            </span>
                          ) : row.isAutoAddedGift ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">تُضاف تلقائيًا</span>
                          ) : (
                            <div className="flex items-center border border-gray-200 rounded-md bg-white h-8">
                              <button onClick={() => updateQty(item.id, item.selectedSize, 1, item.selectedColor, item.bundleGroupId || "", row.cartIndex)} className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-black">+</button>
                              <span className="w-8 text-center text-sm font-bold text-[#1A1A1A]">{row.qty}</span>
                              <button onClick={() => updateQty(item.id, item.selectedSize, -1, item.selectedColor, item.bundleGroupId || "", row.cartIndex)} className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-black">−</button>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => row.isCustomerChoiceGift
                                ? openCustomerChoiceGiftEditor(row.selection)
                                : openCartItemEditor(item, row.cartIndex, benefit)}
                              title="تعديل اللون والمقاس"
                              aria-label="تعديل اللون والمقاس"
                              className="text-gray-400 hover:text-[#1A1A1A] flex items-center"
                            >
                              <Edit2 size={15} />
                            </button>
                            {row.isCustomerChoiceGift ? (
                              <button
                                onClick={() => removeCustomerChoiceGift(row.selectionId)}
                                className="text-gray-400 hover:text-red-500 flex items-center gap-1.5 group"
                              >
                                <span className="text-sm font-medium underline decoration-gray-300 group-hover:decoration-red-500 underline-offset-4">إزالة</span>
                                <Trash2 size={15} />
                              </button>
                            ) : !row.isAutoAddedGift ? (
                              <button
                                onClick={() => benefit
                                  ? updateQty(item.id, item.selectedSize, -1, item.selectedColor, item.bundleGroupId || "", row.cartIndex)
                                  : removeFromCart(item.id, item.selectedSize, item.selectedColor, item.bundleGroupId || "", row.cartIndex)}
                                className="text-gray-400 hover:text-red-500 flex items-center gap-1.5 group"
                              >
                                <span className="text-sm font-medium underline decoration-gray-300 group-hover:decoration-red-500 underline-offset-4">إزالة</span>
                                <Trash2 size={15} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
              {cartItems.length > 0 && shouldShowEligiblePurchasePrompt && (
                <div className="mx-5 my-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-[#1A1A1A]">
                      أكمل شرط العرض لتحصل على هديتك
                    </h3>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1A1A1A] border border-amber-200">
                      {eligiblePurchaseQty} / {nextEligiblePurchaseThreshold}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-6 text-gray-700">
                    لديك منتجات غير مؤهلة ضمن السلة. أضف {remainingEligiblePurchaseQty} قطعة من المنتجات المؤهلة لإكمال شرط العرض وفتح اختيار هديتك.
                  </p>

                  {isLoadingCustomerChoicePurchaseProducts ? (
                    <div className="flex justify-center py-5">
                      <Loader2 className="animate-spin text-gray-400" size={22} />
                    </div>
                  ) : customerChoicePurchaseProducts.length > 0 ? (
                    <div className="mt-3 flex gap-3 overflow-x-auto cart-scroll pb-2">
                      {customerChoicePurchaseProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => openQuickView(product)}
                          className="w-[104px] shrink-0 text-right"
                        >
                          <span className="block w-full h-[126px] rounded-lg overflow-hidden bg-white border border-gray-200">
                            <img
                              src={getImageUrl(product)}
                              alt={product.title || "منتج مؤهل"}
                              className="w-full h-full object-cover"
                            />
                          </span>
                          <span className="block mt-2 text-[11px] font-bold text-gray-800 line-clamp-2 min-h-[32px]">
                            {formatVariable(product.title)}
                          </span>
                          <span className="block mt-1 text-[11px] text-gray-500">
                            {product.price} ج.م
                          </span>
                          <span className="block mt-1 text-[10px] font-bold text-amber-700">
                            إضافة المنتج المؤهل
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gray-500">
                      لا توجد منتجات مؤهلة متاحة حاليًا.
                    </p>
                  )}
                </div>
              )}
              {cartItems.length > 0 && customerChoiceOffer && canSelectMoreCustomerChoiceGifts && (
                <div className="mx-5 my-3 rounded-xl border border-gray-200 bg-[#FAF9F6] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-[#1A1A1A]">اختر هداياك بنفسك</h3>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1A1A1A] border border-gray-200">
                      {selectedCustomerChoiceGiftQty} / {requiredCustomerChoiceGiftQty}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-gray-600">
                    {requiredCustomerChoiceGiftQty === 0
                      ? `أضف ${Math.max(1, Number(customerChoiceOffer.config?.buyQty) || 1) - (Math.max(0, Number(customerChoiceGiftStatus?.eligiblePurchaseQty) || 0) % Math.max(1, Number(customerChoiceOffer.config?.buyQty) || 1))} قطعة أخرى من المنتجات المؤهلة أولًا لتفعيل اختيار الهدايا.`
                      : selectedCustomerChoiceGiftQty < requiredCustomerChoiceGiftQty
                        ? `اختر ${requiredCustomerChoiceGiftQty - selectedCustomerChoiceGiftQty} هدية إضافية لتفعيل العرض. لن تُحتسب الاختيارات في الإجمالي قبل اكتمال العدد.`
                        : selectedCustomerChoiceGiftQty > requiredCustomerChoiceGiftQty
                          ? `لديك اختيارات أكثر من العدد المطلوب. أزل ${selectedCustomerChoiceGiftQty - requiredCustomerChoiceGiftQty} هدية لتفعيل العرض.`
                          : discountSource === "offer" && appliedOffer?.id === customerChoiceOffer.id
                            ? "تم تفعيل العرض. تم احتساب الهدايا وتطبيق الخصم على أرخص القطع المشاركة."
                            : "اكتمل اختيار الهدايا، لكن خصمًا آخر هو الأفضل حاليًا؛ لن تُحتسب هذه الهدايا في الإجمالي."}
                  </p>

                  {requiredCustomerChoiceGiftQty > 0 && (
                    <>
                      {isLoadingCustomerChoiceGiftProducts ? (
                        <div className="flex justify-center py-5">
                          <Loader2 className="animate-spin text-gray-400" size={22} />
                        </div>
                      ) : customerChoiceGiftProducts.length > 0 ? (
                        <div className="mt-3 flex gap-3 overflow-x-auto cart-scroll pb-2">
                          {customerChoiceGiftProducts.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              disabled={!canSelectMoreCustomerChoiceGifts}
                              onClick={() => openCustomerChoiceGiftProduct(product)}
                              className="w-[104px] shrink-0 text-right disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <span className="block w-full h-[126px] rounded-lg overflow-hidden bg-white border border-gray-200">
                                <img src={getImageUrl(product)} alt={product.title || "منتج هدية"} className="w-full h-full object-cover" />
                              </span>
                              <span className="block mt-2 text-[11px] font-bold text-gray-800 line-clamp-2 min-h-[32px]">
                                {formatVariable(product.title)}
                              </span>
                              <span className="block mt-1 text-[11px] text-gray-500">{product.price} ج.م</span>
                              <span className="block mt-1 text-[10px] font-bold text-[#1A1A1A]">
                                {canSelectMoreCustomerChoiceGifts ? "اختيار الهدية" : "اكتمل العدد"}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-gray-500">لا توجد منتجات متاحة في مجموعة الهدايا حاليًا.</p>
                      )}
                    </>
                  )}
                </div>
              )}

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
                  <span className="font-normal text-[#1A1A1A] text-base whitespace-nowrap">{subtotal} <span className="text-sm font-light">ج.م</span></span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-green-700 whitespace-nowrap">الخصم المطبق</span>
                    <span className="font-bold text-green-700 text-base whitespace-nowrap">−{discount} <span className="text-sm font-normal">ج.م</span></span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-2 mb-2">
                  <span className="text-sm font-bold text-[#1A1A1A] whitespace-nowrap">الإجمالي بعد الخصم</span>
                  <span className="font-bold text-[#1A1A1A] text-xl whitespace-nowrap">{Math.max(0, subtotal - discount)} <span className="text-sm font-normal">ج.م</span></span>
                </div>
                <p className={`text-[12px] mb-5 font-medium ${shipping === 0 ? "text-emerald-700" : "text-gray-400"}`}>
                  {shipping === 0 ? "تم تفعيل الشحن المجاني لهذا الطلب" : "مصاريف الشحن تُحسب عند الدفع"}
                </p>
                <Link
                  href="/checkout"
                  onClick={(event) => {
                    if (isNavigatingToCheckout) {
                      event.preventDefault();
                      return;
                    }

                    setIsNavigatingToCheckout(true);

                    if (checkoutNavigationTimerRef.current) {
                      clearTimeout(checkoutNavigationTimerRef.current);
                    }

                                        // إذا لم يصل التنقل الداخلي إلى Checkout خلال 8 ثوانٍ،
                    // استخدم تنقلًا كاملًا للصفحة كمسار احتياطي.
                    checkoutNavigationTimerRef.current = window.setTimeout(() => {
                      checkoutNavigationTimerRef.current = null;

                      const currentPath = window.location.pathname;
                      const alreadyOnCheckout =
                        currentPath === "/checkout" ||
                        currentPath.startsWith("/checkout/");

                      if (!alreadyOnCheckout) {
                        window.location.assign("/checkout");
                      }
                    }, 8000);
                  }}
                  aria-busy={isNavigatingToCheckout}
                  aria-disabled={isNavigatingToCheckout}
                  className="checkout-btn block w-full text-center font-medium py-4 rounded-xl text-[15px] shadow-md tracking-wider whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {isNavigatingToCheckout ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 size={17} className="animate-spin" />
                     جارٍ فتح صفحة إتمام الطلب…
                    </span>
                  ) : (
                    `إتمام الطلب — ${Math.max(0, subtotal - discount)} ج.م`
                  )}
                </Link>
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