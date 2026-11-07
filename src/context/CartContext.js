"use client";
// ============================================
// 🛒 CART CONTEXT
// ============================================
import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { calculateSubtotal, calculateShipping, calculateDiscount, calculateTotal, calculateAllTotals } from '@/lib/cartCalculations';
import { useSettings } from '@/context/SettingsContext';

const CartContext = createContext();

export function CartProvider({ children }) {
  const { settings } = useSettings();

  // إعدادات الشحن — تييجي من SettingsContext أو مباشرة من Firestore لو promotions مش موجودة
  const [promoSettings, setPromoSettings] = useState(null);

  // 🔥 المحافظة المختارة حالياً في Checkout — نفس القيمة الافتراضية بتاعة formData.governorate
  // عشان الحساب الأول يتطابق مع القيمة الظاهرة فعلياً في الـ select من أول render
  const [selectedGovernorate, setSelectedGovernorate] = useState('القاهرة');

  useEffect(() => {
    // لو الـ settings جاءت وفيها promotions → استخدمها مباشرة
    if (settings?.promotions) {
      setPromoSettings(settings.promotions);
      return;
    }
    // لو مفيش promotions في الـ cache → اجيبها fresh من Firestore
    if (settings === null) return; // لسه بيحمّل
    const fetchFresh = async () => {
      try {
        const res = await fetch('/api/site-settings?fresh=true');
        const data = await res.json();
        if (data?.success && data?.data?.promotions) {
          setPromoSettings(data.data.promotions);
        }
      } catch {}
    };
    fetchFresh();
  }, [settings]);

  const shippingSettings = useMemo(() => ({
    // 🔥 سعر المحافظة (لو موجود) بيحل محل السعر العام تماماً — مش بيتجمع معاه
    shippingCost:          promoSettings?.shippingCostByGovernorate?.[selectedGovernorate]
                         ?? settings?.promotions?.shippingCostByGovernorate?.[selectedGovernorate]
                         ?? promoSettings?.shippingCost          ?? settings?.promotions?.shippingCost          ?? 70,
    freeShippingThreshold: promoSettings?.freeShippingThreshold ?? settings?.promotions?.freeShippingThreshold ?? 0,
    firstOrderEnabled:     promoSettings?.firstOrderEnabled     ?? settings?.promotions?.firstOrderEnabled     ?? false,
    firstOrderDiscount:    promoSettings?.firstOrderDiscount    ?? settings?.promotions?.firstOrderDiscount    ?? 0,
  }), [promoSettings, settings, selectedGovernorate]);

  // هل العميل الحالي مؤهل لخصم الطلب الأول؟
  const [isFirstOrder, setIsFirstOrder] = useState(false);

  // ── State ──────────────────────────────────────────────────────
const [cartItems,     setCartItems]     = useState([]);
const [cartItemsLoaded, setCartItemsLoaded] = useState(false);
const cartEmptyCleanupInitialized = useRef(false);
const previousCartHadItems = useRef(false);

// Customer-selected gifts are separate from paid cart lines and legacy auto-gift variants.
const [customerChoiceGiftSelections, setCustomerChoiceGiftSelections] = useState([]);
  const [customerChoiceGiftSelectionsLoaded, setCustomerChoiceGiftSelectionsLoaded] = useState(false);
  const [offerGiftSelections, setOfferGiftSelections] = useState({});
  const [offerGiftSelectionsLoaded, setOfferGiftSelectionsLoaded] = useState(false);
  const [isCartOpen,    setIsCartOpen]    = useState(false);
  const [appliedPromo,  setAppliedPromo]  = useState(null);   // { code, type, freeShipping, discountAmount, message, ... }
  const [discountError, setDiscountError] = useState("");
  const [promoLoading,  setPromoLoading]  = useState(false);

  // العروض النشطة (من /api/offers) — لو فشل التحميل بنكمل بدون عروض والسلة تشتغل زي ما هي
  const [offers, setOffers] = useState([]);
  const [freeShippingRule, setFreeShippingRule] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/offers');
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.offers)) {
          setOffers(data.offers);
          setFreeShippingRule(data.shippingRules || null);
        }
      } catch { /* بدون عروض */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Cart ops ───────────────────────────────────────────────────
  const toggleCart = useCallback(() => setIsCartOpen(p => !p), []);
  const openCart   = useCallback(() => setIsCartOpen(true),    []);
  const closeCart  = useCallback(() => setIsCartOpen(false),   []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setCustomerChoiceGiftSelections([]);
    setOfferGiftSelections({});
    setAppliedPromo(null);
    localStorage.removeItem('wind_cart');
    localStorage.removeItem('wind_customer_choice_gifts');
    localStorage.removeItem('wind_offer_gift_variants');
  }, []);

  const addCustomerChoiceGift = useCallback((product) => {
    if (!product || !(product.id || product.productId || product.handle)) return;
    const selectionId = globalThis.crypto?.randomUUID?.() || `gift-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCustomerChoiceGiftSelections((prev) => [
      ...prev,
      {
        ...product,
        selectionId,
        id: String(product.id || product.productId || product.handle),
        productId: String(product.productId || product.id || product.handle),
        handle: String(product.handle || product.productHandle || product.id || product.productId),
        productHandle: String(product.productHandle || product.handle || product.id || product.productId),
        title: product.title || product.name || "",
        price: Number(product.price) || 0,
        image: product.image || product.mainImage || product.images?.[0] || "",
        selectedColor: product.selectedColor || "",
        selectedSize: product.selectedSize || "",
        qty: 1,
      },
    ]);
  }, []);

  const removeCustomerChoiceGift = useCallback((selectionId) => {
    setCustomerChoiceGiftSelections((prev) => prev.filter((item) => item.selectionId !== selectionId));
  }, []);

  const addToCart = useCallback((product) => {
    setCartItems(prev => {
      const exist = prev.find(item =>
        item.id === product.id &&
        item.selectedSize  === product.selectedSize &&
        item.selectedColor === product.selectedColor &&
        (item.bundleGroupId || "") === (product.bundleGroupId || "") &&
        (item.bundleRole || "") === (product.bundleRole || "")
      );
      const qty = product.qty || 1;
      if (exist) {
        return prev.map(item =>
          (item.id === product.id &&
           item.selectedSize  === product.selectedSize &&
           item.selectedColor === product.selectedColor &&
           (item.bundleGroupId || "") === (product.bundleGroupId || "") &&
           (item.bundleRole || "") === (product.bundleRole || ""))
            ? { ...item, qty: item.qty + qty }
            : item
        );
      }
      return [...prev, { ...product, qty }];
    });
    openCart();
  }, [openCart]);

  const updateCartItemVariant = useCallback((originalItem, selection) => {
    // Automatically added gifts are not paid cart units. Save their variant
    // choice separately so editing a gift never removes one of the paid units.
    if (originalItem?.__customerChoiceGiftSelectionId) {
      const selectionId = String(originalItem.__customerChoiceGiftSelectionId);
      setCustomerChoiceGiftSelections((prev) => prev.map((item) =>
        item.selectionId === selectionId
          ? {
              ...item,
              selectedSize: selection.selectedSize || "",
              selectedColor: selection.selectedColor || "",
              image: selection.image || item.image || "",
            }
          : item
      ));
      return;
    }

    if (originalItem?.__autoOfferGiftKey) {
      const giftKey = String(originalItem.__autoOfferGiftKey);
      setOfferGiftSelections((prev) => ({
        ...prev,
        [giftKey]: {
          selectedSize: selection.selectedSize || "",
          selectedColor: selection.selectedColor || "",
          image: selection.image || originalItem.image || "",
        },
      }));
      return;
    }

    setCartItems((prev) => {
      // وحدة العرض تُفصل عن باقي الكمية قبل تغيير اللون أو المقاس.
      if (originalItem.__offerBenefitUnit === true) {
        const targetIndex = Number(originalItem.__cartIndex);
        const target = prev[targetIndex];
        if (!target || target.id !== originalItem.id) return prev;

        const updatedUnit = {
          ...target,
          qty: 1,
          selectedSize: selection.selectedSize,
          selectedColor: selection.selectedColor,
          image: selection.image || target.image,
        };
        const remainingItems = prev.filter((_, index) => index !== targetIndex);
        if (target.qty > 1) {
          remainingItems.splice(targetIndex, 0, { ...target, qty: target.qty - 1 });
        }

        const duplicateIndex = remainingItems.findIndex((item) =>
          item.id === updatedUnit.id &&
          item.selectedSize === updatedUnit.selectedSize &&
          item.selectedColor === updatedUnit.selectedColor &&
          (item.bundleGroupId || "") === (updatedUnit.bundleGroupId || "") &&
          (item.bundleRole || "") === (updatedUnit.bundleRole || "")
        );

        if (duplicateIndex >= 0) {
          return remainingItems.map((item, index) =>
            index === duplicateIndex
              ? { ...item, qty: item.qty + 1, image: updatedUnit.image }
              : item
          );
        }
        return [...remainingItems, updatedUnit];
      }

      const targetIndex = prev.findIndex((item) =>
        item.id === originalItem.id &&
        item.selectedSize === originalItem.selectedSize &&
        item.selectedColor === originalItem.selectedColor &&
        (item.bundleGroupId || "") === (originalItem.bundleGroupId || "") &&
        (item.bundleRole || "") === (originalItem.bundleRole || "")
      );
      if (targetIndex < 0) return prev;

      const target = prev[targetIndex];
      const updated = {
        ...target,
        selectedSize: selection.selectedSize,
        selectedColor: selection.selectedColor,
        image: selection.image || target.image,
      };
      const duplicateIndex = prev.findIndex((item, index) =>
        index !== targetIndex &&
        item.id === updated.id &&
        item.selectedSize === updated.selectedSize &&
        item.selectedColor === updated.selectedColor &&
        (item.bundleGroupId || "") === (updated.bundleGroupId || "") &&
        (item.bundleRole || "") === (updated.bundleRole || "")
      );

      if (duplicateIndex >= 0) {
        return prev.reduce((next, item, index) => {
          if (index === targetIndex) return next;
          if (index === duplicateIndex) {
            next.push({ ...item, qty: item.qty + target.qty });
          } else {
            next.push(item);
          }
          return next;
        }, []);
      }

      return prev.map((item, index) => index === targetIndex ? updated : item);
    });
  }, []);

  const updateCustomerChoiceGiftVariant = useCallback((selectionId, selection) => {
    setCustomerChoiceGiftSelections((prev) => prev.map((item) =>
      item.selectionId === selectionId
        ? {
            ...item,
            selectedSize: selection.selectedSize || "",
            selectedColor: selection.selectedColor || "",
            image: selection.image || item.image || "",
          }
        : item
    ));
  }, []);

  const updateQty = useCallback((id, selectedSize, delta, selectedColor, bundleGroupId, cartIndex) => {
    setCartItems((prev) => {
      const matches = (item, index) =>
        (Number.isInteger(cartIndex) ? index === cartIndex : true) &&
        item.id === id &&
        item.selectedSize === selectedSize &&
        (selectedColor === undefined || item.selectedColor === selectedColor) &&
        (bundleGroupId === undefined || (item.bundleGroupId || "") === (bundleGroupId || ""));
      const targetIndex = prev.findIndex(matches);
      if (targetIndex < 0) return prev;

      const target = prev[targetIndex];
      const newQty = (Number(target.qty) || 0) + delta;
      if (newQty > 0) {
        return prev.map((item, index) => index === targetIndex ? { ...item, qty: newQty } : item);
      }

      // عند وصول الكمية للصفر نحذف السطر فعلياً، مع الحفاظ على سلامة الباقات.
      if (target.bundleGroupId && target.bundleRole === "parent") {
        return prev.filter((item) => item.bundleGroupId !== target.bundleGroupId);
      }

      let next = prev.filter((_, index) => index !== targetIndex);
      if (target.bundleGroupId) {
        const remaining = next.filter((item) => item.bundleGroupId === target.bundleGroupId);
        if (remaining.length === 1 && remaining[0].bundleRole === "parent") {
          const parent = remaining[0];
          next = next.map((item) => item === parent ? {
            ...item,
            price: item.compareAtPrice || item.price,
            compareAtPrice: undefined,
            bundleFreeShipping: undefined,
            bundleGroupId: "",
            bundleParentId: "",
            bundleRole: "",
          } : item);
        }
      }
      return next;
    });
  }, []);

  const removeFromCart = useCallback((id, selectedSize, selectedColor, bundleGroupId, cartIndex) => {
    setCartItems(prev => {
      const matchColor = selectedColor !== undefined
        ? (item) => item.selectedColor === selectedColor
        : () => true;
      const target = prev.find((item, index) =>
        (Number.isInteger(cartIndex) ? index === cartIndex : true) &&
        item.id === id &&
        item.selectedSize === selectedSize &&
        matchColor(item) &&
        (bundleGroupId === undefined || (item.bundleGroupId || "") === (bundleGroupId || ""))
      );

      // إزالة المنتج الأساسي تزيل كل عناصر نفس الباقة حتى لا تبقى باقة يتيمة.
      if (target?.bundleGroupId && target.bundleRole === "parent") {
        return prev.filter(item => item.bundleGroupId !== target.bundleGroupId);
      }

      let next = prev.filter((item, index) =>
        Number.isInteger(cartIndex)
          ? index !== cartIndex
          : !(item.id === id &&
            item.selectedSize === selectedSize &&
            matchColor(item) &&
            (bundleGroupId === undefined || (item.bundleGroupId || "") === (bundleGroupId || "")))
      );

      // لو أزيل آخر منتج إضافي، أعد المنتج الأساسي لسعره الأصلي.
      if (target?.bundleGroupId) {
        const remaining = next.filter(item => item.bundleGroupId === target.bundleGroupId);
        if (remaining.length === 1 && remaining[0].bundleRole === "parent") {
          const parent = remaining[0];
          next = next.map(item => item === parent ? {
            ...item,
            price: item.compareAtPrice || item.price,
            compareAtPrice: undefined,
            bundleFreeShipping: undefined,
            bundleGroupId: "",
            bundleParentId: "",
            bundleRole: "",
          } : item);
        }
      }

      return next;
    });
  }, []);

  // ── Calculations ───────────────────────────────────────────────
  const {
    subtotal, discount, shipping, total, discountSource, appliedOffer, appliedOffers, offerBenefits, customerChoiceGiftStatus,
  } = useMemo(
    () => calculateAllTotals(cartItems, appliedPromo, shippingSettings, isFirstOrder, offers, freeShippingRule, customerChoiceGiftSelections),
    [cartItems, appliedPromo, shippingSettings, isFirstOrder, offers, freeShippingRule, customerChoiceGiftSelections]
  );

  // لو عرض تلقائي كسب على كود الخصم: نوضح للعميل إن الكود ما اتطبقش
  // (الحساب نفسه بيستخدم appliedPromo الأصلي — ده للعرض فقط)
  const appliedPromoView = useMemo(() => {
    if (
      (discountSource === 'offer' || discountSource === 'first_order') &&
      appliedPromo?.valid &&
      appliedPromo.type !== 'free_shipping'
    ) {
      const winnerLabel = discountSource === 'offer'
        ? `عرض "${appliedOffer?.name || ''}"`
        : "خصم الطلب الأول";
      return {
        ...appliedPromo,
        message: `تم تطبيق ${winnerLabel} لأنه يوفّر لك خصماً أكبر — لم يتم تطبيق كود الخصم.`,
      };
    }
    return appliedPromo;
  }, [appliedPromo, discountSource, appliedOffer]);

  // ── Promo code — server-side validation ───────────────────────
  const applyPromoCode = useCallback(async (code, customerEmail = "", customerPhone = "") => {
    if (!code?.trim()) {
      setDiscountError("الرجاء إدخال كود الخصم");
      return { success: false };
    }
    setPromoLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/api/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          customerEmail,
          customerPhone,
          cartItems,
          subtotal,
        }),
      });
      const result = await res.json();

      if (result.valid) {
        setAppliedPromo({ ...result, valid: true });
        setDiscountError("");
        return { success: true, message: result.message };
      } else {
        setAppliedPromo(null);
        setDiscountError(result.message || "كود غير صالح");
        return { success: false, message: result.message };
      }
    } catch (err) {
      setDiscountError("حدث خطأ، حاول مرة أخرى");
      return { success: false };
    } finally {
      setPromoLoading(false);
    }
  }, [cartItems, subtotal]);

  const removePromoCode = useCallback(() => {
    setAppliedPromo(null);
    setDiscountError("");
  }, []);

  // ── Persistence ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wind_offer_gift_variants');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setOfferGiftSelections(parsed);
        }
      }
    } catch {
      localStorage.removeItem('wind_offer_gift_variants');
    } finally {
      setOfferGiftSelectionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!offerGiftSelectionsLoaded) return;
    try {
      localStorage.setItem('wind_offer_gift_variants', JSON.stringify(offerGiftSelections));
    } catch {}
  }, [offerGiftSelections, offerGiftSelectionsLoaded]);

  useEffect(() => {
    if (!customerChoiceGiftSelectionsLoaded) return;
    try {
      localStorage.setItem('wind_customer_choice_gifts', JSON.stringify(customerChoiceGiftSelections));
    } catch {}
  }, [customerChoiceGiftSelections, customerChoiceGiftSelectionsLoaded]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wind_customer_choice_gifts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomerChoiceGiftSelections(parsed.filter((item) => item && typeof item === "object" && item.selectionId));
        }
      }
    } catch {
      localStorage.removeItem('wind_customer_choice_gifts');
    } finally {
      setCustomerChoiceGiftSelectionsLoaded(true);
    }
  }, []);

  useEffect(() => {
  try {
    const saved = localStorage.getItem('wind_cart');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setCartItems(parsed);
      } else {
        localStorage.removeItem('wind_cart');
      }
    }
  } catch {
    localStorage.removeItem('wind_cart');
  } finally {
    setCartItemsLoaded(true);
  }
}, []);

useEffect(() => {
  if (
    !cartItemsLoaded ||
    !customerChoiceGiftSelectionsLoaded ||
    !offerGiftSelectionsLoaded
  ) {
    return;
  }

  if (!cartEmptyCleanupInitialized.current) {
    cartEmptyCleanupInitialized.current = true;
    previousCartHadItems.current = cartItems.length > 0;
    return;
  }

  if (cartItems.length > 0) {
    previousCartHadItems.current = true;
    return;
  }

  if (previousCartHadItems.current) {
    previousCartHadItems.current = false;

    setCustomerChoiceGiftSelections([]);
    setOfferGiftSelections({});
    setAppliedPromo(null);

    localStorage.removeItem('wind_customer_choice_gifts');
    localStorage.removeItem('wind_offer_gift_variants');
  }
}, [
  cartItems,
  cartItemsLoaded,
  customerChoiceGiftSelectionsLoaded,
  offerGiftSelectionsLoaded,
]);

useEffect(() => {
  if (!cartItemsLoaded) return;

  localStorage.setItem('wind_cart', JSON.stringify(cartItems));
}, [cartItems, cartItemsLoaded]);

  const contextValue = useMemo(() => ({
    cartItems,
    offerGiftSelections,
    customerChoiceGiftSelections,
    addCustomerChoiceGift, removeCustomerChoiceGift, updateCustomerChoiceGiftVariant,
    addToCart, removeFromCart, updateQty, updateCartItemVariant, clearCart,
    isCartOpen, toggleCart, openCart, closeCart,
    subtotal, discount, shipping, total,
    discountSource, appliedOffer, appliedOffers, offers, offerBenefits, customerChoiceGiftStatus, freeShippingRule,
    appliedPromo: appliedPromoView,
    applyPromoCode, removePromoCode,
    discountError, setDiscountError, promoLoading,
    shippingSettings,
    isFirstOrder, setIsFirstOrder,
    setSelectedGovernorate,
  }), [
    cartItems, offerGiftSelections, customerChoiceGiftSelections,
    addCustomerChoiceGift, removeCustomerChoiceGift, updateCustomerChoiceGiftVariant,
    addToCart, removeFromCart, updateQty, updateCartItemVariant, clearCart,
    isCartOpen, toggleCart, openCart, closeCart,
    subtotal, discount, shipping, total,
    discountSource, appliedOffer, appliedOffers, offers, offerBenefits, customerChoiceGiftStatus, freeShippingRule,
    appliedPromoView, applyPromoCode, removePromoCode,
    discountError, setDiscountError, promoLoading, shippingSettings,
    isFirstOrder, setIsFirstOrder,
    setSelectedGovernorate,
  ]);

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
