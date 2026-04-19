"use client";
import { useCart } from "../../../context/CartContext";
import Link from "next/link";

export default function CartDrawer() {
  const { cartItems, isCartOpen, toggleCart, removeFromCart, updateQty, subtotal } = useCart();

  if (!isCartOpen) return null;

  return (
    <div className="cart-drawer fixed inset-0 z-[1000] overflow-hidden" dir="rtl">

        {/* ── Overlay ── */}
        <div
          className="cart-overlay absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
          onClick={toggleCart}
        />

        {/* ── Panel ── */}
        <div className="absolute inset-y-0 left-0 flex max-w-full">
          <div className="cart-panel w-screen max-w-[400px] bg-[#f5f5f0] flex flex-col shadow-2xl">

            {/* ════════════════════════
                HEADER
            ══════════════════════════ */}
            <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Cart icon with badge */}
                <div className="relative">
                  <div className="w-9 h-9 bg-[#F5C518]/10 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#F5C518]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  {cartItems.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-[#F5C518] text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                      {cartItems.reduce((acc, i) => acc + i.qty, 0)}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="font-black text-gray-900 text-base leading-tight">حقيبة التسوق</h2>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {cartItems.length === 0 ? 'لا توجد منتجات' : `${cartItems.length} ${cartItems.length === 1 ? 'منتج' : 'منتجات'}`}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleCart}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ════════════════════════
                ITEMS LIST
            ════════════════════════════ */}
            <div className="flex-1 overflow-y-auto cart-scroll px-4 py-4 space-y-3">

              {cartItems.length === 0 ? (
                /* ── Empty State ── */
                <div className="flex flex-col items-center justify-center h-full py-24 text-center">
                  <div className="w-20 h-20 bg-white rounded-2xl border border-gray-200 flex items-center justify-center mb-5 shadow-sm">
                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <p className="font-bold text-gray-500 text-sm mb-1">حقيبتك فارغة</p>
                  <p className="text-xs text-gray-400 mb-6">ابدأ بإضافة بعض الأناقة!</p>
                  <button
                    onClick={toggleCart}
                    className="btn btn-primary px-8 py-2.5 rounded-lg font-black text-sm"
                  >
                    تسوق الآن
                  </button>
                </div>

              ) : (
                cartItems.map((item) => (
                  <div
                    key={`${item.id}-${item.selectedSize}-${item.selectedColor || ''}`}
                    className="cart-item bg-white rounded-xl border border-gray-100 p-3 flex gap-3"
                  >
                    {/* Product Image */}
                    <div className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-100">
                      <img
                        src={item.image || item.images?.[0] || `/images/products/${item.folderName}/${item.mainImage}` || 'https://placehold.co/80x96'}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{item.title}</h3>
                          {/* Size + Color badges */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {item.selectedSize && (
                              <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">
                                {item.selectedSize}
                              </span>
                            )}
                            {item.selectedColor && (
                              <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                {/* Color dot */}
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: '8px', height: '8px',
                                    borderRadius: '50%',
                                    background: item.selectedColor,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    flexShrink: 0
                                  }}
                                />
                                {item.selectedColor}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Remove button */}
                        <button
                          onClick={() => removeFromCart(item.id, item.selectedSize, item.selectedColor)}
                          className="remove-btn text-gray-300 shrink-0 mt-0.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Price + Qty */}
                      <div className="flex items-center justify-between mt-2">
                        <p className="font-black text-gray-900 text-sm">
                          {item.price * item.qty}
                          <span className="text-xs font-medium text-gray-400 mr-1">ج.م</span>
                        </p>
                        {/* Qty control */}
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                          <button
                            onClick={() => updateQty(item.id, item.selectedSize, -1, item.selectedColor)}
                            className="qty-btn w-7 h-7 flex items-center justify-center text-gray-500 font-bold text-sm"
                          >
                            −
                          </button>
                          <span className="px-2 text-xs font-black text-gray-800 min-w-[22px] text-center">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => updateQty(item.id, item.selectedSize, 1, item.selectedColor)}
                            className="qty-btn w-7 h-7 flex items-center justify-center text-gray-500 font-bold text-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ════════════════════════
                FOOTER — Subtotal + CTA
            ════════════════════════════ */}
            {cartItems.length > 0 && (
              <div className="bg-white border-t border-gray-100 px-5 pt-4 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">

                {/* Subtotal row */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-500 font-medium">المجموع الفرعي</span>
                  <span className="font-black text-gray-900 text-base">{subtotal} <span className="text-xs font-medium text-gray-400">ج.م</span></span>
                </div>
                <p className="text-[10px] text-gray-400 mb-4">سيتم احتساب مصاريف الشحن عند إتمام الطلب</p>

                {/* Checkout CTA */}
                <Link
                  href="/checkout"
                  onClick={toggleCart}
                  className="btn btn-primary block w-full text-center font-black py-3.5 rounded-xl text-base shadow-sm"
                >
                  إتمام الطلب — {subtotal} ج.م
                </Link>

                <button
                  onClick={toggleCart}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-medium mt-3 transition-colors"
                >
                  متابعة التسوق
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
  );
}
