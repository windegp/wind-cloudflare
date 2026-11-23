"use client";

import { useState } from "react";
import { CONTACT_TOPICS } from "@/lib/contactForm";

const field =
  "w-full bg-white border border-gray-300 rounded-[3px] px-4 py-3 text-[15px] text-[#1A1A1A] placeholder:text-gray-400 focus:outline-none focus:border-[#1A1A1A] focus:ring-1 focus:ring-[#1A1A1A] transition";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", topic: "order", message: "", website: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus("sent");
        setForm({ name: "", phone: "", email: "", topic: "order", message: "", website: "" });
      } else {
        setError(res.status === 429 ? "بعتّ رسايل كتير. استنى شوية وجرب تاني." : data.error || "حصلت مشكلة. حاول تاني.");
        setStatus("error");
      }
    } catch {
      setError("الاتصال بطيء أو فصل. حاول تاني.");
      setStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center py-10" role="status">
        <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-[#F5C518] flex items-center justify-center text-2xl text-[#1A1A1A] font-black">✓</div>
        <h3 className="text-xl font-black text-[#1A1A1A] mb-2">وصلتنا رسالتك</h3>
        <p className="text-gray-600 mb-6">هنرد عليك على بريدك أو رقمك في أقرب وقت.</p>
        <button type="button" onClick={() => setStatus("idle")} className="border border-[#1A1A1A] text-[#1A1A1A] px-6 py-2.5 rounded-[3px] font-bold hover:bg-[#1A1A1A] hover:text-white transition">
          إرسال رسالة تانية
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="block text-sm font-bold text-[#1A1A1A] mb-1.5">الاسم</span>
          <input className={field} value={form.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="name" placeholder="اسمك بالكامل" />
        </label>
        <label className="block">
          <span className="block text-sm font-bold text-[#1A1A1A] mb-1.5">رقم الموبايل</span>
          <input className={`${field} text-left`} dir="ltr" value={form.phone} onChange={set("phone")} required inputMode="tel" maxLength={25} autoComplete="tel" placeholder="01XXXXXXXXX" />
        </label>
      </div>
      <label className="block">
        <span className="block text-sm font-bold text-[#1A1A1A] mb-1.5">البريد الإلكتروني</span>
        <input className={`${field} text-left`} dir="ltr" type="email" value={form.email} onChange={set("email")} required maxLength={120} autoComplete="email" placeholder="name@example.com" />
      </label>
      <label className="block">
        <span className="block text-sm font-bold text-[#1A1A1A] mb-1.5">بتستفسر عن إيه؟</span>
        <select className={field} value={form.topic} onChange={set("topic")}>
          {Object.entries(CONTACT_TOPICS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-bold text-[#1A1A1A] mb-1.5">رسالتك</span>
        <textarea className={`${field} min-h-[140px] resize-y`} value={form.message} onChange={set("message")} required minLength={10} maxLength={2000} placeholder="اكتب استفسارك بالتفصيل (ولو عن طلب، اكتب رقمه)" />
      </label>

      {/* honeypot: hidden from people, bots tend to fill it */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
      </div>

      {status === "error" && (
        <p role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-[3px] p-3 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full bg-[#1A1A1A] text-white py-3.5 rounded-[3px] font-black text-base hover:bg-black transition disabled:opacity-60"
      >
        {status === "sending" ? "جاري الإرسال..." : "إرسال الرسالة"}
      </button>
    </form>
  );
}
