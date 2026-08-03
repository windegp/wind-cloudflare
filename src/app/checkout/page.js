"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useCart } from "../../context/CartContext";
import { usePathname } from 'next/navigation';
import { usePageReady, useGlobalLoader } from "../../context/GlobalLoaderContext";
import { useRouter } from 'next/navigation';
import Link from "next/link";
// 🔥 استدعاء الفايربيس — إصدار خفيف مخصص للـ checkout فقط
// يستورد firebase/firestore/lite فقط بدون storage/auth/database
// لتجنب مشاكل Edge Runtime في Cloudflare
import { getDb } from "@/lib/firebase-checkout";
import { doc, setDoc, getDoc, deleteDoc, updateDoc, increment, collection, query, where, getDocs, limit } from "firebase/firestore/lite";
import { ChevronDown, Info, CheckCircle2, Phone, ShoppingBag, Shield, Tag, ChevronLeft, Truck, CreditCard, Banknote, Smartphone, X, Lock } from '@/components/icons-extra';
import { SHIPPING_COST } from '@/lib/constants';
import { fbTrack } from "@/lib/fbTrack";
import { ttTrack, buildTtUserData } from "@/lib/ttTrack";
import { getCatalogId } from "@/lib/catalogId";
import { getTikTokSkuIdForItem } from "@/lib/tiktokCatalogId";
import { gaBeginCheckout, gaPurchase } from "@/lib/gaTrack";
import { buildCheckoutMetaUserData } from "@/lib/metaEventData";
import { getCairoTimestamp } from '@/lib/analytics-helpers';

