"use client";

import { useState } from "react";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

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
        body: JSON.stringify({ type: "subscribe", email, website }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus("sent");
        setEmail("");
      } else {
        setError(res.status === 429 ? "محاولات كتير. استنى شوية وجرب تاني." : data.error || "حصلت مشكلة. حاول تاني.");
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
      <p role="status" className="text-[#1A1A1A] font-bold bg-[#F5C518] rounded-[3px] px-4 py-3 text-center">
        تم اشتراكك. هتوصلك العروض والخصومات على بريدك.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          dir="ltr"
          required
          maxLength={120}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          aria-label="البريد الإلكتروني للاشتراك"
          className="flex-1 min-w-0 bg-white text-[#1A1A1A] rounded-[3px] px-4 py-3 text-left placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
        />
        <button type="submit" disabled={status === "sending"} className="bg-[#F5C518] text-[#1A1A1A] font-black px-7 py-3 rounded-[3px] hover:bg-[#ffd740] transition disabled:opacity-60">
          {status === "sending" ? "جاري الاشتراك..." : "اشترك الآن"}
        </button>
      </div>
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      {status === "error" && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    </form>
  );
}
