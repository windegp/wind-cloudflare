
"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDb } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore/lite";
import { ArrowRight, Package, User, MapPin, Printer, Phone } from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

const toAmount = (value) => {
  const parsed = Number(
    String(value ?? 0)
      .replace(/,/g, '')
      .replace(/[^\d.-]/g, '')
  );

  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) =>
  `${toAmount(value).toLocaleString('en-EG')} EGP`;

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textValue = String(value ?? '').trim();
    if (!textValue) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textValue);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textValue;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        const success = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (!success) throw new Error('Copy failed');
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error(`Unable to copy ${label}:`, error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'تم النسخ' : `نسخ ${label}`}
      aria-label={`نسخ ${label}`}
      className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      {copied ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="8" y="8" width="13" height="13" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </svg>
      )}
    </button>
  );
}

const formatDate = (value) => {
  if (!value) return 'غير مسجل';

  try {
    if (typeof value === 'string') return value;
    if (value?.toDate) return value.toDate().toLocaleString('ar-EG');

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('ar-EG');
  } catch {
    return String(value);
  }
};

const getPaymentStatus = (status) => {
  const value = String(status || '').toLowerCase();

  const statuses = {
    paid: ['مدفوع', 'bg-green-100 text-green-700 border-green-200'],
    pending: ['بانتظار الدفع', 'bg-orange-100 text-orange-700 border-orange-200'],
    pending_payment: ['بانتظار الدفع الإلكتروني', 'bg-blue-100 text-blue-700 border-blue-200'],
    abandoned: ['سلة متروكة', 'bg-gray-100 text-gray-600 border-gray-200'],
    refunded: ['تم رد المبلغ', 'bg-red-100 text-red-700 border-red-200'],
    partially_paid: ['مدفوع جزئياً', 'bg-blue-100 text-blue-700 border-blue-200'],
    voided: ['ملغي مالياً', 'bg-red-100 text-red-700 border-red-200'],
    authorized: ['تم اعتماد الدفع', 'bg-blue-100 text-blue-700 border-blue-200']
  };

  return statuses[value] || [
    status || 'غير مسجل',
    'bg-gray-100 text-gray-600 border-gray-200'
  ];
};

const getFulfillmentStatus = (status) => {
  const value = String(status || '').toLowerCase();

  const statuses = {
    fulfilled: ['تم التجهيز والشحن', 'bg-green-100 text-green-700 border-green-200'],
    unfulfilled: ['لم يتم التجهيز', 'bg-yellow-100 text-yellow-700 border-yellow-200'],
    partial: ['تجهيز جزئي', 'bg-blue-100 text-blue-700 border-blue-200'],
    partially_fulfilled: ['تجهيز جزئي', 'bg-blue-100 text-blue-700 border-blue-200']
  };

  return statuses[value] || [
    'حالة التجهيز غير مسجلة',
    'bg-gray-100 text-gray-600 border-gray-200'
  ];
};

const paymentMethodLabel = (method) => {
  const methods = {
    card: 'بطاقة ائتمان',
    cod: 'الدفع عند الاستلام',
    instapay: 'إنستا باي'
  };

  return methods[String(method || '').toLowerCase()] || method || 'غير مسجل';
};

