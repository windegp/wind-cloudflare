"use client";
// ============================================
// 🛒 CART CONTEXT
// ============================================
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { calculateSubtotal, calculateShipping, calculateDiscount, calculateTotal, calculateAllTotals } from '@/lib/cartCalculations';
import { useSettings } from '@/context/SettingsContext';

const CartContext = createContext();

export function CartProvider({ children }) {
  const { settings } = useSettings();

  // إعدادات الشحن — تييجي من SettingsContext أو مباشرة من Firestore لو promotions مش موجودة
  const [promoSettings, setPromoSettings] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__WIND_DIAG__) {
      window.__WIND_DIAG__.mark('CartProvider effect start');
    }
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
    shippingCost:          promoSettings?.shippingCost          ?? settings?.promotions?.shippingCost          ?? 70,
    freeShippingThreshold: promoSettings?.freeShippingThreshold ?? settings?.promotions?.freeShippingThreshold ?? 0,
    firstOrderEnabled:     promoSettings?.firstOrderEnabled     ?? settings?.promotions?.firstOrderEnabled     ?? false,
    firstOrderDiscount:    promoSettings?.firstOrderDiscount    ?? settings?.promotions?.firstOrderDiscount    ?? 0,
  }), [promoSettings, settings]);

  // هل العميل الحالي مؤهل لخصم الطلب الأول؟
  const [isFirstOrder, setIsFirstOrder] = useState(false);

  // ── State ──────────────────────────────────────────────────────
  const [cartItems,     setCartItems]     = useState([]);
  const [isCartOpen,    setIsCartOpen]    = useState(false);
  const [appliedPromo,  setAppliedPromo]  = useState(null);   // { code, type, freeShipping, discountAmount, message, ... }
  const [discountError, setDiscountError] = useState("");
  const [promoLoading,  setPromoLoading]  = useState(false);

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
        item.selectedColor === product.selectedColor
      );
      const qty = product.qty || 1;
      if (exist) {
        return prev.map(item =>
          (item.id === product.id &&
           item.selectedSize  === product.selectedSize &&
           item.selectedColor === product.selectedColor)
            ? { ...item, qty: item.qty + qty }
            : item
        );
      }
      return [...prev, { ...product, qty }];
    });
    openCart();
  }, [openCart]);

  const updateQty = useCallback((id, selectedSize, delta, selectedColor) => {
    setCartItems(prev => prev.map(item => {
      const matchColor = selectedColor !== undefined ? item.selectedColor === selectedColor : true;
      if (item.id === id && item.selectedSize === selectedSize && matchColor) {
        const newQty = item.qty + delta;
        return { ...item, qty: newQty > 0 ? newQty : 1 };
      }
      return item;
    }));
  }, []);

  const removeFromCart = useCallback((id, selectedSize, selectedColor) => {
    setCartItems(prev => prev.filter(item => {
      const matchColor = selectedColor !== undefined ? item.selectedColor === selectedColor : true;
      return !(item.id === id && item.selectedSize === selectedSize && matchColor);
    }));
  }, []);

  // ── Calculations ───────────────────────────────────────────────
  const { subtotal, discount, shipping, total } = useMemo(
    () => calculateAllTotals(cartItems, appliedPromo, shippingSettings, isFirstOrder),
    [cartItems, appliedPromo, shippingSettings, isFirstOrder]
  );

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
    if (typeof window !== 'undefined' && window.__WIND_DIAG__) {
      window.__WIND_DIAG__.mark('CartProvider localStorage read start');
    }
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
    appliedPromo,
    applyPromoCode, removePromoCode,
    discountError, setDiscountError, promoLoading,
    shippingSettings,
    isFirstOrder, setIsFirstOrder,
  }), [
    cartItems, addToCart, removeFromCart, updateQty, clearCart,
    isCartOpen, toggleCart, openCart, closeCart,
    subtotal, discount, shipping, total,
    appliedPromo, applyPromoCode, removePromoCode,
    discountError, setDiscountError, promoLoading, shippingSettings,
    isFirstOrder, setIsFirstOrder,
  ]);

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
