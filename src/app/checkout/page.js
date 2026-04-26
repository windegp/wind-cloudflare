"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useCart } from "../../context/CartContext";
import { usePathname } from 'next/navigation';
import { usePageReady, useGlobalLoader } from "../../context/GlobalLoaderContext";
import { useRouter } from 'next/navigation';
import Link from "next/link";
// 🔥 استدعاء الفايربيس
import { getDb } from "@/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc, updateDoc, increment } from "firebase/firestore/lite";
import { ChevronDown, Info, CheckCircle2, Phone, ShoppingBag, Shield, Tag, ChevronLeft, Truck, CreditCard, Banknote, Smartphone, X, Lock } from '@/components/icons-extra';

// Helper function to handle Firebase errors
function handleFirebaseError(error, operation) {
  console.error(`Firebase ${operation} error:`, error);
  
  if (error.code === 'permission-denied') {
    return 'Error: Permission denied. Please check your access rights.';
  } else if (error.code === 'unavailable') {
    return 'Error: Service temporarily unavailable. Please try again.';
  } else if (error.code === 'deadline-exceeded') {
    return 'Error: Request timeout. Please check your connection and try again.';
  }
  
  return `Error: ${error.message || 'Unknown error occurred'}`;
}

const governorates = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "القليوبية", "الشرقية", "المنوفية", "الغربية", "البحيرة", "دمياط", "بورسعيد", "السويس", "الإسماعيلية", "كفر الشيخ", "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد", "مطروح", "شمال سيناء", "جنوب سيناء"
];

const InputField = ({ label, error, children }) => (
  <div className="relative">
    {children}
    {error && (
      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
        <span>⚠</span> هذا الحقل مطلوب
      </p>
    )}
  </div>
);

// ============================================================
// مكوّن الـ iFrame Modal — يظهر فوق الصفحة عند الدفع بالكارت
// ============================================================
function KashierIframeModal({ iframeData, onClose }) {
  const iframeRef = useRef(null);

  // ── بناء رابط كاشير iFrame ──
  const kashierUrl =
    `https://checkout.kashier.io?` +
    `merchantId=${iframeData.merchantId}` +
    `&orderId=${iframeData.orderId}` +
    `&amount=${iframeData.amount}` +
    `&currency=${iframeData.currency}` +
    `&hash=${iframeData.hash}` +
    `&merchantRedirect=${encodeURIComponent(iframeData.merchantRedirect)}` +
    `&failureRedirect=${encodeURIComponent(iframeData.failureRedirect)}` +
    `&allowedMethods=${iframeData.allowedMethods}` +
    `&redirectMethod=get` +
    `&display=${iframeData.display}` +
    `&brandColor=${encodeURIComponent(iframeData.brandColor)}` +
    `&mode=${iframeData.mode}` +
    `&metaData=embedded`;  // ← يخبر كاشير إنه شغال داخل iFrame

  // ── إغلاق بـ Escape ──
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden'; // منع scroll الصفحة
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    // ── Overlay ──
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Modal Container ── */}
      <div className="relative w-full max-w-[480px] bg-white rounded-2xl overflow-hidden shadow-2xl"
           style={{ maxHeight: '90vh' }}>

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#F5C518]/10 rounded-full flex items-center justify-center">
              <Lock size={14} className="text-[#F5C518]" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">بوابة الدفع الآمنة</p>
              <p className="text-[10px] text-gray-400">مشفّر بـ SSL — كاشير</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        {/* ── iFrame ── */}
        <iframe
          ref={iframeRef}
          src={kashierUrl}
          title="Kashier Payment"
          width="100%"
          style={{ height: '520px', border: 'none', display: 'block' }}
          allow="payment"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation"
        />
      </div>
    </div>
  );
}

