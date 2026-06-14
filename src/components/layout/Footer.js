"use client";
import Link from "next/link";
import { useState } from "react";

const paymentIcons = [
  { name: "Mastercard", url: "https://ik.imagekit.io/windeg/WIND_Shopping/mastercard.svg" },
  { name: "Visa",       url: "https://ik.imagekit.io/windeg/WIND_Shopping/visa.svg" },
  { name: "Meeza",      url: "https://ik.imagekit.io/windeg/WIND_Shopping/Meeza.svg" },
  { name: "American Express", url: "https://ik.imagekit.io/windeg/WIND_Shopping/amex-svgrepo-com.svg" },
];

const quickLinks = [
  { label: "الرئيسية",   href: "/" },
  { label: "المنتجات",   href: "/collections/shop-all" },
  { label: "العروض",     href: "/collections/sale" },
  { label: "تتبع طلبك", href: "/track-order" },
];

const policies = [
  { label: "سياسة الشحن والتوصيل", href: "/policies/shipping-policy" },
  { label: "الاسترجاع والاستبدال",  href: "/policies/refund-policy" },
  { label: "الشروط والأحكام",       href: "/policies/terms-of-service" },
  { label: "سياسة الخصوصية",        href: "/policies/privacy-policy" },
];

const socials = [
  { label: "Instagram", href: "https://www.instagram.com/windshoping",      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg> },
  { label: "TikTok",    href: "https://www.tiktok.com/@windshopping",        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg> },
  { label: "Facebook",  href: "https://www.facebook.com/WIND.EGY/",          icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> },
  { label: "WhatsApp",  href: "https://wa.me/201055737110",                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> },
];

