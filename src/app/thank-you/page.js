"use client";
import { orderDisplayLabel } from "@/lib/orderDisplayNumber";

import { resolveThankYouState } from "@/lib/checkoutThankYouState";
import { finishBrowserCheckoutAttempt } from "@/lib/checkoutAttemptBrowser";
import { useEffect, Suspense, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from "@/context/CartContext";
import { usePageReady, useGlobalLoader } from "@/context/GlobalLoaderContext";
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag, Phone, Truck, Shield, Package, CreditCard, Banknote, Smartphone } from '@/components/icons-extra';
import { fbTrack } from "@/lib/fbTrack";
import { ttTrack, buildTtUserData } from "@/lib/ttTrack";
import { getCatalogId } from "@/lib/catalogId";
import { gaPurchase } from "@/lib/gaTrack";
import { buildCheckoutMetaUserData } from "@/lib/metaEventData";
import { DISPLAY_RECORD_KEY, knownPaymentMethod, parseDisplayRecord, mergeDisplayOrder, formatMoney } from "@/lib/thankYouDisplay";

const PAYMENT_LABELS = {
  card:         { label: 'كارت / محفظة إلكترونية', icon: <CreditCard size={14} className="text-[#737373]" /> },
  card_success: { label: 'كارت / محفظة إلكترونية', icon: <CreditCard size={14} className="text-[#737373]" /> },
  cod:          { label: 'الدفع عند الاستلام',       icon: <Banknote   size={14} className="text-[#737373]" /> },
  instapay:     { label: 'إنستا باي',                icon: <Smartphone size={14} className="text-[#737373]" /> },
};