// ============================================================
// الصفحة الرئيسية — CheckoutPage
// ============================================================
export default function CheckoutPage() {
  const pathname = usePathname();
  const { 
    cartItems, 
    clearCart, 
    subtotal, 
    shipping, 
    total, 
    applyPromoCode, 
    discountError, 
    appliedPromo 
  } = useCart();
  
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();

  const SHIPPING_COST = shipping;
  const finalTotal = total;

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [showAllIcons, setShowAllIcons] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);

  // ── state جديد للـ iFrame ──
  const [iframeData, setIframeData] = useState(null); // بيانات الـ iFrame من السيرفر

  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    address: '',
    landmark: '',
    city: '',
    governorate: 'القاهرة',
    postalCode: '',
    phone: '',
    altPhone: ''
  });

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  // Signal readiness for GlobalLoader
  useEffect(() => {
    signalPageReady();
  }, [pathname, signalPageReady]);

  // 🔥 توحيد رقم الطلب من البداية (استراتيجية المستند الواحد)
  const activeOrderIdRef = useRef(null);
  if (!activeOrderIdRef.current && typeof window !== 'undefined') {
    // ننشئ رقم الطلب فور فتح الصفحة، وهيفضل ثابت مع العميل طول ما هو في الصفحة
    activeOrderIdRef.current = `WIND-${Date.now().toString().slice(-5)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
  }
  const activeOrderId = activeOrderIdRef.current;
  
  // 🔥 متغير لإيقاف رادار السلة المتروكة بمجرد ضغط زر الدفع
  const isOrderSubmittedRef = useRef(false);

 // ============================================================
  // 🚀 رادار السلة المتروكة المطور (استراتيجية المستند الواحد)
  // ============================================================
  const lastSavedDraftRef = useRef(""); 

  useEffect(() => {
    const isValidEmail = formData.email && formData.email.includes('@') && formData.email.includes('.');
    const isValidPhone = formData.phone && formData.phone.length >= 11;
    const hasContactInfo = isValidEmail || isValidPhone;

    if (hasContactInfo && cartItems.length > 0) {
      const timeoutId = setTimeout(async () => {
        
        if (isOrderSubmittedRef.current) return;

        const currentSnapshot = JSON.stringify({ 
           email: formData.email, 
           phone: formData.phone, 
           items: cartItems.length, 
           total: finalTotal 
        });

        if (lastSavedDraftRef.current === currentSnapshot) return; 

        try {
          // 1. تحديث الأوردر (نفس المستند الثابت)
          const orderRef = doc(getDb(), "Orders", activeOrderId);
          
          const draftData = {
            Name: activeOrderId,
            "Billing Name": `${formData.firstName} ${formData.lastName}`.trim() || 'عميل محتمل',
            Email: formData.email ? formData.email.toLowerCase().trim() : '',
            Phone: formData.phone,
            "Shipping Address1": `${formData.address} ${formData.landmark ? '- ' + formData.landmark : ''}`,
            "Shipping City": formData.city || "",
            "Shipping Province": formData.governorate || "",
            Subtotal: subtotal,
            Shipping: shipping,
            Total: finalTotal,
            Currency: "EGP",
            "Financial Status": "abandoned",
            "Created at": new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
            data_source: "WIND_Web",
            lineItems: cartItems.map(item => ({
              name: `${item.title} ${item.selectedSize ? '- ' + item.selectedSize : ''}`,
              price: item.price,
              quantity: item.qty,
              image: item.image || item.images?.[0] || ''
            }))
          };

          if (appliedPromo) draftData['Discount Code'] = appliedPromo;

          await setDoc(orderRef, draftData, { merge: true });

          // 2. تحديث العميل (الجزء اللي كان ساقط مننا وبسببه العميل مكنش بيظهر في الداشبورد) 🔥
          const cleanPhone = formData.phone.replace(/[^0-9]/g, '');
          const uniqueId = isValidEmail ? formData.email.toLowerCase().trim() : cleanPhone;
          
          if (uniqueId) {
            const customerRef = doc(getDb(), "Customers", uniqueId);
            await setDoc(customerRef, {
              "First Name": formData.firstName || "",
              "Last Name": formData.lastName || "",
              Email: formData.email ? formData.email.toLowerCase().trim() : "",
              Phone: formData.phone || "",
              "Default Address Address1": formData.address || "",
              "Default Address City": formData.city || "",
              "Default Address Province": formData.governorate || "",
              data_source: "WIND_Web",
              segments: ["Abandoned_Checkout"],
              hasAbandoned: true, 
              last_active: new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
            }, { merge: true });
          }

          lastSavedDraftRef.current = currentSnapshot;

        } catch (error) {
          console.error("Error saving abandoned cart:", error);
        }
      }, 5000); 

      return () => clearTimeout(timeoutId); 
    }
  }, [formData.email, formData.phone, cartItems, finalTotal, subtotal, shipping, appliedPromo, activeOrderId]);

  const validate = () => {
    let tempErrors = {};
    if (!formData.email) tempErrors.email = true;
    if (!formData.firstName) tempErrors.firstName = true;
    if (!formData.address) tempErrors.address = true;
    if (!formData.city) tempErrors.city = true;
    if (!formData.phone || formData.phone.length < 11) tempErrors.phone = true;
    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (errors[name]) setErrors({ ...errors, [name]: false });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return window.scrollTo(0, 0);
    setLoading(true);
    
    // 🔥 إيقاف رادار السلة المتروكة فوراً عشان ميسجلش الداتا تاني بعد ما نعمل الأوردر
    isOrderSubmittedRef.current = true;

    // 1. استخدام نفس رقم الطلب اللي بدأنا بيه الصفحة
    const orderId = activeOrderId;

    // 2. تجهيز البيانات للتخزين المؤقت
    const pendingOrder = {
      orderId,
      formData,
      cartItems,
      total: finalTotal,
      amount: finalTotal,
      appliedPromo,
      customerEmail: formData.email,
    };

    try {
      // ============================================================
      // 🚀 رفع الداتا للفايربيس (Orders & Customers)
      // ============================================================
      const orderData = {
        Name: orderId,
        Email: formData.email ? formData.email.toLowerCase() : '',
        Phone: formData.phone,
        "Billing Name": `${formData.firstName} ${formData.lastName}`,
        "Shipping Address1": `${formData.address} ${formData.landmark ? '- ' + formData.landmark : ''}`,
        "Shipping City": formData.city,
        "Shipping Province": formData.governorate,
        "Shipping Phone": formData.phone,
        "Shipping Zip": formData.postalCode || '',
        Subtotal: subtotal,
        Shipping: shipping,
        Total: finalTotal,
        Currency: "EGP",
        "Financial Status": paymentMethod === 'card' ? "pending_payment" : "pending",
        "Payment Method": paymentMethod,
        "Created at": new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
        data_source: "WIND_Web", // عشان الأدمن يفصلهم عن شوبيفاي
        
        // جلب الصور الدقيقة من سلة المشتريات
        lineItems: cartItems.map(item => ({
          name: `${item.title} ${item.selectedSize ? '- ' + item.selectedSize : ''}`,
          price: item.price,
          quantity: item.qty,
          image: item.image || item.images?.[0] || ''
        }))
      };

      if (appliedPromo) orderData['Discount Code'] = appliedPromo;

     // 1. إنشاء الأوردر أو تحديثه
      try {
        await setDoc(doc(getDb(), "Orders", orderId), orderData, { merge: true });

        // 🔥 بوابة الأمان المنيعة: نمنع زيادة العداد لو الدفع "فيزا" عشان لو هرب من الصفحة!
        // العداد هيزيد فقط في الدفع عند الاستلام وإنستا باي
        if (paymentMethod !== 'card') {
          const orderCountKey = `counted_${orderId}`;
          const isAlreadyCounted = sessionStorage.getItem(orderCountKey);

          if (!isAlreadyCounted) {
            const sRef = doc(getDb(), "settings", "siteSettings");
            await updateDoc(sRef, {
              "counters.orders": increment(1),
              "counters.sales": increment(Number(finalTotal))
            });
            sessionStorage.setItem(orderCountKey, "true");
          }
        }

      } catch (error) {
        const errorMessage = handleFirebaseError(error, 'creating order');
        setSubmitError(errorMessage);
        setLoading(false);
        return;
      }

      // 2. تحديث ملف العميل (للدفع عند الاستلام وإنستا باي فقط)
      if (paymentMethod !== 'card') {
        const cleanPhone = formData.phone.replace(/[^0-9]/g, '');
        const customerId = formData.email ? formData.email.toLowerCase().trim() : cleanPhone;
        
        if (customerId) {
          const customerRef = doc(getDb(), "Customers", customerId);
          const customerSnap = await getDoc(customerRef);

          if (customerSnap.exists()) {
            const existingData = customerSnap.data();
            const currentOrders = Number(existingData['Total Orders'] || 0);
            const currentSpent = Number(existingData['Total Spent'] || 0);
            const newSegment = currentOrders >= 1 ? "VIP_Customer" : "Purchased_Once";

            try {
              await setDoc(customerRef, {
                "Total Orders": currentOrders + 1,
                "Total Spent": currentSpent + Number(finalTotal),
                Last_Order_Status: "New",
                data_source: "WIND_Web",
                Phone: formData.phone,
                "Default Address City": formData.city || "",
                "Default Address Province": formData.governorate || "",
                // 🔥 تحديث الشريحة وتمسح السلة المتروكة
                segments: [newSegment],
                last_active: new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
              }, { merge: true });
            } catch (error) {
              console.error('Error updating customer:', error);
            }
          } else {
            // عميل جديد تماماً
            try {
              // 🔥 بوابة الأمان: منع تكرار حساب العميل الجديد
              const customerCountKey = `cust_counted_${customerId}`;
              const isCustCounted = sessionStorage.getItem(customerCountKey);

              if (!isCustCounted) {
                const sRefCust = doc(getDb(), "settings", "siteSettings");
                await updateDoc(sRefCust, {
                  "counters.customers": increment(1)
                });
                sessionStorage.setItem(customerCountKey, "true");
              }

              await setDoc(customerRef, {
                "First Name": formData.firstName || "",
                "Last Name": formData.lastName || "",
                Email: formData.email ? formData.email.toLowerCase().trim() : "",
                Phone: formData.phone || "",
                "Default Address City": formData.city || "",
                "Default Address Province": formData.governorate || "",
                "Default Address Address1": formData.address || "",
                "Total Orders": 1,
                "Total Spent": Number(finalTotal),
                Last_Order_Status: "New",
                data_source: "WIND_Web",
                segments: ["Purchased_Once"],
                last_active: new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
              });
            } catch (error) {
              console.error('Error creating customer:', error);
            }
          }
        }
      }

      // ============================================================
      // 🔥 تم إلغاء كود حذف المسودات نهائياً!
      // لأننا بنستخدم (مستند واحد) من البداية، بمجرد الدفع المستند بيتحول من abandoned لـ pending فوراً
      // ============================================================

      if (paymentMethod === 'card') {
        localStorage.setItem('pendingOrder', JSON.stringify(pendingOrder));

        const res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: 'card',
            orderId,
            amount: finalTotal.toFixed(2),
            customerName: `${formData.firstName} ${formData.lastName}`,
            customerEmail: formData.email,
            phone: formData.phone,
            appliedPromo,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.iframeData) throw new Error(data.error || 'حدث خطأ');

        localStorage.setItem('pendingOrder', JSON.stringify({
          orderId,
          amount: finalTotal.toFixed(2),
          customerName: `${formData.firstName} ${formData.lastName}`,
          customerEmail: formData.email,
          phone: formData.phone,
          formData,
          cartItems,
          total: finalTotal,
          appliedPromo,
        }));

        setIframeData(data.iframeData);
        setLoading(false);

      } else {
        // للدفع عند الاستلام وإنستا باي
        const res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod,
            orderId,
            formData,
            cartItems,
            total: finalTotal,
            appliedPromo,
          }),
        });

        if (!res.ok) throw new Error('حدث خطأ في إنشاء الطلب');

        localStorage.removeItem('pendingOrder');
        clearCart();
        setLoading(false);
        router.push(`/thank-you?orderId=${orderId}`);
      }

    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };


  const inputClass = (field) =>
    `w-full px-4 py-3 border rounded-lg outline-none transition-all text-sm bg-white placeholder-gray-400 text-gray-800
     focus:ring-2 focus:ring-[#F5C518]/40 focus:border-[#F5C518]
     ${errors[field] ? 'border-red-400 bg-red-50/40' : 'border-gray-300 hover:border-gray-400'}`;

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-gray-800" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif; }

        .section-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 14px;
        }

        .pay-opt { transition: border-color 0.18s, background 0.18s; }
        .pay-opt:hover { border-color: #d1d5db; }
        .pay-opt.active { border-color: #F5C518 !important; background: #fffef5; }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .slide-down { animation: slideDown 0.22s ease forwards; }

        .promo-success { color: #059669; font-size: 11px; margin-top: 5px; font-weight: 600; }

        @keyframes shine {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .pay-btn {
          background: #F5C518;
          color: #1a1a1a;
          position: relative;
          overflow: hidden;
        }
        .pay-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%);
          background-size: 200% auto;
        }
        .pay-btn:hover::after { animation: shine 0.7s linear; }
        .pay-btn:hover { background: #e6b800; }
        .pay-btn:active { transform: scale(0.995); }

        select { appearance: none; }
        select option { background: white; }
      `}</style>

      {iframeData && (
        <KashierIframeModal
          iframeData={iframeData}
          onClose={() => setIframeData(null)}
        />
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-[1080px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-black text-gray-900 tracking-tight">
            WIND <span className="font-light text-gray-400">Shopping</span>
          </Link>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 font-medium select-none">
            <span className="text-gray-900 font-semibold">السلة</span>
            <span className="mx-1 opacity-40">›</span>
            <span className="text-[#F5C518] font-semibold">معلومات</span>
            <span className="mx-1 opacity-40">›</span>
            <span>الشحن</span>
            <span className="mx-1 opacity-40">›</span>
            <span>الدفع</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium">
            <ShoppingBag size={15} className="text-[#F5C518]" />
            <span>دفع آمن</span>
          </div>
        </div>
      </header>

      {/* MOBILE: Order Summary Toggle */}
      <div
        className="lg:hidden bg-white border-b border-gray-200 px-5 py-3.5 cursor-pointer"
        onClick={() => setSummaryOpen(!summaryOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#F5C518] font-semibold">
            <ShoppingBag size={15} />
            <span>{summaryOpen ? 'إخفاء تفاصيل الطلب' : 'عرض تفاصيل الطلب'}</span>
            <ChevronDown size={14} className={`transition-transform ${summaryOpen ? 'rotate-180' : ''} text-gray-500`} />
          </div>
          <span className="font-black text-base text-gray-900">ج.م {subtotal}.00</span>
        </div>

        {summaryOpen && (
          <div className="mt-4 pb-2 slide-down space-y-3" onClick={e => e.stopPropagation()}>
            {cartItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                  <img src={item.image || item.images?.[0] || 'https://placehold.co/100'} alt={item.title} className="w-full h-full object-cover" />
                  <span className="absolute -top-1.5 -right-1.5 bg-[#F5C518] text-black text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{item.qty}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{item.title}</p>
                  <p className="text-xs text-gray-400">{item.selectedSize}</p>
                </div>
                <span className="text-sm font-bold text-gray-800">ج.م {item.price * item.qty}.00</span>
              </div>
            ))}

            <div className="pt-2 pb-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" placeholder="كود الخصم"
                    value={discountCode} onChange={e => setDiscountCode(e.target.value)}
                    className="w-full pr-8 pl-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518] placeholder-gray-400 bg-gray-50 uppercase transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => applyPromoCode(discountCode)}
                  className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-black transition-colors"
                >
                  تطبيق
                </button>
              </div>
              {discountError && <p className="text-red-500 text-[10px] mt-1.5 pr-1">{discountError}</p>}
              {appliedPromo && <p className="promo-success pr-1">✓ تم تطبيق كود: {appliedPromo}</p>}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500"><span>سعر المنتج</span><span className="text-gray-800 font-medium">ج.م {subtotal}.00</span></div>
              <div className="flex justify-between text-gray-500"><span>سعر الشحن</span><span className={`font-medium ${SHIPPING_COST === 0 ? 'text-green-600' : 'text-gray-800'}`}>{SHIPPING_COST === 0 ? 'مجاناً' : `ج.م ${SHIPPING_COST}.00`}</span></div>
              <div className="flex justify-between font-black text-base pt-2 border-t border-gray-100">
                <span>الإجمالي</span>
                <span>ج.م {finalTotal}.00</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-[1080px] mx-auto flex flex-col lg:flex-row lg:gap-0">

        {/* LEFT COLUMN — Form */}
        <div className="w-full lg:w-[58%] px-5 py-8 lg:px-10 lg:py-10 order-2 lg:order-1">
          <form onSubmit={handleSubmit}>

            {/* SECTION: Contact */}
            <div className="mb-8">
              <p className="section-label">التواصل</p>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-gray-100">
                  <span className="text-sm text-gray-500">البريد الإلكتروني</span>
                </div>
                <div className="px-4 py-1">
                  <InputField error={errors.email}>
                    <input
                      type="email" name="email"
                      placeholder="example@email.com"
                      value={formData.email} onChange={handleInputChange}
                      className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                      style={{ border: 'none', boxShadow: 'none' }}
                    />
                  </InputField>
                </div>
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1 pr-1"><span>⚠</span> هذا الحقل مطلوب</p>}
              <label className="flex items-center gap-2 cursor-pointer mt-3 pr-1">
                <input type="checkbox" className="w-4 h-4 accent-[#F5C518] rounded" />
                <span className="text-xs text-gray-500">أرسل لي أحدث العروض والمنتجات الجديدة</span>
              </label>
            </div>

            {/* SECTION: Delivery */}
            <div className="mb-8">
              <p className="section-label">عنوان التوصيل</p>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">

                <div className="px-4 py-1 relative">
                  <select
                    className="w-full py-3 text-sm bg-transparent outline-none text-gray-800 border-0 appearance-none"
                    style={{ border:'none', boxShadow:'none' }}
                    defaultValue="EG"
                  >
                    <option value="EG">🇪🇬 مصر</option>
                    <option value="SA">🇸🇦 المملكة العربية السعودية</option>
                    <option value="AE">🇦🇪 الإمارات العربية المتحدة</option>
                    <option value="KW">🇰🇼 الكويت</option>
                    <option value="QA">🇶🇦 قطر</option>
                    <option value="BH">🇧🇭 البحرين</option>
                    <option value="OM">🇴🇲 عُمان</option>
                    <option value="JO">🇯🇴 الأردن</option>
                    <option value="LB">🇱🇧 لبنان</option>
                    <option value="IQ">🇮🇶 العراق</option>
                    <option value="LY">🇱🇾 ليبيا</option>
                    <option value="TN">🇹🇳 تونس</option>
                    <option value="MA">🇲🇦 المغرب</option>
                    <option value="DZ">🇩🇿 الجزائر</option>
                    <option value="SD">🇸🇩 السودان</option>
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="text" name="firstName"
                    placeholder="الاسم الأول"
                    value={formData.firstName} onChange={handleInputChange}
                    className={`w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0 ${errors.firstName ? 'placeholder-red-300' : ''}`}
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="text" name="lastName"
                    placeholder="اسم العائلة (اختياري)"
                    value={formData.lastName} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="text" name="address"
                    placeholder="العنوان بالتفصيل (الشارع، رقم المبنى)"
                    value={formData.address} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="text" name="landmark"
                    placeholder="علامة مميزة للموقع (اختياري)"
                    value={formData.landmark} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="text" name="city"
                    placeholder="المدينة"
                    value={formData.city} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="px-4 py-1 relative">
                  <select
                    name="governorate" value={formData.governorate} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none text-gray-800 border-0 appearance-none"
                    style={{ border:'none', boxShadow:'none' }}
                  >
                    {governorates.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="text" name="postalCode"
                    placeholder="الرمز البريدي (اختياري)"
                    value={formData.postalCode} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="px-4 py-1 relative">
                  <input
                    type="tel" name="phone"
                    placeholder="رقم الهاتف"
                    value={formData.phone} onChange={handleInputChange}
                    className="w-full py-3 pl-8 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                  <Info size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>

                <div className="px-4 py-1">
                  <input
                    type="tel" name="altPhone"
                    placeholder="رقم هاتف بديل (اختياري)"
                    value={formData.altPhone} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>
              </div>

              {(errors.firstName || errors.address || errors.city || errors.phone) && (
                <p className="text-red-500 text-xs mt-2 pr-1 flex items-center gap-1"><span>⚠</span> يرجى تعبئة جميع الحقول المطلوبة</p>
              )}
              {submitError && (
                <p className="text-red-500 text-xs mt-2 pr-1 flex items-center gap-1"><span>⚠</span> {submitError}</p>
              )}
            </div>

            {/* SECTION: Shipping Method */}
            <div className="mb-8">
              <p className="section-label">طريقة الشحن</p>
              <div className="bg-white border border-[#F5C518] rounded-xl px-4 py-3.5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-[#F5C518] flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-[#F5C518]"></div>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">شحن قياسي</p>
                    <p className="text-xs text-gray-400">٣ - ٥ أيام عمل</p>
                  </div>
                </div>
                {SHIPPING_COST === 0 ? (
                  <span className="font-bold text-green-600 text-sm">مجاناً</span>
                ) : (
                  <span className="font-bold text-gray-800 text-sm">ج.م {SHIPPING_COST}.00</span>
                )}
              </div>
            </div>

            {/* SECTION: Payment */}
            <div className="mb-8">
              <p className="section-label">طريقة الدفع</p>
              <p className="text-xs text-gray-400 mb-3">جميع المعاملات مشفرة وآمنة</p>

              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">

                <label className={`pay-opt flex flex-col px-4 py-4 cursor-pointer relative !overflow-visible ${paymentMethod === 'card' ? 'active' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === 'card' ? 'border-[#F5C518]' : 'border-gray-300'}`}>
                        {paymentMethod === 'card' && <div className="w-2 h-2 rounded-full bg-[#F5C518]"></div>}
                      </div>
                      <input type="radio" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} className="sr-only" />
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-gray-600" />
                        <span className="font-semibold text-sm text-gray-800">كارت / محفظة إلكترونية</span>
                      </div>
                    </div>
{(() => {
  const paymentIcons = [
    { name: "Apple Pay", url: "https://ik.imagekit.io/windeg/WIND_Shopping/icons8-apple-pay.svg" },
    { name: "Mastercard", url: "https://ik.imagekit.io/windeg/WIND_Shopping/mastercard.svg" },
    { name: "Visa", url: "https://ik.imagekit.io/windeg/WIND_Shopping/visa.svg" },
    { name: "Meeza", url: "https://ik.imagekit.io/windeg/WIND_Shopping/Meeza.svg" },
    { name: "American Express", url: "https://ik.imagekit.io/windeg/WIND_Shopping/amex-svgrepo-com.svg" },
  ];

  const maxVisible = 3;
  const visibleIcons = paymentIcons.slice(0, maxVisible);
  const hiddenIcons = paymentIcons.slice(maxVisible);

  return (
    <div className="flex items-center gap-2.5 mr-auto relative !overflow-visible" dir="ltr">
      
      {hiddenIcons.length > 0 && (
        <div className="relative !overflow-visible flex items-center justify-center w-8 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowAllIcons(!showAllIcons);
            }}
            className="w-8 h-4 bg-gray-50 border border-gray-300 rounded-sm flex items-center justify-center shadow-sm hover:bg-gray-100 cursor-pointer transition-all"
          >
            <span className="text-[11px] font-black text-gray-600">+{hiddenIcons.length}</span>
          </button>

          {showAllIcons && (
            <>
              <div
                className="absolute z-[9999] slide-down bg-black/95 backdrop-blur-md rounded-lg p-2.5 shadow-2xl flex gap-2.5 border border-white/20"
                style={{ bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: 'max-content' }}
              >
                {hiddenIcons.map((icon, idx) => (
                  <div key={idx} className="w-11 h-7 bg-white rounded-sm flex items-center justify-center p-1 shadow-sm">
                    <img src={icon.url} alt={icon.name} className="w-full h-full object-contain scale-110" />
                  </div>
                ))}
              </div>
              <div
                className="absolute z-[9999] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black/95"
                style={{ bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)' }}
              />
            </>
          )}
        </div>
      )}

      {visibleIcons.map((icon, idx) => (
        <div 
          key={idx} 
          className="w-12 h-8 bg-white border border-gray-200 rounded-sm flex items-center justify-center shadow-sm"
        >
          <img 
            src={icon.url} 
            alt={icon.name} 
            className="w-[85%] h-[85%] object-contain scale-[1.18] transition-transform" 
          />
        </div>
      ))}

    </div>
  );
})()}
                  </div>
                  {paymentMethod === 'card' && (
                    <div className="mt-3 slide-down px-3 py-3 bg-gray-50 rounded-lg text-center text-xs text-gray-600 font-medium border border-gray-100 flex items-center justify-center gap-1.5">
                      <Lock size={11} className="text-[#F5C518]" />
                      ستظهر بوابة الدفع الآمنة مباشرةً في نفس الصفحة
                    </div>
                  )}
                </label>

                <label className={`pay-opt flex items-center gap-3 px-4 py-4 cursor-pointer ${paymentMethod === 'cod' ? 'active' : ''}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === 'cod' ? 'border-[#F5C518]' : 'border-gray-300'}`}>
                    {paymentMethod === 'cod' && <div className="w-2 h-2 rounded-full bg-[#F5C518]"></div>}
                  </div>
                  <input type="radio" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="sr-only" />
                  <Banknote size={16} className="text-gray-600" />
                  <div>
                    <p className="font-semibold text-sm text-gray-800">الدفع عند الاستلام</p>
                    <p className="text-xs text-gray-400">ادفع كاش لدى استلام طلبك</p>
                  </div>
                </label>

                <label className={`pay-opt flex flex-col px-4 py-4 cursor-pointer ${paymentMethod === 'instapay' ? 'active' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === 'instapay' ? 'border-[#F5C518]' : 'border-gray-300'}`}>
                      {paymentMethod === 'instapay' && <div className="w-2 h-2 rounded-full bg-[#F5C518]"></div>}
                    </div>
                    <input type="radio" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} className="sr-only" />
                    <Smartphone size={16} className="text-gray-600" />
                    <div>
                      <p className="font-semibold text-sm text-gray-800">إنستا باي</p>
                      <p className="text-xs text-gray-400">تحويل فوري وآمن</p>
                    </div>
                  </div>
                  {paymentMethod === 'instapay' && (
                    <div className="mt-3 slide-down p-4 bg-gray-50 border border-gray-100 rounded-lg text-right">
                      <p className="font-bold text-gray-900 mb-3 text-sm">خطوات الدفع عبر إنستا باي</p>
                      <ol className="text-xs text-gray-600 space-y-1.5 leading-relaxed list-decimal list-inside">
                        <li>افتح تطبيق إنستا باي</li>
                        <li>
                          حوّل المبلغ <strong>ج.م {finalTotal}.00</strong> للرقم:{' '}
                          <span className="font-mono font-black text-black bg-[#F5C518] px-2 py-0.5 rounded select-all">01026628476</span>
                        </li>
                        <li>أرسل صورة الإيصال على واتساب للتأكيد</li>
                      </ol>
                      <a href="https://wa.me/201026628476" target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-600 text-white font-bold text-xs px-4 py-2 rounded-lg transition">
                        <Phone size={13} />
                        إرسال الإيصال عبر واتساب
                      </a>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="pay-btn w-full font-black py-4 rounded-xl text-base transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mb-6"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                  {paymentMethod === 'card' ? 'جارٍ تحضير بوابة الدفع...' : 'جارٍ المعالجة...'}
                </>
              ) : paymentMethod === 'card' ? (
                <>ادفع الآن — ج.م {finalTotal}.00</>
              ) : (
                <>تأكيد الطلب — ج.م {finalTotal}.00</>
              )}
            </button>

            <div className="flex flex-wrap justify-center gap-5 pt-4 border-t border-gray-200">
              {['سياسة الاسترجاع', 'سياسة الشحن', 'سياسة الخصوصية', 'الشروط والأحكام'].map(link => (
                <Link key={link} href="#" className="text-[11px] text-gray-400 hover:text-gray-700 transition underline underline-offset-2">{link}</Link>
              ))}
            </div>

          </form>
        </div>

        {/* RIGHT COLUMN — Order Summary */}
        <div className="hidden lg:block w-full lg:w-[42%] bg-white border-r border-gray-200 order-1 lg:order-2">
          <div className="sticky top-[65px] px-8 py-10">

            <div className="space-y-5 mb-6 max-h-[320px] overflow-y-auto">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="relative w-14 h-14 bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-200">
                    <img src={item.image || item.images?.[0] || 'https://placehold.co/100'} alt={item.title} className="w-full h-full object-cover" />
                    <span className="absolute -top-1.5 -right-1.5 bg-[#F5C518] text-black text-[9px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-sm">{item.qty}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-800 text-sm leading-tight truncate">{item.title}</h4>
                    {item.selectedSize && <p className="text-xs text-gray-400 mt-0.5">المقاس: {item.selectedSize}</p>}
                  </div>
                  <span className="text-sm font-bold text-gray-800 shrink-0">ج.م {item.price * item.qty}.00</span>
                </div>
              ))}
            </div>

            <div className="mb-6 pb-6 border-b border-gray-100">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" placeholder="كود الخصم"
                    value={discountCode} onChange={e => setDiscountCode(e.target.value)}
                    className="w-full pr-8 pl-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518] placeholder-gray-400 bg-gray-50 uppercase transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => applyPromoCode(discountCode)}
                  className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-black transition-colors"
                >
                  تطبيق
                </button>
              </div>
              {discountError && <p className="text-red-500 text-[10px] mt-1.5 pr-1">{discountError}</p>}
              {appliedPromo && <p className="promo-success pr-1">✓ تم تطبيق كود: {appliedPromo}</p>}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">سعر المنتج</span>
                <span className="font-medium text-gray-800">ج.م {subtotal}.00</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">سعر الشحن</span>
                <span className={`font-medium ${SHIPPING_COST === 0 ? 'text-green-600' : 'text-gray-800'}`}>
                  {SHIPPING_COST === 0 ? 'مجاناً' : `ج.م ${SHIPPING_COST}.00`}
                </span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <div>
                  <span className="text-base font-black text-gray-900">الإجمالي</span>
                  <span className="text-xs text-gray-400 mr-1.5">• جنيه مصري</span>
                </div>
                <span className="text-2xl font-black text-gray-900">ج.م {finalTotal}.00</span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-around text-center">
              {[
                { icon: <Shield size={15} />, label: 'دفع آمن' },
                { icon: <Truck size={15} />, label: 'استرجاع سهل' },
                { icon: <Phone size={15} />, label: 'دعم سريع' },
              ].map(b => (
                <div key={b.label} className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 bg-[#F5C518]/10 rounded-full flex items-center justify-center text-[#F5C518]">
                    {b.icon}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">{b.label}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}