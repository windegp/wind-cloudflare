"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STEPS = ["تم استلام الطلب", "جاري التجهيز", "تم الشحن"];

export default function TrackOrderForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);

  // Prefill the order number from the email link (?order=1001). Phone is never prefilled.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("order");
    if (q) setOrderNumber(q.slice(0, 43));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setOrder(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, phone }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.found) setOrder(data.order);
      else if (res.status === 429) setError("محاولات كتير. استنى شوية وجرب تاني.");
      else setError(data.message || "حصلت مشكلة. حاول تاني.");
    } catch {
      setError("الاتصال بطيء أو فصل. حاول تاني.");
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-bold mb-1">رقم الطلب</span>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="#1001 أو WIND-12345-AB"
            dir="ltr"
            required
            maxLength={43}
            className="w-full border border-gray-300 rounded-[3px] px-3 py-2.5 text-left"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-bold mb-1">رقم الموبايل</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            dir="ltr"
            required
            maxLength={30}
            className="w-full border border-gray-300 rounded-[3px] px-3 py-2.5 text-left"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1A1A1A] text-white py-3 rounded-[3px] font-bold disabled:opacity-60"
        >
          {loading ? "جاري البحث..." : "تتبع الطلب"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-6 text-red-700 bg-red-50 border border-red-200 rounded-[3px] p-3 text-sm">
          {error}
        </p>
      )}

      {order && (
        <section className="mt-8 border border-gray-200 rounded-[3px] p-5" aria-live="polite">
          <p className="text-sm text-gray-500 mb-1">طلب رقم</p>
          <p className="font-black text-lg mb-5" dir="ltr" style={{ textAlign: "right" }}>{order.orderNumber}</p>

          {order.stage === 0 ? (
            <p className="font-bold text-red-700 mb-5">الطلب ده اتلغى.</p>
          ) : (
            <ol className="flex items-start mb-6">
              {STEPS.map((label, i) => {
                const done = order.stage >= i + 1;
                return (
                  <li key={label} className="flex-1 text-center">
                    <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${done ? "bg-[#1A1A1A] text-white" : "bg-gray-200 text-gray-500"}`}>
                      {i + 1}
                    </div>
                    <p className={`mt-2 text-xs ${done ? "font-bold text-[#1A1A1A]" : "text-gray-500"}`}>{label}</p>
                  </li>
                );
              })}
            </ol>
          )}

          <dl className="text-sm space-y-2 mb-5">
            {order.createdAt && <div className="flex justify-between"><dt className="text-gray-500">تاريخ الطلب</dt><dd>{order.createdAt}</dd></div>}
            {order.paymentMethod && <div className="flex justify-between"><dt className="text-gray-500">طريقة الدفع</dt><dd>{order.paymentMethod}</dd></div>}
            {order.paymentStatus && <div className="flex justify-between"><dt className="text-gray-500">حالة الدفع</dt><dd>{order.paymentStatus}</dd></div>}
            {order.city && <div className="flex justify-between"><dt className="text-gray-500">المدينة</dt><dd>{order.city}</dd></div>}
            <div className="flex justify-between font-bold"><dt>الإجمالي</dt><dd>{order.total} {order.currency === "EGP" ? "ج.م" : order.currency}</dd></div>
          </dl>

          {order.items.length > 0 && (
            <ul className="border-t border-gray-100 pt-4 space-y-2 text-sm">
              {order.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{it.title}{(it.size || it.color) ? ` (${[it.color, it.size].filter(Boolean).join(" / ")})` : ""}</span>
                  <span className="text-gray-500 shrink-0">×{it.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-8 text-sm text-gray-500">
        محتاج مساعدة؟ <Link href="/contact-us" className="underline font-bold text-[#1A1A1A]">تواصل معانا</Link>
      </p>
    </div>
  );
}