function NewsletterBlock() {
  const [email, setEmail] = useState("");
  return (
    <div className="nl-wrap">
      <p className="nl-title">اشترك واحصل على خصم 10%</p>
      <p className="nl-sub">على أول طلب</p>
      <div className="nl-input-row">
        <svg className="nl-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="3"/><polyline points="2,4 12,13 22,4"/>
        </svg>
        <input
          type="email"
          className="nl-input"
          placeholder="بريدك الإلكتروني"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className="nl-btn">اشترك الآن</button>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="f-root" dir="rtl">

      {/* ══════════ DESKTOP ══════════ */}
      <div className="f-desktop">
        <div className="f-inner">

          {/* col 1: newsletter */}
          <div className="col-nl">
            <NewsletterBlock />
          </div>

          {/* col 2: social + tagline */}
          <div className="col-brand">
            <div className="soc-row">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="soc-btn" aria-label={s.label}>
                  {s.icon}
                </a>
              ))}
            </div>
            <p className="f-tagline">ملابس أصلية بتصاميم مختلفة<br />من القاهرة للعالم.</p>
          </div>

          {/* col 3: quick links */}
          <div className="col-links">
            <p className="col-label">روابط سريعة</p>
            {quickLinks.map((l) => (
              <Link key={l.label} href={l.href} className="f-link">{l.label}</Link>
            ))}
          </div>

          {/* col 4: policies */}
          <div className="col-links">
            <p className="col-label">سياساتنا</p>
            {policies.map((l) => (
              <Link key={l.label} href={l.href} className="f-link">{l.label}</Link>
            ))}
          </div>

        </div>

        {/* bottom bar */}
        <div className="f-bottom">
          <div className="pay-row">
            {paymentIcons.map((p) => (
              <img key={p.name} src={p.url} alt={p.name} className="pay-icon" />
            ))}
          </div>
          <p className="copy">© {new Date().getFullYear()} WIND Shopping. جميع الحقوق محفوظة.</p>
        </div>
      </div>

      {/* ══════════ MOBILE ══════════ */}
      <div className="f-mobile">

        {/* newsletter */}
        <div className="mob-nl">
          <NewsletterBlock />
        </div>

        {/* social + links */}
        <div className="mob-body">
          <div className="soc-row mob-soc">
            {socials.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="soc-btn" aria-label={s.label}>
                {s.icon}
              </a>
            ))}
          </div>

          <div className="mob-cols">
            <div className="mob-col">
              <p className="col-label">روابط سريعة</p>
              {quickLinks.map((l) => (
                <Link key={l.label} href={l.href} className="f-link">{l.label}</Link>
              ))}
            </div>
            <div className="mob-col">
              <p className="col-label">سياساتنا</p>
              {policies.map((l) => (
                <Link key={l.label} href={l.href} className="f-link">{l.label}</Link>
              ))}
            </div>
          </div>
        </div>

        {/* bottom bar */}
        <div className="f-bottom mob-bottom">
          <div className="pay-row">
            {paymentIcons.map((p) => (
              <img key={p.name} src={p.url} alt={p.name} className="pay-icon" />
            ))}
          </div>
          <p className="copy">© {new Date().getFullYear()} WIND Shopping</p>
        </div>

      </div>

      <style jsx>{`
        /* ─── ROOT ─── */
        .f-root {
          background: #F3F4F6;
          color: #111;
          font-family: 'Cairo', 'Tajawal', sans-serif;
        }

        /* ─── NEWSLETTER ─── */
        .nl-wrap {
          width: 100%;
        }
        .nl-title {
          font-size: 15px;
          font-weight: 700;
          color: #111;
          margin: 0 0 4px;
        }
        .nl-sub {
          font-size: 12px;
          color: #888;
          margin: 0 0 14px;
        }
        .nl-input-row {
          display: flex;
          align-items: center;
          background: #fff;
          border-radius: 10px;
          padding: 0 14px;
          gap: 8px;
          width: 100%;
          box-sizing: border-box;
        }
        .nl-icon {
          color: #bbb;
          flex-shrink: 0;
        }
        .nl-input {
          flex: 1;
          border: none;
          outline: none;
          font-family: inherit;
          font-size: 13px;
          color: #333;
          background: transparent;
          padding: 11px 0;
          direction: rtl;
        }
        .nl-input::placeholder { color: #bbb; }
        /* subscribe button: starts from right, ~half width */
        .nl-btn {
          display: block;
          width: 50%;
          margin-top: 10px;
          margin-right: 0;
          margin-left: auto;
          background: #111;
          color: #fff;
          border: none;
          padding: 11px 0;
          font-size: 13px;
          font-family: inherit;
          font-weight: 700;
          cursor: pointer;
          border-radius: 10px;
          text-align: center;
          transition: background 0.2s;
        }
        .nl-btn:hover { background: #333; }

        /* ─── SOCIAL ─── */
        .soc-row {
          display: flex;
          gap: 8px;
        }
        .soc-btn {
          width: 34px;
          height: 34px;
          background: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
          text-decoration: none;
          transition: color 0.2s, background 0.2s;
        }
        .soc-btn:hover {
          background: #111;
          color: #fff;
        }

        /* ─── LINKS ─── */
        .col-label {
          font-size: 10px;
          color: #bbb;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          margin: 0 0 12px;
          font-weight: 600;
        }
        .f-link {
          display: block;
          font-size: 13px;
          color: #555;
          text-decoration: none;
          padding: 5px 0;
          transition: color 0.15s;
        }
        .f-link:hover { color: #111; }

        /* ─── TAGLINE ─── */
        .f-tagline {
          font-size: 12px;
          color: #999;
          line-height: 1.8;
          margin: 14px 0 0;
        }

        /* ─── BOTTOM BAR ─── */
        .f-bottom {
          background: #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 40px;
        }
        .pay-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pay-icon {
          height: 20px;
          opacity: 0.55;
        }
        .copy {
          font-size: 11px;
          color: #aaa;
          margin: 0;
        }

        /* ─── DESKTOP ─── */
        .f-desktop { display: none; }

        @media (min-width: 1024px) {
          .f-desktop { display: block; }
          .f-mobile  { display: none; }
        }

        .f-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 52px 40px 44px;
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1fr;
          gap: 40px;
          align-items: start;
        }

        .col-nl { }
        .col-brand { }
        .col-links { }

        /* ─── MOBILE ─── */
        .f-mobile { display: block; }

        .mob-nl {
          padding: 28px 20px 24px;
          background: #F3F4F6;
        }

        .mob-body {
          background: #F3F4F6;
          padding: 20px 20px 24px;
        }

        .mob-soc {
          margin-bottom: 20px;
        }

        .mob-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 16px;
        }

        .mob-col { }

        .mob-bottom {
          padding: 12px 20px;
        }

        .pay-icon {
          height: 16px;
        }

        @media (min-width: 1024px) {
          .pay-icon { height: 20px; }
        }
      `}</style>
    </footer>
  );
}