function SuccessContent() {
  const pathname = usePathname();
  const { clearCart } = useCart();
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderData, setOrderData] = useState(null);
  const [verification, setVerification] = useState(orderId?.startsWith("WIND-D-") ? "جاري التحقق من بيانات الطلب." : null);
  const [statusRefresh, setStatusRefresh] = useState(0);
  // Display-only copy of the order saved at checkout (cash / InstaPay orders have no receipt).
  // It is never used for tracking, emails or payment checks.
  const [displayRecord, setDisplayRecord] = useState(null);
  useEffect(() => {
    try { setDisplayRecord(parseDisplayRecord(sessionStorage.getItem(DISPLAY_RECORD_KEY), orderId)); } catch (_) {}
  }, [orderId]);

 useEffect(() => {
    let records = [];
    try {
      records = [sessionStorage.getItem("wind_durable_request_v1"), localStorage.getItem('pendingOrder'), sessionStorage.getItem("wind_last_confirmed_order_v1")];
    } catch (_) { /* Legacy confirmation never depends on browser receipt storage. */ }
    const state = resolveThankYouState(orderId, records);
    if (!state.durable) setVerification(null);
    const parsed = state.receipt;
    if (!parsed) {
      if (state.durable) setVerification("للتأكد من حالة الطلب تواصل معنا برقم الطلب. لا تعتمد على صفحة الشكر وحدها كإثبات للدفع.");
      return;
    }
    // Namespace, not a stale local flag, determines whether canonical payment verification applies.
    parsed.durable = state.durable;

    // ── حماية مزدوجة من تكرار Purchase ──────────────────────────────
    // الطبقة ١: sessionStorage — تمنع إعادة الإرسال طوال جلسة التاب الحالية
    //           (يبقى عند Refresh، يُمسح عند إغلاق التاب)
    // الطبقة ٢: orderId كـ event_id — Meta تُلغي التكرار تلقائياً
    //           إذا وصل نفس pixel_id + event_name + event_id في أقل من 48 ساعة
    if (!parsed.durable) setVerification(null);
    const purchaseGuardKey = `purchase_sent_${parsed.orderId}`;
    if (sessionStorage.getItem(purchaseGuardKey)) {
      // تم الإرسال من قبل في هذه الجلسة → أظهر البيانات فقط
      setOrderData(parsed);
      setVerification(null);
      return;
    }

    setOrderData(parsed);
    let cancelled = false;
    let timer;
    const attempt = async (remaining = 6) => {
      if (parsed.durable) {
        setVerification("جاري التحقق من حالة الطلب. لا تكرر الدفع.");
        try {
          const response = await fetch("/api/checkout-status", { method: "POST", signal: AbortSignal.timeout(10000),
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: parsed.orderId, quoteToken: parsed.quoteToken }) });
          const result = await response.json();
          if (cancelled) return;
          const confirmed = result.status === "paid" || (parsed.paymentMethod !== "card" && result.status === "confirmed");
          if (!response.ok || !confirmed) {
            setVerification("الطلب محفوظ وحالة الدفع لسه قيد التحقق. لو اتخصم المبلغ ما تدفعش تاني. تواصل معنا برقم الطلب.");
            if (remaining > 0) timer = setTimeout(() => attempt(remaining - 1), 5000);
            return;
          }
          parsed.total = result.total;
          if (Number.isSafeInteger(result.orderNumber) && result.orderNumber >= 1001) parsed.orderNumber = result.orderNumber;
          setOrderData({ ...parsed });
          setVerification(null);
          sessionStorage.setItem("wind_last_confirmed_order_v1", JSON.stringify(parsed));
          finishBrowserCheckoutAttempt(sessionStorage);
          sessionStorage.removeItem("wind_durable_request_v1");
        } catch (_) {
          if (!cancelled) setVerification("تعذر التحقق من حالة الطلب الآن. سلتك محفوظة. لا تكرر الدفع قبل التواصل معنا.");
          return;
        }
      } else {
        // Preserve legacy processing for orders created before the durable rollout.
        await fetch('/api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...parsed, paymentMethod: 'card_success' }) });
      }
      if (cancelled) return;
      clearCart();
      localStorage.removeItem('pendingOrder');

      // Include server-quoted automatic gifts as zero-value items in catalog
      // tracking, while keeping the purchase revenue equal to the amount paid.
      // Prefer server-quoted per-unit lines so free units carry zero item revenue.
      const purchaseLineItems = Array.isArray(parsed.lineItems) && parsed.lineItems.length
        ? parsed.lineItems
        : (parsed.cartItems || []).map((item) => ({
            productId: item.id,
            productHandle: item.handle || item.id,
            productTitle: item.title,
            price: item.price,
            quantity: item.qty,
            selectedColor: item.selectedColor,
          }));
      const purchaseContentIds = purchaseLineItems
        .filter(item => item.productHandle || item.productId)
        .map(item => getCatalogId(item.productHandle || item.productId, item.selectedColor));
      const purchaseContents = purchaseLineItems
        .filter(item => item.productHandle || item.productId)
        .map((item) => ({
          id: getCatalogId(item.productHandle || item.productId, item.selectedColor),
          quantity: Number(item.quantity) || 1,
          item_price: Number(item.price) || 0,
        }));
      const purchaseNumItems = purchaseLineItems.reduce(
        (sum, item) => sum + (Number(item.quantity) || 1),
        0
      );
      const purchaseItems = purchaseLineItems.map((item) => ({
        id: item.productHandle || item.productId || item.productTitle,
        title: item.productTitle || item.name,
        price: Number(item.price) || 0,
        qty: Number(item.quantity) || 1,
      }));

      // ضع العلامة قبل fbTrack — حتى لو fbTrack فشل لا نُعيد الإرسال
      sessionStorage.setItem(purchaseGuardKey, '1');

      fbTrack("Purchase", {
        event_id: `Purchase-${parsed.orderId}`,   // ثابت → Meta تُلغي التكرار
        value: parsed.total || 0,
        currency: "EGP",
        content_ids: purchaseContentIds,
        content_type: "product",
        contents: purchaseContents,
        num_items: purchaseNumItems,
        order_id: parsed.orderId || "",
        ...buildCheckoutMetaUserData(parsed.formData, {
          email: parsed.customerEmail,
          phone: parsed.phone,
        }),
      });
      // TikTok — مستقل تمامًا عن fbTrack أعلاه، بنفس فلسفة event_id المبني
      // على order_id (يُبنى داخل ttTrack.js نفسها، وليس مُستوردًا من هنا).
      ttTrack("CompletePayment", {
        value: parsed.total || 0,
        currency: "EGP",
        content_ids: purchaseContentIds,
        num_items: purchaseNumItems,
        order_id: parsed.orderId || "",
        ...buildTtUserData(parsed.formData, {
          email: parsed.customerEmail,
          phone: parsed.phone,
        }),
      });
      gaPurchase(parsed.orderId || "", purchaseItems, parsed.total || 0);
    };
    attempt().catch(() => { if (!cancelled) setVerification("تعذر التحقق من الطلب. تواصل معنا قبل تكرار الدفع."); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [statusRefresh]);

  // Signal readiness for GlobalLoader (thank you page is ready immediately)
  useEffect(() => {
    signalPageReady();
  }, [pathname, signalPageReady]);

  if (verification) return (
    <div className="w-full max-w-md m-5 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-right" dir="rtl">
      <h1 className="text-xl font-bold text-amber-950 mb-3">التحقق من الطلب</h1>
      {(orderId || orderData?.orderId) && <p className="text-xs font-mono break-all mb-3">{orderDisplayLabel(orderData, orderId)}</p>}
      <p role="status" className="text-sm leading-7 text-amber-950">{verification}</p>
      <button type="button" onClick={() => setStatusRefresh(value => value + 1)} className="mt-4 rounded-lg bg-amber-950 px-4 py-3 text-white font-bold text-sm">تحقق مرة أخرى</button>
      <div className="mt-5 text-sm"><Link href="/contact" className="underline">تواصل معنا لمراجعة حالة الطلب</Link></div>
    </div>
  );
  const view = mergeDisplayOrder(orderData, displayRecord);
  const method = knownPaymentMethod(view?.paymentMethod);
  const paymentInfo = method ? PAYMENT_LABELS[method] : null;
  const label = orderDisplayLabel(view, orderId);
  const shownLabel = label.startsWith("#") ? label : `#${label}`;
  const form = view?.formData || null;
  const items = Array.isArray(view?.lineItems) && view.lineItems.length ? view.lineItems : [];
  const discount = Number(view?.discount) || 0;
  const hasShipping = view?.shipping !== undefined && view?.shipping !== null && view?.shipping !== "";
  const shippingValue = Number(view?.shipping) || 0;
  const firstName = form?.firstName || "";
  const addressLines = form ? [
    `${form.firstName || ""} ${form.lastName || ""}`.trim(),
    form.address,
    [form.city, form.governorate].filter(Boolean).join("، "),
    form.phone,
  ].filter(Boolean) : [];

  const ACCENT = "#3a76b5";
  const Field = ({ title, children }) => (
    <div className="mb-5">
      <p className="text-sm font-bold text-[#333] mb-1.5">{title}</p>
      <div className="text-sm text-[#545454] leading-7">{children}</div>
    </div>
  );
  const subtotalShown = view?.subtotal !== undefined && view?.subtotal !== null && view?.subtotal !== "";

  return (
    <div className="w-full bg-white lg:bg-[linear-gradient(to_right,#ffffff_50%,#fafafa_50%)] text-[#333]">
      <div dir="ltr" className="mx-auto max-w-[1100px] grid grid-cols-1 lg:grid-cols-2">

        {/* 1. Check + order number + thanks */}
        <header dir="rtl" className="px-5 pt-7 pb-4 lg:col-start-1 lg:pt-14 lg:pl-8 lg:pr-12">
          <p className="text-2xl font-normal text-[#333] mb-6">WIND <span className="text-[#737373]">Shopping</span></p>
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 shrink-0 rounded-full border-2 flex items-center justify-center" style={{ borderColor: ACCENT, color: ACCENT }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <div className="min-w-0">
              {(orderId || orderData?.orderId) && (
                <p className="text-sm text-[#545454]">طلب <bdi dir="ltr" className="font-mono">{shownLabel}</bdi></p>
              )}
              <h1 className="text-2xl text-[#333] leading-snug">{firstName ? `شكراً يا ${firstName}!` : "شكراً لثقتك بنا!"}</h1>
            </div>
          </div>
        </header>

        {/* 2. Confirmed box */}
        <section dir="rtl" className="px-5 py-2 lg:col-start-1 lg:pl-8 lg:pr-12">
          <div className="rounded-lg border border-[#d9d9d9] p-4">
            <h2 className="text-base font-bold text-[#333] mb-1">تم تأكيد طلبك</h2>
            <p className="text-sm text-[#545454] leading-7">هتوصلك رسالة تأكيد على بريدك الإلكتروني قريباً.</p>
          </div>
        </section>

        {/* 3. Order summary: stacked on phones, right column on desktop */}
        {(items.length > 0 || view?.total) && (
          <aside dir="rtl" className="mt-4 lg:mt-0 bg-[#fafafa] border-y border-[#e1e1e1] lg:border-y-0 lg:border-l px-5 py-6 lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:pt-14 lg:pr-8 lg:pl-12 lg:bg-transparent">
            {items.length > 0 && (
              <ul className="space-y-4 mb-5">
                {items.map((item, i) => {
                  const qty = Number(item.quantity) || 1;
                  const price = Number(item.price) || 0;
                  const meta = [item.selectedSize, item.selectedColor].filter(Boolean).join(" · ");
                  return (
                    <li key={i} className="flex items-center gap-3">
                      <div className="relative w-16 h-16 shrink-0 rounded-lg border border-[#d9d9d9] bg-white">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" loading="lazy" className="w-full h-full object-cover rounded-lg" />
                        ) : null}
                        <span className="absolute -top-2 -left-2 min-w-[22px] h-[22px] px-1 rounded-full bg-[#737373] text-white text-xs font-medium flex items-center justify-center">{qty}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#333] leading-snug">{item.productTitle || item.name}</p>
                        {meta && <p className="text-xs text-[#737373] mt-0.5">{meta}</p>}
                      </div>
                      <p className="text-sm text-[#333] shrink-0">{price === 0 ? "هدية" : formatMoney(price * qty)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-[#d9d9d9] pt-4 space-y-2 text-sm text-[#545454]">
              {subtotalShown && <div className="flex justify-between"><span>المجموع الفرعي</span><span className="text-[#333]">{formatMoney(view.subtotal)}</span></div>}
              {discount > 0 && <div className="flex justify-between"><span>الخصم</span><span className="text-[#333]">- {formatMoney(discount)}</span></div>}
              {hasShipping && <div className="flex justify-between"><span>الشحن</span><span className="text-[#333]">{shippingValue === 0 ? "مجاني" : formatMoney(shippingValue)}</span></div>}
            </div>
            {view?.total && (
              <div className="border-t border-[#d9d9d9] mt-4 pt-4 flex justify-between items-baseline">
                <span className="text-base text-[#333]">الإجمالي</span>
                <span className="flex items-baseline gap-2"><span className="text-xs text-[#737373]">EGP</span><span className="text-2xl text-[#333]">{formatMoney(view.total)}</span></span>
              </div>
            )}
          </aside>
        )}

        {/* 4. Customer information */}
        <section dir="rtl" className="px-5 py-2 lg:col-start-1 lg:pl-8 lg:pr-12">
          <div className="rounded-lg border border-[#d9d9d9] p-4 mt-2">
            <h2 className="text-base font-bold text-[#333] mb-4">معلومات العميل</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
              <div>
                {view?.customerEmail && <Field title="معلومات التواصل"><bdi dir="ltr">{view.customerEmail}</bdi></Field>}
                {addressLines.length > 0 && (
                  <Field title="عنوان الشحن">{addressLines.map((line, i) => <span key={i} className="block">{line}</span>)}</Field>
                )}
                <Field title="طريقة الشحن">شحن قياسي · ٣ - ٥ أيام عمل</Field>
              </div>
              <div>
                {paymentInfo && (
                  <Field title="طريقة الدفع"><span className="inline-flex items-center gap-2">{paymentInfo.icon}{paymentInfo.label}</span></Field>
                )}
                {addressLines.length > 0 && (
                  <Field title="عنوان الفاتورة">{addressLines.map((line, i) => <span key={i} className="block">{line}</span>)}</Field>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 5. Help + continue shopping */}
        <footer dir="rtl" className="px-5 pt-4 pb-10 lg:col-start-1 lg:pl-8 lg:pr-12 flex flex-col-reverse gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#545454] text-center sm:text-right">
            محتاج مساعدة؟{' '}
            <a href="https://wa.me/201026628476" target="_blank" rel="noreferrer" className="hover:underline" style={{ color: ACCENT }}>تواصل معنا</a>
          </p>
          <Link href="/" className="inline-flex items-center justify-center min-h-[52px] px-8 rounded-md text-white text-base font-medium" style={{ backgroundColor: ACCENT }}>
            متابعة التسوق
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div className="min-h-[70vh] w-full bg-white flex flex-col items-center justify-start" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif; }
      `}</style>
      <Suspense fallback={
        <div className="flex flex-col items-center gap-3 py-20">
          <div className="w-10 h-10 border-4 border-[#3a76b5] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#3a76b5] font-black animate-pulse">جاري تأكيد الطلب...</p>
        </div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