// Helper function to handle Firebase errors
async function hashSHA256(text) {
  if (!text) return undefined;
  const cleaned = text.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(cleaned);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Modal Container ── */}
      <div className="relative w-full max-w-[480px] bg-white rounded-2xl overflow-hidden shadow-2xl"
           style={{ maxHeight: '90vh' }}>

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
              <Lock size={14} className="text-gray-700" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">بوابة الدفع الآمنة</p>
              <p className="text-[10px] text-gray-400">مشفّر بـ SSL — كاشير</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-focus w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
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
    discount,
    shipping, 
    total, 
    applyPromoCode,
    removePromoCode,
    discountError,
    setDiscountError,
    appliedPromo,
    promoLoading,
    isFirstOrder,
    setIsFirstOrder,
    shippingSettings,
    setSelectedGovernorate,
  } = useCart();
  
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();

  const SHIPPING_COST = shipping;
  const finalTotal    = total;

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [showAllIcons, setShowAllIcons] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [payAreaSummaryOpen, setPayAreaSummaryOpen] = useState(false);

  // ── state جديد للـ iFrame ──
  const [iframeData, setIframeData] = useState(null);

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
  const checkoutEventSentRef = useRef(false);
  useEffect(() => {
  signalPageReady();
  // 🔥 نرسل الحدث مرة واحدة فقط، وبعد توفر عناصر السلة فعلياً (لتجنب content_ids فاضية بسبب stale closure)
  if (cartItems.length > 0 && !checkoutEventSentRef.current) {
    checkoutEventSentRef.current = true;
    fbTrack("InitiateCheckout", {
      value: finalTotal,
      currency: "EGP",
      num_items: cartItems.reduce((s, it) => s + it.qty, 0),
      // Meta Catalog ID — لا يتغير.
      content_ids: cartItems
        .filter(it => it.handle || it.id)
        .map(it => getCatalogId(it.handle || it.id, it.selectedColor)),
    });
    ttTrack("InitiateCheckout", {
      value: finalTotal,
      currency: "EGP",
      num_items: cartItems.reduce((s, it) => s + it.qty, 0),
      content_ids: cartItems
        .filter(it => it.handle || it.id)
        .map(it => getTikTokSkuIdForItem(it)),
    }); // TikTok — مستقل تمامًا عن fbTrack أعلاه
    gaBeginCheckout(cartItems, finalTotal);
  }
}, [pathname, signalPageReady, cartItems]);

  // 🔥 توحيد رقم الطلب من البداية (استراتيجية المستند الواحد)
  const activeOrderIdRef = useRef(null);
  if (!activeOrderIdRef.current && typeof window !== 'undefined') {
    activeOrderIdRef.current = `WIND-${Date.now().toString().slice(-5)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
  }
  const activeOrderId = activeOrderIdRef.current;
  
  // 🔥 متغير لإيقاف رادار السلة المتروكة بمجرد ضغط زر الدفع
  const isOrderSubmittedRef = useRef(false);

  // ============================================================
  // 🚀 رادار السلة المتروكة المطور (استراتيجية المستند الواحد)
  // ============================================================
  const lastSavedDraftRef = useRef(""); 

  // ── تحقق تلقائي من أول طلب عند إدخال الإيميل أو التليفون ──
  useEffect(() => {
    if (!shippingSettings?.firstOrderEnabled) {
      setIsFirstOrder(false);
      return;
    }
    const isValidEmail = formData.email && formData.email.includes('@') && formData.email.includes('.');
    const isValidPhone = formData.phone && formData.phone.replace(/\D/g,'').length >= 11;
    // لازم الإيميل والتليفون معاً — منع الخصم بإيميل وهمي بدون تليفون حقيقي
    if (!isValidEmail || !isValidPhone) { setIsFirstOrder(false); return; }

    const emailId = formData.email.toLowerCase().trim();
    const phoneId = formData.phone.replace(/\D/g,'');

    const checkFirstOrder = async () => {
      try {
        const db = getDb();

        // 1. تحقق من الإيميل كـ document ID (الطريقة الأساسية للتخزين)
        const emailSnap = await getDoc(doc(db, "Customers", emailId));
        const emailOrders = emailSnap.exists() ? Number(emailSnap.data()['Total Orders'] || 0) : 0;
        if (emailOrders > 0) { setIsFirstOrder(false); return; }

        // 2. تحقق من التليفون كـ document ID (لو العميل اشترى بتليفون بدون إيميل)
        const phoneDocSnap = await getDoc(doc(db, "Customers", phoneId));
        const phoneDocOrders = phoneDocSnap.exists() ? Number(phoneDocSnap.data()['Total Orders'] || 0) : 0;
        if (phoneDocOrders > 0) { setIsFirstOrder(false); return; }

        // 3. تحقق من التليفون كـ field في أي document (عميل اشترى بإيميل مختلف)
        const phoneQuery = query(
          collection(db, "Customers"),
          where("Phone", "==", formData.phone.trim()),
          limit(1)
        );
        const phoneQuerySnap = await getDocs(phoneQuery);
        if (!phoneQuerySnap.empty) {
          const existingOrders = Number(phoneQuerySnap.docs[0].data()['Total Orders'] || 0);
          if (existingOrders > 0) { setIsFirstOrder(false); return; }
        }

        // الإيميل والتليفون كلاهم جديدان تماماً
        setIsFirstOrder(true);
      } catch { setIsFirstOrder(false); }
    };

    const timer = setTimeout(checkFirstOrder, 600); // debounce
    return () => clearTimeout(timer);
  }, [formData.email, formData.phone, shippingSettings?.firstOrderEnabled, setIsFirstOrder]);

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
          const orderRef = doc(getDb(), "Orders", activeOrderId);

          // 🔥 ربط الطلب بمعرّف المتصفح المجهول (wind_external_id، نفس القيمة
          // التي يرسلها fbTrack.js لـ Meta) — لأغراض WIND الداخلية فقط
          // (لا علاقة له بـ external_id المُرسَل لـ Meta، ولا يغيّر معناه ولا
          // قيمته هناك). إضافة حقل جديد فقط، لا تعديل على أي حقل موجود.
          let anonymousBrowserId;
          try {
            anonymousBrowserId = window.localStorage.getItem("wind_external_id") || null;
          } catch {
            anonymousBrowserId = null;
          }

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
            "Created at": getCairoTimestamp(),
            data_source: "WIND_Web",
            AnonymousBrowserId: anonymousBrowserId,
            lineItems: cartItems.map(item => ({
              name: `${item.title} ${item.selectedSize ? '- ' + item.selectedSize : ''}`,
              price: item.price,
              quantity: item.qty,
              image: item.image || item.images?.[0] || ''
            }))
          };

          if (appliedPromo?.code) draftData['Discount Code'] = appliedPromo.code;

          await setDoc(orderRef, draftData, { merge: true });

          const cleanPhone = formData.phone.replace(/[^0-9]/g, '');
          const uniqueId = isValidEmail ? formData.email.toLowerCase().trim() : cleanPhone;
          
          if (uniqueId) {
            const customerRef = doc(getDb(), "Customers", uniqueId);
            await setDoc(customerRef, {
              "First Name": formData.firstName || "",
              "Last Name": formData.lastName || "",
              Email: formData.email ? formData.email.toLowerCase().trim() : "",
              Phone: formData.phone || "",
              AnonymousBrowserId: anonymousBrowserId,
              "Default Address Address1": formData.address || "",
              "Default Address City": formData.city || "",
              "Default Address Province": formData.governorate || "",
              data_source: "WIND_Web",
              segments: ["Abandoned_Checkout"],
              hasAbandoned: true, 
              last_active: getCairoTimestamp()
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
    // 🔥 تحديث فوري لسعر الشحن حسب المحافظة — نفس event handler، React بيعمل batch للـ state updates مع بعض
    if (name === 'governorate') setSelectedGovernorate(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return window.scrollTo(0, 0);

    // ── التحقق النهائي من الكود لما يكون مقيد بعميل معين ──
    // يحصل هنا لأن الإيميل والتليفون متأكدين منهم دلوقتي
    if (appliedPromo?.valid && (appliedPromo.usageType === 'once_per_customer' || appliedPromo.firstOrderOnly)) {
      const identifier = formData.email?.toLowerCase().trim() || formData.phone?.replace(/\D/g, '');
      if (identifier) {
        try {
          const recheck = await fetch("/api/validate-promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: appliedPromo.code,
              customerEmail: formData.email,
              customerPhone: formData.phone,
              cartItems,
              subtotal,
            }),
          });
          const recheckResult = await recheck.json();
          if (!recheckResult.valid) {
            // الكود مش صالح لهذا العميل — نشيله ونوقف الطلب
            removePromoCode();
            setDiscountError(recheckResult.message || 'هذا الكود لا ينطبق على بيانات هذا الحساب');
            window.scrollTo(0, 0);
            return;
          }
        } catch { /* نكمل في حالة فشل الـ network */ }
      }
    }

    setLoading(true);
    
    isOrderSubmittedRef.current = true;

    const orderId = activeOrderId;

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
        "Created at": getCairoTimestamp(),
        data_source: "WIND_Web",
        lineItems: cartItems.map(item => ({
          name: `${item.title} ${item.selectedSize ? '- ' + item.selectedSize : ''}`,
          price: item.price,
          quantity: item.qty,
          image: item.image || item.images?.[0] || ''
        }))
      };

      if (appliedPromo?.code) orderData['Discount Code'] = appliedPromo.code;

      try {
        await setDoc(doc(getDb(), "Orders", orderId), orderData, { merge: true });

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
              if (currentOrders === 0) {
                const sRef = doc(getDb(), "settings", "siteSettings");
                await updateDoc(sRef, {
                  "counters.customers": increment(1)
                });
              }

              await setDoc(customerRef, {
                "Total Orders": currentOrders + 1,
                "Total Spent": currentSpent + Number(finalTotal),
                Last_Order_Status: "New",
                data_source: "WIND_Web",
                Phone: formData.phone,
                "Default Address City": formData.city || "",
                "Default Address Province": formData.governorate || "",
                segments: [newSegment],
                status: newSegment,
                last_active: getCairoTimestamp()
              }, { merge: true });
            } catch (error) {
              console.error('Error updating customer:', error);
            }
          } else {
            try {
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
                status: "Purchased_Once",
                last_active: getCairoTimestamp()
              });
            } catch (error) {
              console.error('Error creating customer:', error);
            }
          }
        }
      }

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
        const res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod,
            orderId,
            formData,
            cartItems,
            subtotal,
            shipping: SHIPPING_COST,
            total: finalTotal,
            appliedPromo,
          }),
        });

        if (!res.ok) throw new Error('حدث خطأ في إنشاء الطلب');

        // 🔥 لازم نحفظ بيانات السلة هنا (snapshot) قبل clearCart()
        // وإلا cartItems تصبح فاضية أو جزئية وقت إرسال Purchase بسبب إعادة الرندر بعد await
        // 🔥 لا Fallback لـ title في content_ids — title لا يطابق أي شيء في
        // Catalog أبداً. ونستخدم getCatalogId (نفس مصدر الكتالوج) بدل
        // الـ handle الخام، لأنه لازم يطابق g:id الخاص باللون الفعلي
        // المشترى، وليس فقط أول لون بالصدفة.
        const purchaseContentIds = cartItems
          .filter(it => it.handle || it.id)
          .map(it => getCatalogId(it.handle || it.id, it.selectedColor));
        const purchaseTikTokContentIds = cartItems
          .filter(it => it.handle || it.id)
          .map(it => getTikTokSkuIdForItem(it));
        const purchaseNumItems = cartItems.reduce((s, it) => s + it.qty, 0);
        const purchaseCartSnapshot = cartItems.map(it => ({
          id: it.handle || it.id || it.title,
          title: it.title,
          price: it.price,
          qty: it.qty,
        }));

        localStorage.removeItem('pendingOrder');

        // ── تسجيل استخدام الكود في Firestore ──
        if (appliedPromo?.valid && appliedPromo.code) {
          const identifier = formData.email?.toLowerCase().trim() || formData.phone?.replace(/\D/g, '');
          try {
            const { doc: fsDoc, updateDoc: fsUpdateDoc, arrayUnion, increment: fsIncrement } = await import('firebase/firestore/lite');
            const promoRef = fsDoc(getDb(), 'promoCodes', appliedPromo.code);
            const updates = { usedCount: fsIncrement(1) };
            if (identifier && (appliedPromo.usageType === 'once_per_customer')) {
              updates.usedBy = arrayUnion(identifier);
            }
            await fsUpdateDoc(promoRef, updates);
          } catch { /* تسجيل الاستخدام مش حرج — نكمل */ }
        }

        clearCart();
        setLoading(false);
        fbTrack("Purchase", {
          // 🔥 event_id ثابت مبني على orderId (مثل مسار الدفع الإلكتروني في
          // thank-you/page.js) — لو تكرر تنفيذ هذا الفرع لأي سبب (رجوع
          // للخلف، إعادة تحميل)، تُلغي Meta التكرار تلقائياً بدل احتساب
          // Purchase مرتين لنفس الطلب.
          event_id: `Purchase-${orderId}`,
          value: finalTotal,
          currency: "EGP",
          content_ids: purchaseContentIds,
          num_items: purchaseNumItems,
          order_id: orderId,
          ...buildCheckoutMetaUserData(formData),
        });
        // TikTok — مستقل تمامًا عن fbTrack أعلاه. event_id الخاص بـ TikTok
        // يُبنى داخل ttTrack.js نفسها من order_id (وليس من event_id الممرَّر
        // هنا، الذي يُتجاهَل عمداً لأنه خاص بـ Meta فقط).
        ttTrack("CompletePayment", {
          value: finalTotal,
          currency: "EGP",
          content_ids: purchaseTikTokContentIds,
          num_items: purchaseNumItems,
          order_id: orderId,
          ...buildTtUserData(formData),
        });
        gaPurchase(orderId, purchaseCartSnapshot, finalTotal);
router.push(`/thank-you?orderId=${orderId}`);
      }

    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };


  const inputClass = (field) =>
    `w-full px-4 py-3 border rounded-lg outline-none transition-all text-sm bg-white placeholder-gray-400 text-gray-800
     focus:ring-2 focus:ring-gray-300 focus:border-gray-400
     ${errors[field] ? 'border-red-400 bg-red-50/40' : 'border-gray-300 hover:border-gray-400'}`;

  return (
    <div className="min-h-screen bg-white text-gray-800" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif; }

        .section-label {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #374151;
          margin-bottom: 14px;
        }

        .pay-opt { transition: outline-color 0.18s, border-color 0.18s, background 0.18s; outline: 2px solid transparent; outline-offset: -1px; }
        .pay-opt:hover, .pay-opt:focus-within { outline-color: #2563eb; }
        .pay-opt.active { border-color: #2563eb !important; background: #eff6ff; }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .slide-down { animation: slideDown 0.22s ease forwards; }

        .promo-success { color: #059669; font-size: 11px; margin-top: 5px; font-weight: 600; }

        .pay-btn {
          background: #2563eb;
          color: #ffffff;
          position: relative;
        }
        .pay-btn:hover { background: #1d4ed8; }
        .pay-btn:active { transform: scale(0.997); }

        select { appearance: none; }
        select option { background: white; }

        /* ── تأثير التركيز/الوقوف بالأزرق الموحّد — حد واحد فقط بحواف دائرية، بدون تكرار ── */
        .interactive-box {
          transition: outline-color 0.18s, border-color 0.18s;
          outline: 2px solid transparent;
          outline-offset: -1px;
        }
        .interactive-box:hover,
        .interactive-box:focus-within {
          outline-color: #2563eb;
        }
        /* الحقول الداخلية لا تأخذ حد خاص بها، فقط الصندوق الأب المستدير */
        .interactive-box input:focus,
        .interactive-box select:focus,
        .interactive-box textarea:focus {
          outline: none !important;
          box-shadow: none !important;
        }

        /* عناصر لها حواف مستديرة خاصة بها (حقل الكود، زر تطبيق، الأزرار) */
        .rounded-focus:focus,
        .rounded-focus:focus-visible {
          outline: 2px solid #2563eb !important;
          outline-offset: 1px;
          box-shadow: none !important;
        }

        .policy-link { color: #2563eb; }
        .policy-link:hover { color: #1d4ed8; }
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
          <Link href="/" className="text-2xl font-black text-gray-900 tracking-tight">
            WIND <span className="font-black text-gray-900">Shopping</span>
          </Link>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 font-medium select-none">
            <span className="text-gray-900 font-semibold">السلة</span>
            <span className="mx-1 opacity-40">›</span>
            <span className="text-gray-900 font-semibold">معلومات</span>
            <span className="mx-1 opacity-40">›</span>
            <span>الشحن</span>
            <span className="mx-1 opacity-40">›</span>
            <span>الدفع</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm font-semibold">
            <ShoppingBag size={20} className="text-blue-600" />
            <span>دفع آمن</span>
          </div>
        </div>
      </header>

      {/* MOBILE: Order Summary Toggle */}
      <div
        className="lg:hidden bg-gray-50 border-b border-gray-200 px-5 py-4 cursor-pointer"
        onClick={() => setSummaryOpen(!summaryOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: '#2563eb' }}>
            <ShoppingBag size={16} style={{ color: '#2563eb' }} />
            <span>{summaryOpen ? 'إخفاء تفاصيل الطلب' : 'عرض تفاصيل الطلب'}</span>
            <ChevronDown size={15} className={`transition-transform ${summaryOpen ? 'rotate-180' : ''}`} style={{ color: '#2563eb' }} />
          </div>
          <span className="font-black text-xl text-gray-900">ج.م {subtotal}.00</span>
        </div>

        {summaryOpen && (
          <div className="mt-4 pb-2 slide-down space-y-3" onClick={e => e.stopPropagation()}>
            {cartItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-visible shrink-0">
                  <img src={item.image || item.images?.[0] || 'https://placehold.co/100'} alt={item.title} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                  <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-sm font-black shadow">{item.qty}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{item.title}</p>
                  <p className="text-xs text-gray-400">
                    {[item.selectedSize, item.selectedColor].filter(Boolean).join(' / ')}
                  </p>
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
                    className="rounded-focus w-full pr-8 pl-3 py-3.5 border border-gray-200 rounded-lg text-sm outline-none placeholder-gray-400 bg-gray-100 uppercase transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => applyPromoCode(discountCode, formData.email, formData.phone)} disabled={promoLoading}
                  className="rounded-focus bg-gray-50 text-gray-800 border border-gray-200 px-4 py-3.5 rounded-lg font-bold text-xs hover:bg-gray-100 transition-colors"
                >
                  تطبيق
                </button>
              </div>
              {discountError && <p className="text-red-500 text-[10px] mt-1.5 pr-1">{discountError}</p>}
              {appliedPromo && <p className="promo-success pr-1">✓ {appliedPromo.message || ("تم تطبيق كود: " + appliedPromo.code)} <button onClick={removePromoCode} className="mr-2 text-red-400 hover:text-red-600 font-bold">✕</button></p>}

            </div>

            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-base">
              <div className="flex justify-between text-gray-500"><span>سعر المنتج</span><span className="text-gray-800 font-medium">ج.م {subtotal}.00</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>{appliedPromo?.type && appliedPromo.type !== 'free_shipping' ? 'خصم الكود' : 'خصم الطلب الأول 🎉'}</span>
                  <span className="font-bold">- ج.م {discount}.00</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500"><span>سعر الشحن</span><span className={`font-medium ${SHIPPING_COST === 0 ? 'text-green-600' : 'text-gray-800'}`}>{SHIPPING_COST === 0 ? 'مجاناً' : `ج.م ${SHIPPING_COST}.00`}</span></div>
              <div className="flex justify-between font-black text-lg pt-2 border-t border-gray-100">
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
              <div className="interactive-box bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-1">
                  <InputField error={errors.email}>
                    <input
                      type="email" name="email"
                      placeholder="البريد الإلكتروني"
                      value={formData.email} onChange={handleInputChange}
                      className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                      style={{ border: 'none', boxShadow: 'none' }}
                    />
                  </InputField>
                </div>
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1 pr-1"><span>⚠</span> هذا الحقل مطلوب</p>}
              <label className="flex items-center gap-2 cursor-pointer mt-3 pr-1">
                <input type="checkbox" className="w-4 h-4 rounded accent-blue-600" style={{ accentColor: '#2563eb' }} />
                <span className="text-xs text-gray-500">أرسل لي أحدث العروض والمنتجات الجديدة</span>
              </label>
            </div>

            {/* SECTION: Delivery */}
            <div className="mb-8">
              <p className="section-label">عنوان التوصيل</p>
              <div className="space-y-2">

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1 relative">
                  <select
                    className="w-full py-3 text-sm bg-transparent outline-none text-gray-800 border-0 appearance-none"
                    style={{ border:'none', boxShadow:'none' }}
                    defaultValue="EG"
                  >
                    <option value="EG">مصر</option>
                    <option value="SA">المملكة العربية السعودية</option>
                    <option value="AE">الإمارات العربية المتحدة</option>
                    <option value="KW">الكويت</option>
                    <option value="QA">قطر</option>
                    <option value="BH">البحرين</option>
                    <option value="OM">عُمان</option>
                    <option value="JO">الأردن</option>
                    <option value="LB">لبنان</option>
                    <option value="IQ">العراق</option>
                    <option value="LY">ليبيا</option>
                    <option value="TN">تونس</option>
                    <option value="MA">المغرب</option>
                    <option value="DZ">الجزائر</option>
                    <option value="SD">السودان</option>
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
                  <input
                    type="text" name="firstName"
                    placeholder="الاسم الأول"
                    value={formData.firstName} onChange={handleInputChange}
                    className={`w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0 ${errors.firstName ? 'placeholder-red-300' : ''}`}
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
                  <input
                    type="text" name="lastName"
                    placeholder="اسم العائلة (اختياري)"
                    value={formData.lastName} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
                  <input
                    type="text" name="address"
                    placeholder="العنوان بالتفصيل (الشارع، رقم المبنى)"
                    value={formData.address} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
                  <input
                    type="text" name="landmark"
                    placeholder="علامة مميزة للموقع (اختياري)"
                    value={formData.landmark} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
                  <input
                    type="text" name="city"
                    placeholder="المدينة"
                    value={formData.city} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1 relative">
                  <select
                    name="governorate" value={formData.governorate} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none text-gray-800 border-0 appearance-none"
                    style={{ border:'none', boxShadow:'none' }}
                  >
                    {governorates.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
                  <input
                    type="text" name="postalCode"
                    placeholder="الرمز البريدي (اختياري)"
                    value={formData.postalCode} onChange={handleInputChange}
                    className="w-full py-3 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                </div>

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1 relative">
                  <input
                    type="tel" name="phone"
                    placeholder="رقم الهاتف"
                    value={formData.phone} onChange={handleInputChange}
                    className="w-full py-3 pl-8 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 border-0"
                    style={{ border:'none', boxShadow:'none' }}
                  />
                  <Info size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>

                {/* بادج خصم الطلب الأول — يظهر بمجرد التحقق */}
                {isFirstOrder && shippingSettings?.firstOrderEnabled && !appliedPromo && (
                  <div className="mt-2 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-300">
                    <span className="text-lg">🎉</span>
                    <div>
                      <p className="text-xs font-black text-emerald-800">مبروك! خصم {shippingSettings.firstOrderDiscount}% على طلبك الأول</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">تم التطبيق تلقائياً — سيظهر في ملخص طلبك</p>
                    </div>
                  </div>
                )}

                <div className="interactive-box bg-white border border-gray-200 rounded-xl px-4 py-1">
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
              <div className="interactive-box bg-white border border-gray-300 rounded-xl px-4 py-3.5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
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
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === 'card' ? 'border-blue-600' : 'border-gray-300'}`}>
                        {paymentMethod === 'card' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                      </div>
                      <input type="radio" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} className="sr-only" style={{ accentColor: '#2563eb' }} />
                      <span className="font-semibold text-sm text-gray-800">كارت / محفظة إلكترونية</span>
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
            className="rounded-focus w-8 h-4 bg-gray-50 border border-gray-300 rounded-sm flex items-center justify-center shadow-sm hover:bg-gray-100 cursor-pointer transition-all"
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
                      <Lock size={11} className="text-gray-500" />
                      ستظهر بوابة الدفع الآمنة مباشرةً في نفس الصفحة
                    </div>
                  )}
                </label>

                <label className={`pay-opt flex items-center gap-3 px-4 py-4 cursor-pointer ${paymentMethod === 'cod' ? 'active' : ''}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === 'cod' ? 'border-blue-600' : 'border-gray-300'}`}>
                    {paymentMethod === 'cod' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                  </div>
                  <input type="radio" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="sr-only" style={{ accentColor: '#2563eb' }} />
                  <div>
                    <p className="font-semibold text-sm text-gray-800">الدفع عند الاستلام</p>
                    <p className="text-xs text-gray-400">ادفع كاش لدى استلام طلبك</p>
                  </div>
                </label>

                <label className={`pay-opt flex flex-col px-4 py-4 cursor-pointer ${paymentMethod === 'instapay' ? 'active' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === 'instapay' ? 'border-blue-600' : 'border-gray-300'}`}>
                      {paymentMethod === 'instapay' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                    </div>
                    <input type="radio" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} className="sr-only" style={{ accentColor: '#2563eb' }} />
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
                          <span className="font-mono font-black text-white bg-gray-900 px-2 py-0.5 rounded select-all">01026628476</span>
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

{/* ORDER DETAILS — مقفول، فوق زر الدفع — الإجمالي شامل الشحن */}
            <div className="mb-4">
              <div
                className="px-2 py-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setPayAreaSummaryOpen(!payAreaSummaryOpen)}
              >
                <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-visible shrink-0">
                  <img
                    src={cartItems[0]?.image || cartItems[0]?.images?.[0] || 'https://placehold.co/100'}
                    alt={cartItems[0]?.title || ''}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-sm font-black shadow">
                    {cartItems.reduce((s, it) => s + it.qty, 0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 text-sm leading-tight">الإجمالي</p>
                  <p className="text-sm text-gray-400 mt-0.5 font-normal">
                    {cartItems.reduce((s, it) => s + it.qty, 0)} {cartItems.reduce((s, it) => s + it.qty, 0) === 1 ? 'منتج' : 'منتجات'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black text-xl text-gray-900">ج.م {finalTotal}.00</span>
                  <span className="bg-gray-100 text-gray-500 text-[11px] font-bold px-2 py-1 rounded-full">EGP</span>
                  <ChevronDown size={18} className={`text-gray-900 transition-transform ${payAreaSummaryOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {payAreaSummaryOpen && (
                <div className="mt-3 slide-down bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  {cartItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="relative w-10 h-10 bg-gray-100 rounded-lg overflow-visible shrink-0">
                        <img src={item.image || item.images?.[0] || 'https://placehold.co/100'} alt={item.title} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                        <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-sm font-black shadow">{item.qty}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{item.title}</p>
                        {(item.selectedSize || item.selectedColor) && (
                          <p className="text-xs text-gray-400">
                            {[item.selectedSize, item.selectedColor].filter(Boolean).join(' / ')}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-gray-800 shrink-0">ج.م {item.price * item.qty}.00</span>
                    </div>
                  ))}

                  <div className="pt-2 pb-1">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text" placeholder="كود الخصم"
                          value={discountCode} onChange={e => setDiscountCode(e.target.value)}
                          className="rounded-focus w-full pr-8 pl-3 py-3.5 border border-gray-200 rounded-lg text-sm outline-none placeholder-gray-400 bg-gray-100 uppercase transition"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => applyPromoCode(discountCode, formData.email, formData.phone)} disabled={promoLoading}
                        className="rounded-focus bg-gray-50 text-gray-800 border border-gray-200 px-4 py-3.5 rounded-lg font-bold text-xs hover:bg-gray-100 transition-colors"
                      >
                        تطبيق
                      </button>
                    </div>
                    {discountError && <p className="text-red-500 text-[10px] mt-1.5 pr-1">{discountError}</p>}
                    {appliedPromo && <p className="promo-success pr-1">✓ {appliedPromo.message || ("تم تطبيق كود: " + appliedPromo.code)} <button onClick={removePromoCode} className="mr-2 text-red-400 hover:text-red-600 font-bold">✕</button></p>}
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-500"><span>سعر المنتج</span><span className="text-gray-800 font-medium">ج.م {subtotal}.00</span></div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>{appliedPromo?.type && appliedPromo.type !== 'free_shipping' ? 'خصم الكود' : 'خصم الطلب الأول 🎉'}</span>
                        <span className="font-bold">- ج.م {discount}.00</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-500">
                      <span>سعر الشحن</span>
                      <span className={`font-medium ${SHIPPING_COST === 0 ? 'text-green-600' : 'text-gray-800'}`}>{SHIPPING_COST === 0 ? 'مجاناً' : `ج.م ${SHIPPING_COST}.00`}</span>
                    </div>
                    <div className="flex justify-between font-black text-base pt-2 border-t border-gray-100">
                      <span>الإجمالي</span>
                      <span>ج.م {finalTotal}.00</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="pay-btn rounded-focus w-full font-black py-4 rounded-xl text-base transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mb-6"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                  {paymentMethod === 'card' ? 'جارٍ تحضير بوابة الدفع...' : 'جارٍ المعالجة...'}
                </>
              ) : paymentMethod === 'card' ? (
                <>ادفع الآن — ج.م {finalTotal}.00</>
              ) : (
                <>تأكيد الطلب — ج.م {finalTotal}.00</>
              )}
            </button>

            <div className="flex flex-wrap justify-center gap-5 pt-4 border-t border-gray-200">
              <Link href="/policies/refund-policy" className="policy-link text-[11px] transition underline underline-offset-2">سياسة الاسترجاع</Link>
              <Link href="/policies/shipping-policy" className="policy-link text-[11px] transition underline underline-offset-2">سياسة الشحن</Link>
              <Link href="/policies/privacy-policy" className="policy-link text-[11px] transition underline underline-offset-2">سياسة الخصوصية</Link>
              <Link href="/policies/terms-of-service" className="policy-link text-[11px] transition underline underline-offset-2">الشروط والأحكام</Link>
            </div>

          </form>
        </div>

        {/* RIGHT COLUMN — Order Summary */}
        <div className="hidden lg:block w-full lg:w-[42%] bg-gray-100 border-r border-gray-200 order-1 lg:order-2">
          <div className="sticky top-[65px] px-8 py-12">

            <div className="space-y-5 mb-6 max-h-[320px] overflow-y-auto">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="relative w-14 h-14 bg-gray-200 rounded-xl overflow-visible shrink-0">
                    <img src={item.image || item.images?.[0] || 'https://placehold.co/100'} alt={item.title} className="w-full h-full object-cover rounded-xl border border-gray-300" />
                    <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-[10px] min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-sm font-black shadow">{item.qty}</span>
                  </div>
                  <div className="flex-1 min-w-0">

                    <h4 className="font-semibold text-gray-800 text-sm leading-tight truncate">{item.title}</h4>

                    {(item.selectedSize || item.selectedColor) && (

                      <p className="text-xs text-gray-400 mt-0.5">

                        {[item.selectedSize ? `المقاس: ${item.selectedSize}` : null, item.selectedColor].filter(Boolean).join(' • ')}

                      </p>

                    )}

                  </div>
                  <span className="text-sm font-bold text-gray-800 shrink-0">ج.م {item.price * item.qty}.00</span>
                </div>
              ))}
            </div>

            <div className="mb-6 pb-6 border-b border-gray-300">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" placeholder="كود الخصم"
                    value={discountCode} onChange={e => setDiscountCode(e.target.value)}
                    className="rounded-focus w-full pr-8 pl-3 py-3.5 border border-gray-200 rounded-lg text-sm outline-none placeholder-gray-400 bg-gray-50 uppercase transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => applyPromoCode(discountCode, formData.email, formData.phone)} disabled={promoLoading}
                  className="rounded-focus bg-gray-100 text-gray-800 border border-gray-200 px-4 py-3.5 rounded-lg font-bold text-xs hover:bg-gray-200 transition-colors"
                >
                  تطبيق
                </button>
              </div>
              {discountError && <p className="text-red-500 text-[10px] mt-1.5 pr-1">{discountError}</p>}
              {appliedPromo && <p className="promo-success pr-1">✓ {appliedPromo.message || ("تم تطبيق كود: " + appliedPromo.code)} <button onClick={removePromoCode} className="mr-2 text-red-400 hover:text-red-600 font-bold">✕</button></p>}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-base">
                <span className="text-gray-500">سعر المنتج</span>
                <span className="font-semibold text-gray-800">ج.م {subtotal}.00</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-base text-emerald-600">
                  <span>{appliedPromo?.type && appliedPromo.type !== 'free_shipping' ? 'خصم الكود' : 'خصم الطلب الأول 🎉'}</span>
                  <span className="font-semibold">- ج.م {discount}.00</span>
                </div>
              )}
              <div className="flex justify-between items-center text-base">
                <span className="text-gray-500">سعر الشحن</span>
                <span className={`font-semibold ${SHIPPING_COST === 0 ? 'text-green-600' : 'text-gray-800'}`}>
                  {SHIPPING_COST === 0 ? 'مجاناً' : `ج.م ${SHIPPING_COST}.00`}
                </span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-gray-300">
                <div>
                  <span className="text-xl font-black text-gray-900">الإجمالي</span>
                  <span className="text-xs text-gray-400 mr-1.5">• جنيه مصري</span>
                </div>
                <span className="text-3xl font-black text-gray-900">ج.م {finalTotal}.00</span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-300 flex justify-around text-center">
              {[
                { icon: <Shield size={15} />, label: 'دفع آمن' },
                { icon: <Truck size={15} />, label: 'استرجاع سهل' },
                { icon: <Phone size={15} />, label: 'دعم سريع' },
              ].map(b => (
                <div key={b.label} className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-700">
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
