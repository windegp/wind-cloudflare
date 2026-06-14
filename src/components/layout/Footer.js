"use client";
import Link from "next/link";
import { useState } from "react";

export default function Footer() {
  const [openSection, setOpenSection] = useState(null);
  const [email, setEmail] = useState("");

  const toggle = (key) => setOpenSection((prev) => (prev === key ? null : key));

  const quickLinks = [
    { label: "الرئيسية", href: "/" },
    { label: "المنتجات", href: "/collections/shop-all" },
    { label: "العروض", href: "/collections/sale" },
    { label: "تتبع طلبك", href: "/track-order" },
  ];

  const policies = [
    { label: "سياسة الشحن والتوصيل", href: "/policies/shipping-policy" },
    { label: "الاسترجاع والاستبدال", href: "/policies/refund-policy" },
    { label: "الشروط والأحكام", href: "/policies/terms-of-service" },
    { label: "سياسة الخصوصية", href: "/policies/privacy-policy" },
  ];

  const socials = [
    {
      label: "Instagram",
      href: "https://www.instagram.com/windshoping",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
    {
      label: "TikTok",
      href: "https://www.tiktok.com/@windshopping",
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
        </svg>
      ),
    },
    {
      label: "Facebook",
      href: "https://www.facebook.com/WIND.EGY/",
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      ),
    },
    {
      label: "WhatsApp",
      href: "https://wa.me/201055737110",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
  ];

  const sections = [
    { key: "quick", label: "روابط سريعة", links: quickLinks },
    { key: "policies", label: "سياساتنا", links: policies },
  ];

  return (
    <footer className="footer-root" dir="rtl">

      {/* ── Newsletter ── */}
      <div className="newsletter-bar">
        <div className="newsletter-inner">
          <div className="nl-text">
            <p className="nl-title">تواصل معنا</p>
            <p className="nl-sub">اشترك في القائمة واحصل على خصم 10% على أول طلب</p>
          </div>
          <div className="nl-form">
            <input
              type="email"
              className="nl-input"
              placeholder="أدخل بريدك الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="nl-btn">اشترك الآن</button>
          </div>
        </div>
      </div>

      {/* ── Desktop body ── */}
      <div className="footer-desktop">
        <div className="footer-inner">

          {/* Brand col */}
          <div className="col-brand">
            <p className="footer-logo">WIND</p>
            <p className="footer-tagline">
              ملابس أصلية بتصاميم مختلفة<br />من القاهرة للعالم.
            </p>
            <div className="social-row">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="soc-btn" aria-label={s.label}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="col-links">
            <p className="col-label">روابط سريعة</p>
            {quickLinks.map((l) => (
              <Link key={l.label} href={l.href} className="footer-link">{l.label}</Link>
            ))}
          </div>

          {/* Policies */}
          <div className="col-links">
            <p className="col-label">سياساتنا</p>
            {policies.map((l) => (
              <Link key={l.label} href={l.href} className="footer-link">{l.label}</Link>
            ))}
          </div>

        </div>

        <div className="footer-bottom desktop-bottom">
          <p className="copy">© {new Date().getFullYear()} WIND Shopping. جميع الحقوق محفوظة.</p>
          <div className="pay-row">
            <span className="pay-badge">VISA</span>
            <span className="pay-badge">MASTERCARD</span>
            <span className="pay-badge">INSTAPAY</span>
          </div>
        </div>
      </div>

      {/* ── Mobile body ── */}
      <div className="footer-mobile">

        {/* Brand */}
        <div className="mob-brand">
          <p className="footer-logo">WIND</p>
          <p className="footer-tagline">ملابس أصلية بتصاميم مختلفة — من القاهرة للعالم.</p>
          <div className="social-row">
            {socials.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="soc-btn" aria-label={s.label}>
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Accordion sections */}
        {sections.map(({ key, label, links }) => (
          <div key={key} className="accordion-item">
            <button className="accordion-trigger" onClick={() => toggle(key)} aria-expanded={openSection === key}>
              <span>{label}</span>
              <svg
                className={`chevron ${openSection === key ? "open" : ""}`}
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {openSection === key && (
              <div className="accordion-body">
                {links.map((l) => (
                  <Link key={l.label} href={l.href} className="footer-link mob-link">{l.label}</Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Mobile bottom */}
        <div className="footer-bottom mob-bottom">
          <p className="copy">© {new Date().getFullYear()} WIND Shopping</p>
          <div className="pay-row">
            <span className="pay-badge">VISA</span>
            <span className="pay-badge">MASTERCARD</span>
            <span className="pay-badge">INSTAPAY</span>
          </div>
        </div>

      </div>

      <style jsx>{`
        /* ─── ROOT ─── */
        .footer-root {
          background: #fff;
          color: #111;
          font-family: 'Cairo', 'Tajawal', sans-serif;
          border-top: 1px solid #e5e5e5;
        }

        /* ─── NEWSLETTER ─── */
        .newsletter-bar {
          background: #fff;
          border-bottom: 1px solid #e5e5e5;
          padding: 40px 48px;
        }
        .newsletter-inner {
          max-width: 1440px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          flex-wrap: wrap;
        }
        .nl-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 4px;
          color: #111;
        }
        .nl-sub {
          font-size: 13px;
          color: #666;
          margin: 0;
        }
        .nl-form {
          display: flex;
          gap: 0;
          flex-shrink: 0;
        }
        .nl-input {
          border: 1px solid #ccc;
          border-left: none;
          padding: 10px 16px;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          width: 260px;
          color: #111;
          background: #fff;
          direction: rtl;
        }
        .nl-input:focus { border-color: #111; }
        .nl-btn {
          background: #111;
          color: #fff;
          border: none;
          padding: 10px 22px;
          font-size: 13px;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }
        .nl-btn:hover { background: #333; }

        /* ─── DESKTOP ─── */
        .footer-desktop { display: none; }
        @media (min-width: 1024px) {
          .footer-desktop { display: block; }
          .footer-mobile  { display: none; }
          .newsletter-bar { padding: 40px 48px; }
        }

        .footer-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 48px 48px 36px;
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr;
          gap: 48px;
        }

        .footer-logo {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #111;
          margin: 0 0 10px;
        }

        .footer-tagline {
          font-size: 12px;
          color: #888;
          line-height: 1.9;
          margin: 0 0 20px;
        }

        .social-row { display: flex; gap: 8px; }

        .soc-btn {
          width: 34px;
          height: 34px;
          border: 1px solid #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s;
        }
        .soc-btn:hover {
          border-color: #111;
          color: #111;
        }

        .col-label {
          font-size: 11px;
          color: #999;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin: 0 0 14px;
          font-weight: 600;
        }

        .footer-link {
          display: block;
          font-size: 13px;
          color: #444;
          text-decoration: none;
          padding: 5px 0;
          transition: color 0.15s;
        }
        .footer-link:hover { color: #111; }

        /* ─── BOTTOM BAR ─── */
        .footer-bottom {
          border-top: 1px solid #e5e5e5;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .desktop-bottom { padding: 14px 48px; }

        .copy {
          font-size: 11px;
          color: #aaa;
          margin: 0;
        }

        .pay-row { display: flex; gap: 8px; align-items: center; }
        .pay-badge {
          font-size: 9px;
          border: 1px solid #ddd;
          padding: 3px 8px;
          color: #888;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        /* ─── MOBILE ─── */
        .footer-mobile { display: block; }

        .mob-brand {
          padding: 28px 20px 24px;
          border-bottom: 1px solid #e5e5e5;
        }

        /* Accordion */
        .accordion-item {
          border-bottom: 1px solid #e5e5e5;
        }
        .accordion-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: none;
          border: none;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          color: #111;
          cursor: pointer;
          text-align: right;
        }
        .chevron {
          transition: transform 0.2s;
          flex-shrink: 0;
        }
        .chevron.open { transform: rotate(180deg); }

        .accordion-body {
          padding: 0 20px 16px;
        }
        .mob-link {
          padding: 7px 0;
          font-size: 13px;
          color: #555;
        }

        .mob-bottom {
          padding: 14px 20px;
          flex-direction: row-reverse;
        }

        /* Newsletter mobile */
        @media (max-width: 1023px) {
          .newsletter-bar { padding: 28px 20px; }
          .newsletter-inner { flex-direction: column; align-items: flex-start; gap: 16px; }
          .nl-form { width: 100%; }
          .nl-input { flex: 1; min-width: 0; width: auto; border-left: 1px solid #ccc; }
          .nl-btn { }
        }
      `}</style>
    </footer>
  );
}