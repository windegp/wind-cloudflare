import Link from "next/link";

export default function Footer() {
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
          <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
        </svg>
      ),
    },
    {
      label: "TikTok",
      href: "https://www.tiktok.com/@windshopping",
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
        </svg>
      ),
    },
    {
      label: "Facebook",
      href: "https://www.facebook.com/WIND.EGY/",
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
        </svg>
      ),
    },
    {
      label: "WhatsApp",
      href: "https://wa.me/201055737110",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      ),
    },
  ];

  return (
    <footer className="footer-root" dir="rtl">

      {/* ===== DESKTOP ===== */}
      <div className="footer-desktop">
        <div className="footer-inner">

          {/* العمود الأول: الشعار + وصف + سوشيال */}
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

          {/* العمود الثاني: روابط سريعة */}
          <div className="col-links">
            <p className="col-label">روابط سريعة</p>
            {quickLinks.map((l) => (
              <Link key={l.label} href={l.href} className="footer-link">{l.label}</Link>
            ))}
          </div>

          {/* العمود الثالث: السياسات */}
          <div className="col-links">
            <p className="col-label">سياساتنا</p>
            {policies.map((l) => (
              <Link key={l.label} href={l.href} className="footer-link">{l.label}</Link>
            ))}
          </div>

        </div>

        {/* بار الأسفل */}
        <div className="footer-bottom">
          <p className="copy">© {new Date().getFullYear()} WIND Shopping. جميع الحقوق محفوظة.</p>
          <div className="pay-row">
            <span className="pay-badge">VISA</span>
            <span className="pay-badge">MASTERCARD</span>
            <span className="pay-badge">INSTAPAY</span>
          </div>
        </div>
      </div>

      {/* ===== MOBILE ===== */}
      <div className="footer-mobile">

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

        <div className="mob-cols">
          <div className="mob-col">
            <p className="col-label">روابط سريعة</p>
            {quickLinks.map((l) => (
              <Link key={l.label} href={l.href} className="footer-link">{l.label}</Link>
            ))}
          </div>
          <div className="mob-col">
            <p className="col-label">سياساتنا</p>
            {policies.map((l) => (
              <Link key={l.label} href={l.href} className="footer-link">{l.label}</Link>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <div className="pay-row">
            <span className="pay-badge">VISA</span>
            <span className="pay-badge">MASTERCARD</span>
            <span className="pay-badge">INSTAPAY</span>
          </div>
          <p className="copy">© {new Date().getFullYear()} WIND Shopping</p>
        </div>

      </div>

      <style jsx>{`
        .footer-root {
          background: #111;
          color: #fff;
          font-family: 'Cairo', 'Tajawal', sans-serif;
        }

        /* ── DESKTOP ── */
        .footer-desktop { display: none; }
        @media (min-width: 1024px) {
          .footer-desktop { display: block; }
          .footer-mobile  { display: none; }
        }

        .footer-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 56px 48px 40px;
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr;
          gap: 48px;
        }

        .footer-logo {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #fff;
          margin: 0 0 10px;
        }

        .footer-tagline {
          font-size: 12px;
          color: rgba(255,255,255,0.38);
          line-height: 1.8;
          margin: 0 0 24px;
        }

        .social-row {
          display: flex;
          gap: 10px;
        }

        .soc-btn {
          width: 36px;
          height: 36px;
          border: 0.5px solid rgba(255,255,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s;
        }
        .soc-btn:hover {
          border-color: rgba(255,255,255,0.6);
          color: #fff;
        }

        .col-label {
          font-size: 10px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin: 0 0 16px;
        }

        .footer-link {
          display: block;
          font-size: 13px;
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          padding: 5px 0;
          transition: color 0.2s;
        }
        .footer-link:hover { color: #fff; }

        .footer-bottom {
          border-top: 0.5px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 48px;
          max-width: 100%;
        }

        .copy {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          margin: 0;
        }

        .pay-row { display: flex; gap: 8px; }
        .pay-badge {
          font-size: 9px;
          border: 0.5px solid rgba(255,255,255,0.12);
          padding: 3px 8px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.06em;
        }

        /* ── MOBILE ── */
        .footer-mobile { display: block; }

        .mob-brand {
          padding: 32px 20px 24px;
          border-bottom: 0.5px solid rgba(255,255,255,0.08);
        }

        .mob-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 0.5px solid rgba(255,255,255,0.08);
        }

        .mob-col {
          padding: 24px 20px;
        }
        .mob-col:first-child {
          border-left: 0.5px solid rgba(255,255,255,0.08);
        }

        .footer-bottom {
          padding: 14px 20px;
          flex-direction: row-reverse;
        }
      `}</style>
    </footer>
  );
}