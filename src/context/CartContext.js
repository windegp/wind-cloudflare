"use client";
// ============================================
// 🛒 CART CONTEXT
// Global cart state management using React Context API
// Single source of truth for cart data
// ============================================
import React from 'react';
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { calculateSubtotal, calculateShipping, calculateAllTotals, validatePromoCode } from '@/lib/cartCalculations';

const CartContext = createContext();

export function CartProvider({ children }) {
  // ============================================
  // STATE
  // ============================================
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Promo code handling
  const [appliedPromo, setAppliedPromo] = useState("");
  const [discountError, setDiscountError] = useState("");

  // ============================================
  // CART OPERATIONS
  // ============================================
  
  const toggleCart = useCallback(() => setIsCartOpen(prev => !prev), []);
  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setAppliedPromo("");
    localStorage.removeItem('wind_cart');
  }, []);

  const addToCart = useCallback((product) => {
    setCartItems((prev) => {
      // المهم: مطابقة المنتجات بناءً على الـ id والمقاس واللون
      const exist = prev.find(
        (item) =>
          item.id === product.id &&
          item.selectedSize === product.selectedSize &&
          item.selectedColor === product.selectedColor
      );

      // تحديد الكمية المراد إضافتها (الكمية الجاية من صفحة المنتج أو 1 كافتراضي)
      const quantityToAdd = product.qty || 1;

      if (exist) {
        // المنتج موجود: هنجمع الكمية القديمة + الكمية الجديدة اللي العميل طلبها
        return prev.map((item) =>
          (item.id === product.id &&
           item.selectedSize === product.selectedSize &&
           item.selectedColor === product.selectedColor)
            ? { ...item, qty: item.qty + quantityToAdd }
            : item
        );
      }
      
      // منتج جديد: هنضيفه للسلة بالكمية اللي العميل اختارها
      return [...prev, { ...product, qty: quantityToAdd }];
    });
    openCart();
  }, [openCart]);

  const updateQty = useCallback((id, selectedSize, delta, selectedColor) => {
    setCartItems((prev) =>
      prev.map((item) => {
        // Important: Color must also match for quantity updates
        const matchColor = selectedColor !== undefined
          ? item.selectedColor === selectedColor
          : true; // Backward compatible: works without color param
        if (item.id === id && item.selectedSize === selectedSize && matchColor) {
          const newQty = item.qty + delta;
          return { ...item, qty: newQty > 0 ? newQty : 1 };
        }
        return item;
      })
    );
  }, []);

  const removeFromCart = useCallback((id, selectedSize, selectedColor) => {
    setCartItems((prev) =>
      prev.filter((item) => {
        // Important: Color must also match for removal
        const matchColor = selectedColor !== undefined
          ? item.selectedColor === selectedColor
          : true;
        return !(item.id === id && item.selectedSize === selectedSize && matchColor);
      })
    );
  }, []);

  // ============================================
  // CALCULATIONS
  // Uses utility functions from cartCalculations.js
  // Ensures consistency across cart and API routes
  // ============================================
  const { subtotal, shipping, total } = calculateAllTotals(cartItems, appliedPromo);

  // ============================================
  // PROMO CODE HANDLING
  // ============================================
  const applyPromoCode = useCallback((code) => {
    const result = validatePromoCode(code);
    if (result.isValid) {
      setAppliedPromo(result.code);
      setDiscountError("");
      return { success: true, message: result.message };
    } else {
      setAppliedPromo("");
      setDiscountError(result.message);
      return { success: false, message: result.message };
    }
  }, []);

  // ============================================
  // PERSISTENCE
  // LocalStorage is used only for persistence
  // CartContext is the single source of truth
  // ============================================
  
  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('wind_cart');
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (e) { 
        console.error("Error loading cart from localStorage"); 
      }
    }
  }, []);

  // Sync cart to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem('wind_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    cartItems,
    addToCart,
    removeFromCart,
    updateQty,
    clearCart,
    isCartOpen,
    toggleCart,
    openCart,
    closeCart,
    subtotal,
    shipping,
    total,
    appliedPromo,
    applyPromoCode,
    discountError
  }), [cartItems, addToCart, removeFromCart, updateQty, clearCart, isCartOpen, toggleCart, openCart, closeCart, subtotal, shipping, total, appliedPromo, applyPromoCode, discountError]);

  return React.createElement(
    CartContext.Provider,
    { value: contextValue },
    children
  );
}

export const useCart = () => useContext(CartContext);