export default function OrderDetailsPage() {
  const { id } = useParams();
  const router = useRouter();

  const [order, setOrder] = useState(null);
  const [productsList, setProductsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchOrderDetails();
  }, [id]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);

      const db = getDb();
      const decodedId = decodeURIComponent(String(id)).trim();

      // الحفاظ على طريقة تحديد معرف طلب WIND أو Shopify
      let orderIdToFetch = decodedId;

      if (
        !decodedId.startsWith('WIND') &&
        !decodedId.startsWith('DRAFT') &&
        !decodedId.startsWith('#')
      ) {
        orderIdToFetch = `#${decodedId}`;
      }

      // قراءة مستند الطلب مرة واحدة
      const docSnap = await getDoc(doc(db, "Orders", orderIdToFetch));

      if (!docSnap.exists()) {
        setOrder(null);
        setProductsList([]);
        return;
      }

      const orderData = docSnap.data();
      setOrder(orderData);

      const isWind = orderData.data_source === 'WIND_Web';
      const items = Array.isArray(orderData.lineItems)
        ? orderData.lineItems
        : [];

      if (isWind) {
        // بيانات WIND محفوظة بالفعل داخل الطلب
        // لا نحتاج إلى أي قراءة إضافية للمنتجات
        setProductsList(items);
        return;
      }

      // Shopify: استخدام الصور الموجودة داخل الطلب أولاً
      const itemsMissingImages = items.filter(item => !item.image);

      if (itemsMissingImages.length === 0) {
        setProductsList(items.map(item => ({
          ...item,
          baseName: String(item.name || item.title || '').split(' - ')[0].trim()
        })));
        return;
      }

      // الحفاظ على الاستعلام المجمع الحالي، بحد أقصى 10 أسماء
      const baseNames = [
        ...new Set(
          itemsMissingImages.map(item =>
            String(item.name || item.title || '').split(' - ')[0].trim()
          )
        )
      ].filter(Boolean);

      let imagesMap = {};

      if (baseNames.length > 0 && baseNames.length <= 10) {
        const pQ = query(
          collection(db, "products"),
          where("title", "in", baseNames)
        );

        const pSnap = await getDocs(pQ);

        pSnap.docs.forEach(d => {
          imagesMap[d.data().title] = d.data().images?.[0] || null;
        });
      }

      setProductsList(items.map(item => {
        const baseName = String(item.name || item.title || '')
          .split(' - ')[0]
          .trim();

        return {
          ...item,
          image: item.image || imagesMap[baseName] || null,
          baseName
        };
      }));

    } catch (error) {
      console.error('Error fetching order details:', error);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f6f7] flex items-center justify-center" dir="rtl">
        <p className="text-sm font-bold text-gray-500 animate-pulse">
          جاري تحميل تفاصيل الطلب...
        </p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f6f6f7] flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm">
          <Package size={36} className="mx-auto mb-4 text-gray-300" />
          <p className="font-bold text-gray-800 mb-4">الطلب غير موجود أو تعذر تحميله</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-blue-600 font-bold underline"
          >
            العودة
          </button>
        </div>
      </div>
    );
  }

  const isWind = order.data_source === 'WIND_Web';
  const isAbandoned = String(order['Financial Status'] || '').toLowerCase() === 'abandoned';

  const paymentStatus = getPaymentStatus(order['Financial Status']);

  const fulfillmentRaw =
    order['Fulfillment Status'] ||
    order.fulfillment_status ||
    order['Fulfillment'];

  const fulfillmentStatus = getFulfillmentStatus(fulfillmentRaw);

  const itemsSubtotal = order.Subtotal != null
    ? toAmount(order.Subtotal)
    : productsList.reduce(
        (sum, item) =>
          sum + toAmount(item.price) * (Number(item.quantity ?? item.qty) || 1),
        0
      );

  const shippingAmount = toAmount(order.Shipping);
  const totalAmount = toAmount(order.Total);

  const originalSubtotal = order['Original Subtotal'] != null
    ? toAmount(order['Original Subtotal'])
    : productsList.reduce((sum, item) => {
        const price = toAmount(item.price);
        const comparePrice = toAmount(item.compareAtPrice);
        return sum + Math.max(price, comparePrice) *
          (Number(item.quantity ?? item.qty) || 1);
      }, 0);

  const productDiscount = order['Product Discount Total'] != null
    ? toAmount(order['Product Discount Total'])
    : productsList.reduce((sum, item) => {
        const price = toAmount(item.price);
        const comparePrice = toAmount(item.compareAtPrice);
        return sum + Math.max(0, comparePrice - price) *
          (Number(item.quantity ?? item.qty) || 1);
      }, 0);

  const hasSavedDiscount =
    order['Discount Amount'] !== undefined &&
    order['Discount Amount'] !== null &&
    order['Discount Amount'] !== '';

  const discountAmount = hasSavedDiscount
    ? Math.max(0, toAmount(order['Discount Amount']))
    : Math.max(0, itemsSubtotal + shippingAmount - totalAmount);

  const discountLabel =
    order['Discount Label'] ||
    (
      hasSavedDiscount
        ? order['Discount Code']
          ? `كود الخصم ${order['Discount Code']}`
          : order['Discount Type'] === 'first_order'
            ? 'خصم الطلب الأول'
            : 'الخصم'
        : 'فرق حسابي تقديري'
    );

  const notes =
    order.Notes ||
    order.Note ||
    order.notes ||
    order.note ||
    '';

  const additionalDetails = [
    ['نوع تنفيذ الطلب', order['Order Fulfillment Type']],
    ['موقع تنفيذ الطلب', order['Order Location']],
    ['كود المنطقة', order['Order Location Zip']],
    ['موعد الطلب', order['Order Due Date']],
    ['وقت الطلب', order['Order Due Time']],
    ['تفاصيل إضافية', order['Order Additional Details']],
    ['الرمز البريدي', order['Shipping Zip']],
    ['الهاتف البديل', order['Alternate Phone']],
    ['كود الخصم', order['Discount Code']],
    ['مرجع الدفع', order['Payment Reference']]
  ].filter(([, value]) =>
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ''
  );

  const timelineEvents = [
    { label: 'تم إنشاء الطلب', date: order['Created at'] },
    { label: 'تاريخ الدفع', date: order['Paid at'] || order['Paid At'] },
    { label: 'تاريخ التجهيز', date: order['Fulfilled at'] || order['Fulfilled At'] },
    { label: 'تاريخ الإلغاء', date: order['Cancelled at'] || order['Cancelled At'] },
    { label: 'تاريخ رد المبلغ', date: order['Refunded at'] || order['Refunded At'] }
  ].filter(event => event.date);

  const customerName = order['Billing Name'] || 'عميل مجهول';
  const customerPhone = order.Phone || order['Shipping Phone'] || '';
  const alternatePhone = order['Alternate Phone'] || '';

  const shippingAddress = [
    order['Shipping Address1'],
    order['Shipping City'],
    order['Shipping Province'],
    order['Shipping Zip']
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#f6f6f7] py-5 px-3 sm:px-6 lg:px-8 font-sans" dir="rtl">
      <div className="max-w-[1400px] mx-auto">

        {/* رأس الطلب */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 shrink-0 bg-white border border-gray-200 rounded-xl flex items-center justify-center hover:bg-gray-50"
              title="العودة"
            >
              <ArrowRight size={19} />
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#202223]">
                  {order.Name || id}
                </h1>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${paymentStatus[1]}`}>
                  {paymentStatus[0]}
                </span>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${fulfillmentStatus[1]}`}>
                  {fulfillmentStatus[0]}
                </span>

                {isWind && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                    WIND Web
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-1">
                تاريخ الطلب: {formatDate(order['Created at'])}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <Printer size={16} />
              طباعة
            </button>
          </div>
        </div>

        {/* تنبيه السلة المتروكة */}
        {isAbandoned && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden mb-5">
            <div className="bg-amber-400 text-amber-950 px-4 py-2.5 font-black text-sm">
              هذا الطلب سلة متروكة
            </div>
            <div className="p-4 text-sm text-amber-900">
              لم يتم تأكيد الطلب كعملية شراء مكتملة حتى الآن.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">

          {/* العمود الرئيسي */}
          <main className="space-y-5 min-w-0">

            {/* التجهيز والمنتجات */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-black text-sm text-gray-900">
                    تجهيز الطلب
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-1">
                    المنتجات والكميات والأصناف المختارة
                  </p>
                </div>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${fulfillmentStatus[1]}`}>
                  {fulfillmentStatus[0]}
                </span>
              </div>

              <div className="p-4 sm:p-5">
                <div className="space-y-0">
                  {productsList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      لا توجد تفاصيل منتجات محفوظة لهذا الطلب.
                    </p>
                  ) : (
                    productsList.map((product, idx) => {
                      const quantity = Number(product.quantity ?? product.qty) || 1;
                      const price = toAmount(product.price);
                      const comparePrice = toAmount(product.compareAtPrice);
                      const productName =
                        product.productTitle ||
                        product.title ||
                        product.name ||
                        'منتج';

                      const variants = [
                        product.selectedColor ? `اللون: ${product.selectedColor}` : '',
                        product.selectedSize ? `المقاس: ${product.selectedSize}` : ''
                      ].filter(Boolean);

                      return (
                        <div
                          key={product.productId || product.id || `${productName}-${idx}`}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 border-b border-gray-100 last:border-0"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-16 h-16 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden shrink-0">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={productName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                  <Package size={22} />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 leading-relaxed">
                                {productName}
                              </p>

                              {variants.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {variants.join(' · ')}
                                </p>
                              )}

                              {!product.selectedColor && !product.selectedSize && product.name && product.name !== productName && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {product.name}
                                </p>
                              )}

                              <p className="text-xs text-gray-500 mt-1">
                                الكمية: <strong className="text-gray-800">{quantity}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="sm:text-left shrink-0">
                            {comparePrice > price && (
                              <p className="text-xs text-gray-400 line-through">
                                {money(comparePrice)}
                              </p>
                            )}

                            <p className="text-sm font-black text-gray-900">
                              {money(price)}
                            </p>

                            <p className="text-[11px] text-gray-500 mt-1">
                              الإجمالي: {money(price * quantity)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            {/* ملخص المدفوعات */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-black text-sm text-gray-900">
                  المدفوعات
                </h2>
                <p className="text-[11px] text-gray-500 mt-1">
                  ملخص المبالغ وحالة الدفع
                </p>
              </div>

              <div className="p-5 space-y-3">
                {originalSubtotal > itemsSubtotal && (
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-gray-500">السعر الأصلي للمنتجات</span>
                    <span className="font-medium text-gray-700">{money(originalSubtotal)}</span>
                  </div>
                )}

                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-500">إجمالي المنتجات</span>
                  <span className="font-medium text-gray-800">{money(itemsSubtotal)}</span>
                </div>

                {productDiscount > 0 && (
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-emerald-700">تخفيض أسعار المنتجات</span>
                    <span className="font-bold text-emerald-700">− {money(productDiscount)}</span>
                  </div>
                )}

                {discountAmount > 0 && (
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-red-600">{discountLabel}</span>
                    <span className="font-bold text-red-600">− {money(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-500">الشحن</span>
                  <span className="font-medium text-gray-800">
                    {shippingAmount === 0 ? 'مجاني' : money(shippingAmount)}
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-4 mt-2 flex justify-between items-center gap-4">
                  <span className="text-base font-black text-gray-900">الإجمالي</span>
                  <span className="text-xl font-black text-gray-900">{money(totalAmount)}</span>
                </div>

                <div className="border-t border-gray-100 pt-3 flex flex-wrap justify-between gap-3 text-xs">
                  <span className="text-gray-500">حالة الدفع</span>
                  <span className={`font-bold px-2.5 py-1 rounded-md border ${paymentStatus[1]}`}>
                    {paymentStatus[0]}
                  </span>
                </div>

                <div className="flex justify-between gap-4 text-xs">
                  <span className="text-gray-500">طريقة الدفع</span>
                  <span className="font-bold text-gray-800">
                    {paymentMethodLabel(order['Payment Method'])}
                  </span>
                </div>

                {order['Payment Reference'] && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-gray-500">مرجع الدفع</span>
                    <span className="font-mono text-gray-700 break-all">
                      {order['Payment Reference']}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* السجل الزمني */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-black text-sm text-gray-900">السجل الزمني</h2>
              </div>

              <div className="p-5">
                {timelineEvents.length > 0 ? (
                  <div className="relative space-y-5">
                    {timelineEvents.map((event, index) => (
                      <div key={`${event.label}-${index}`} className="flex gap-3 items-start">
                        <div className="w-3 h-3 mt-1 rounded-full bg-[#008060] ring-4 ring-green-50 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-gray-800">{event.label}</p>
                          <p className="text-xs text-gray-500 mt-1">{formatDate(event.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    لا توجد أحداث زمنية محفوظة لهذا الطلب.
                  </p>
                )}
              </div>
            </section>

          </main>

          {/* العمود الجانبي */}
          <aside className="space-y-5 min-w-0">

            {/* الملاحظات */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm p-5">
              <h2 className="font-black text-sm text-gray-900 mb-3">
                ملاحظات الطلب
              </h2>

              {notes ? (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {String(notes)}
                </p>
              ) : (
                <p className="text-xs text-gray-400">
                  لا توجد ملاحظات محفوظة لهذا الطلب.
                </p>
              )}
            </section>

            {/* التفاصيل الإضافية */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm p-5">
              <h2 className="font-black text-sm text-gray-900 mb-4">
                تفاصيل إضافية
              </h2>

              {additionalDetails.length > 0 ? (
                <div className="space-y-3">
                  {additionalDetails.map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                      <p className="text-xs font-bold text-gray-800 break-words">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  لا توجد تفاصيل إضافية محفوظة.
                </p>
              )}
            </section>

            {/* العميل */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm p-5">
              <h2 className="font-black text-sm text-gray-900 mb-4 flex items-center gap-2">
                <User size={15} />
                العميل
              </h2>

                            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-sm font-black text-blue-700">
                  {customerName}
                </p>
                <CopyButton value={customerName} label="اسم العميل" />
              </div>

              <div className="space-y-3">
                                <div>
                  <p className="text-[11px] text-gray-500 mb-1">البريد الإلكتروني</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-800 break-all" dir="ltr">
                      {order.Email || 'غير مسجل'}
                    </p>
                    {order.Email && (
                      <CopyButton value={order.Email} label="البريد الإلكتروني" />
                    )}
                  </div>
                </div>

                                <div>
                  <p className="text-[11px] text-gray-500 mb-1">رقم الهاتف</p>
                  <div className="flex items-center justify-between gap-2">
                    {customerPhone ? (
                      <a
                        href={`tel:${String(customerPhone).replace(/[^\d+]/g, '')}`}
                        className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1.5"
                        dir="ltr"
                      >
                        <Phone size={13} />
                        {customerPhone}
                      </a>
                    ) : (
                      <p className="text-xs text-gray-400">غير مسجل</p>
                    )}

                    {customerPhone && (
                      <CopyButton value={customerPhone} label="رقم الهاتف" />
                    )}
                  </div>
                </div>

                                {alternatePhone && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">الهاتف البديل</p>
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={`tel:${String(alternatePhone).replace(/[^\d+]/g, '')}`}
                        className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1.5"
                        dir="ltr"
                      >
                        <Phone size={13} />
                        {alternatePhone}
                      </a>
                      <CopyButton value={alternatePhone} label="الهاتف البديل" />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* عنوان الشحن */}
            <section className="bg-white border border-[#e1e3e5] rounded-xl shadow-sm p-5">
              <h2 className="font-black text-sm text-gray-900 mb-4 flex items-center gap-2">
                <MapPin size={15} />
                عنوان الشحن
              </h2>

                            {shippingAddress.length > 0 ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2 text-xs text-gray-700 leading-relaxed flex-1 min-w-0">
                    {shippingAddress.map((part, index) => (
                      <p key={index}>{part}</p>
                    ))}
                  </div>

                  <CopyButton
                    value={shippingAddress.join('، ')}
                    label="عنوان الشحن"
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-400">لا يوجد عنوان شحن مسجل.</p>
              )}

                            {customerPhone && (
                <a
                  href={`tel:${String(customerPhone).replace(/[^\d+]/g, '')}`}
                  className="text-xs text-blue-700 font-bold mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 hover:underline"
                  dir="ltr"
                >
                  <Phone size={13} />
                  {customerPhone}
                </a>
              )}
            </section>

          </aside>
        </div>
      </div>
    </div>
  );
}
