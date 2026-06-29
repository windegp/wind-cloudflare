"use client";

import { useEffect, Suspense, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from "@/context/CartContext";
import { usePageReady, useGlobalLoader } from "@/context/GlobalLoaderContext";
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag, Phone, Truck, Shield, Package, CreditCard, Banknote, Smartphone } from '@/components/icons-extra';
import { fbTrack } from "@/lib/fbTrack";
import { gaPurchase } from "@/lib/gaTrack";
import { buildCheckoutMetaUserData } from "@/lib/metaEventData";

const PAYMENT_LABELS = {
  card:         { label: 'كارت / محفظة إلكترونية', icon: <CreditCard size={14} className="text-[#F5C518]" /> },
  card_success: { label: 'كارت / محفظة إلكترونية', icon: <CreditCard size={14} className="text-[#F5C518]" /> },
  cod:          { label: 'الدفع عند الاستلام',       icon: <Banknote   size={14} className="text-[#F5C518]" /> },
  instapay:     { label: 'إنستا باي',                icon: <Smartphone size={14} className="text-[#F5C518]" /> },
};

function SuccessContent() {
  const pathname = usePathname();
  const { clearCart } = useCart();
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderData, setOrderData] = useState(null);

 useEffect(() => {
    const pendingOrder = localStorage.getItem('pendingOrder');
    if (!pendingOrder) return;

    const parsed = JSON.parse(pendingOrder);

    // ── حماية مزدوجة من تكرار Purchase ──────────────────────────────
    // الطبقة ١: sessionStorage — تمنع إعادة الإرسال طوال جلسة التاب الحالية
    //           (يبقى عند Refresh، يُمسح عند إغلاق التاب)
    // الطبقة ٢: orderId كـ event_id — Meta تُلغي التكرار تلقائياً
    //           إذا وصل نفس pixel_id + event_name + event_id في أقل من 48 ساعة
    const purchaseGuardKey = `purchase_sent_${parsed.orderId}`;
    if (sessionStorage.getItem(purchaseGuardKey)) {
      // تم الإرسال من قبل في هذه الجلسة → أظهر البيانات فقط
      setOrderData(parsed);
      return;
    }

    setOrderData(parsed);
    fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed, paymentMethod: 'card_success' }),
    })
    .then(() => {
      clearCart();
      localStorage.removeItem('pendingOrder');

      // ضع العلامة قبل fbTrack — حتى لو fbTrack فشل لا نُعيد الإرسال
      sessionStorage.setItem(purchaseGuardKey, '1');

      fbTrack("Purchase", {
        event_id: `Purchase-${parsed.orderId}`,   // ثابت → Meta تُلغي التكرار
        value: parsed.total || 0,
        currency: "EGP",
        content_ids: (parsed.cartItems || []).map(it => String(it.handle || it.id || it.title)),
        num_items: (parsed.cartItems || []).reduce((s, it) => s + it.qty, 0),
        order_id: parsed.orderId || "",
        ...buildCheckoutMetaUserData(parsed.formData, {
          email: parsed.customerEmail,
          phone: parsed.phone,
        }),
      });
      gaPurchase(
        parsed.orderId || "",
        (parsed.cartItems || []).map(it => ({
          id: it.handle || it.id || it.title,
          title: it.title,
          price: it.price,
          qty: it.qty,
        })),
        parsed.total || 0
      );
    })
    .catch(err => console.error("Error:", err));
  }, []);

  // Signal readiness for GlobalLoader (thank you page is ready immediately)
  useEffect(() => {
    signalPageReady();
  }, [pathname, signalPageReady]);

  const paymentInfo = PAYMENT_LABELS[orderData?.paymentMethod] || PAYMENT_LABELS['card'];

  return (
    <div className="w-full max-w-md">

      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-2xl font-black text-gray-900 tracking-tight">
          WIND <span className="font-light text-gray-400">Shopping</span>
        </p>
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-400 font-medium">
          <span>السلة</span><span className="opacity-40">›</span>
          <span>معلومات</span><span className="opacity-40">›</span>
          <span>الشحن</span><span className="opacity-40">›</span>
          <span className="text-[#F5C518] font-bold">تأكيد الطلب</span>
        </div>
      </div>

      {/* بطاقة التأكيد */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-4">
        <div className="h-1.5 w-full bg-gradient-to-l from-[#F5C518] via-green-400 to-green-500"></div>
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-green-100">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          {(orderId || orderData?.orderId) && (
            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">
              تأكيد #{orderId || orderData?.orderId}
            </p>
          )}
          <h1 className="text-2xl font-black text-gray-900 mb-1">شكراً لثقتك بـ WIND Shopping!</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            تم استلام طلبك بنجاح. ستصلك رسالة تأكيد على بريدك الإلكتروني قريباً.
          </p>
        </div>
      </div>

      {/* تفاصيل الطلب */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="font-black text-gray-900 text-sm">تفاصيل الطلب</p>
        </div>
        <div className="divide-y divide-gray-100">

          {/* معلومات التواصل */}
          {orderData?.customerEmail && (
            <div className="px-5 py-3.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">معلومات التواصل</p>
              <p className="text-sm text-gray-700">{orderData.customerEmail}</p>
            </div>
          )}

          {/* عنوان الشحن */}
          {orderData?.formData && (
            <div className="px-5 py-3.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">عنوان الشحن</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {orderData.formData.firstName} {orderData.formData.lastName}
                {orderData.formData.address && <><br />{orderData.formData.address}</>}
                {orderData.formData.city && (
                  <><br />{orderData.formData.city}{orderData.formData.governorate ? `، ${orderData.formData.governorate}` : ''}</>
                )}
                {orderData.formData.phone && <><br />{orderData.formData.phone}</>}
              </p>
            </div>
          )}

          {/* طريقة الشحن */}
          <div className="px-5 py-3.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">طريقة الشحن</p>
            <p className="text-sm text-gray-700">شحن قياسي · ٣ - ٥ أيام عمل</p>
          </div>

          {/* طريقة الدفع */}
          <div className="px-5 py-3.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">طريقة الدفع</p>
            <div className="flex items-center gap-2">
              {paymentInfo.icon}
              <p className="text-sm text-gray-700">{paymentInfo.label}</p>
            </div>
            {orderData?.total && (
              <p className="text-xs text-gray-400 mt-0.5">ج.م {orderData.total}.00 EGP</p>
            )}
          </div>

        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-4">
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#F5C518]/10 rounded-full flex items-center justify-center shrink-0">
              <Package size={15} className="text-[#F5C518]" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">جاري تجهيز طلبك</p>
              <p className="text-xs text-gray-400">سيتم التجهيز خلال ٢٤ ساعة</p>
            </div>
            <div className="mr-auto w-2 h-2 rounded-full bg-[#F5C518] animate-pulse"></div>
          </div>
          <div className="w-px h-4 bg-gray-100 mr-4"></div>
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <Truck size={15} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-600">في الطريق إليك</p>
              <p className="text-xs text-gray-400">٣ - ٥ أيام عمل</p>
            </div>
          </div>
          <div className="w-px h-4 bg-gray-100 mr-4"></div>
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 size={15} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-600">تم التسليم</p>
              <p className="text-xs text-gray-400">استمتع بمنتجاتك!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 mb-6 shadow-sm">
        <div className="flex justify-around text-center">
          {[
            { icon: <Shield size={16} />, label: 'دفع آمن' },
            { icon: <Truck size={16} />,  label: 'شحن سريع' },
            { icon: <Phone size={16} />,  label: 'دعم فوري' },
          ].map(b => (
            <div key={b.label} className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 bg-[#F5C518]/10 rounded-full flex items-center justify-center text-[#F5C518]">
                {b.icon}
              </div>
              <span className="text-[10px] text-gray-400 font-medium">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Link href="/" className="flex items-center justify-center gap-2 w-full bg-[#F5C518] hover:bg-[#e6b800] text-black font-black py-4 rounded-xl text-base transition-all shadow-sm mb-3">
        <ShoppingBag size={18} />
        متابعة التسوق
      </Link>

      <p className="text-center text-xs text-gray-400">
        محتاج مساعدة؟{' '}
        <a href="https://wa.me/201026628476" target="_blank" rel="noreferrer" className="text-[#F5C518] font-bold hover:underline">
          تواصل معنا
        </a>
      </p>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center p-5 py-10" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif; }
      `}</style>
      <Suspense fallback={
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#F5C518] font-black animate-pulse">جاري تأكيد الطلب...</p>
        </div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
