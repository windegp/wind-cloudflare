"use client";
// ============================================
// 🛒 CART CONTEXT
// ============================================
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { calculateSubtotal, calculateShipping, calculateDiscount, calculateTotal, calculateAllTotals } from '@/lib/cartCalculations';
import { computeOfferBenefits } from '@/lib/offerEngine';
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
  const [isCartOpen,    setIsCartOpen]    = useState(false);
  const [appliedPromo,  setAppliedPromo]  = useState(null);   // { code, type, freeShipping, discountAmount, message, ... }
  const [discountError, setDiscountError] = useState("");
  const [promoLoading,  setPromoLoading]  = useState(false);

  // العروض النشطة (من /api/offers) — لو فشل التحميل بنكمل بدون عروض والسلة تشتغل زي ما هي
  const [offers, setOffers] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/offers');
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.offers)) setOffers(data.offers);
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
    setAppliedPromo(null);
    localStorage.removeItem('wind_cart');
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

  const updateQty = useCallback((id, selectedSize, delta, selectedColor, bundleGroupId) => {
    setCartItems(prev => prev.map(item => {
      const matchColor = selectedColor !== undefined ? item.selectedColor === selectedColor : true;
      const matchBundle = bundleGroupId !== undefined
        ? (item.bundleGroupId || "") === (bundleGroupId || "")
        : true;
      if (item.id === id && item.selectedSize === selectedSize && matchColor && matchBundle) {
        const newQty = item.qty + delta;
        return { ...item, qty: newQty > 0 ? newQty : 1 };
      }
      return item;
    }));
  }, []);

  const removeFromCart = useCallback((id, selectedSize, selectedColor, bundleGroupId) => {
    setCartItems(prev => {
      const matchColor = selectedColor !== undefined
        ? (item) => item.selectedColor === selectedColor
        : () => true;
      const target = prev.find(item =>
        item.id === id &&
        item.selectedSize === selectedSize &&
        matchColor(item) &&
        (bundleGroupId === undefined || (item.bundleGroupId || "") === (bundleGroupId || ""))
      );

      // إزالة المنتج الأساسي تزيل كل عناصر نفس الباقة حتى لا تبقى باقة يتيمة.
      if (target?.bundleGroupId && target.bundleRole === "parent") {
        return prev.filter(item => item.bundleGroupId !== target.bundleGroupId);
      }

      let next = prev.filter(item =>
        !(item.id === id &&
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
  const { subtotal, discount, shipping, total, discountSource, appliedOffer } = useMemo(
    () => calculateAllTotals(cartItems, appliedPromo, shippingSettings, isFirstOrder, offers),
    [cartItems, appliedPromo, shippingSettings, isFirstOrder, offers]
  );

  // تفاصيل القطع المستفيدة من العرض الفائز، محسوبة بنفس محرك العروض النقي.
  const offerBenefits = useMemo(() => {
    if (discountSource !== 'offer' || !appliedOffer?.id) return null;
    const winningOffer = offers.find((offer) => String(offer.id) === String(appliedOffer.id));
    return winningOffer ? computeOfferBenefits(cartItems, winningOffer) : null;
  }, [cartItems, offers, discountSource, appliedOffer]);

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
        message: `تم تطبيق ${winnerLabel} لأنه يوفّر لك خصماً أكبر — ولن يُحتسب استخدام الكود`,
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
    const saved = localStorage.getItem('wind_cart');
    if (saved) {
      try { setCartItems(JSON.parse(saved)); }
      catch { localStorage.removeItem('wind_cart'); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('wind_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  const contextValue = useMemo(() => ({
    cartItems,
    addToCart, removeFromCart, updateQty, clearCart,
    isCartOpen, toggleCart, openCart, closeCart,
    subtotal, discount, shipping, total,
    discountSource, appliedOffer, offers,
    appliedPromo: appliedPromoView,
    applyPromoCode, removePromoCode,
    discountError, setDiscountError, promoLoading,
    shippingSettings,
    isFirstOrder, setIsFirstOrder,
    setSelectedGovernorate,
  }), [
    cartItems, addToCart, removeFromCart, updateQty, clearCart,
    isCartOpen, toggleCart, openCart, closeCart,
    subtotal, discount, shipping, total,
    discountSource, appliedOffer, offers,
    appliedPromoView, applyPromoCode, removePromoCode,
    discountError, setDiscountError, promoLoading, shippingSettings,
    isFirstOrder, setIsFirstOrder,
    setSelectedGovernorate,
  ]);

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
