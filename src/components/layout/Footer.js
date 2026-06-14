"use client";
import Link from "next/link";
import { useState } from "react";
import styles from "./Footer.module.css";

const paymentIcons = [
  { name: "Mastercard",      url: "https://ik.imagekit.io/windeg/WIND_Shopping/mastercard.svg" },
  { name: "Visa",            url: "https://ik.imagekit.io/windeg/WIND_Shopping/visa.svg" },
  { name: "Meeza",           url: "https://ik.imagekit.io/windeg/WIND_Shopping/Meeza.svg" },
  { name: "American Express",url: "https://ik.imagekit.io/windeg/WIND_Shopping/amex-svgrepo-com.svg" },
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

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="3" />
    <polyline points="2,4 12,13 22,4" />
  </svg>
);

const IgIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
  </svg>
);

const TkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
  </svg>
);

const FbIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const WaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const socials = [
  { label: "Instagram", href: "https://www.instagram.com/windshoping",  Icon: IgIcon },
  { label: "TikTok",    href: "https://www.tiktok.com/@windshopping",   Icon: TkIcon },
  { label: "Facebook",  href: "https://www.facebook.com/WIND.EGY/",     Icon: FbIcon },
  { label: "WhatsApp",  href: "https://wa.me/201055737110",              Icon: WaIcon },
];

function Newsletter() {
  const [email, setEmail] = useState("");
  return (
    <div className={styles.nlWrap}>
      <p className={styles.nlTitle}>اشترك واحصل على خصم 10%</p>
      <p className={styles.nlSub}>على أول طلب</p>
      <div className={styles.nlInputRow}>
        <span className={styles.nlIcon}><MailIcon /></span>
        <input
          type="email"
          className={styles.nlInput}
          placeholder="بريدك الإلكتروني"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className={styles.nlBtn}>اشترك الآن</button>
    </div>
  );
}

function SocialRow() {
  return (
    <div className={styles.socRow}>
      {socials.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socBtn}
          aria-label={label}
        >
          <Icon />
        </a>
      ))}
    </div>
  );
}

function PaymentIcons({ iconClass }) {
  return (
    <div className={styles.payRow}>
      {paymentIcons.map((p) => (
        <img key={p.name} src={p.url} alt={p.name} className={iconClass} />
      ))}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className={styles.root}>

      {/* ════════ DESKTOP ════════ */}
      <div className={styles.desktop}>
        <div className={styles.inner}>

          {/* col 1 — newsletter */}
          <div>
            <Newsletter />
          </div>

          {/* col 2 — social + tagline */}
          <div>
            <SocialRow />
            <p className={styles.tagline}>
              ملابس أصلية بتصاميم مختلفة<br />من القاهرة للعالم.
            </p>
          </div>

          {/* col 3 — quick links */}
          <div>
            <p className={styles.colLabel}>روابط سريعة</p>
            {quickLinks.map((l) => (
              <Link key={l.label} href={l.href} className={styles.fLink}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* col 4 — policies */}
          <div>
            <p className={styles.colLabel}>سياساتنا</p>
            {policies.map((l) => (
              <Link key={l.label} href={l.href} className={styles.fLink}>
                {l.label}
              </Link>
            ))}
          </div>

        </div>

        <div className={`${styles.bottom} ${styles.desktopBottom}`}>
          <PaymentIcons iconClass={styles.payIcon} />
          <p className={styles.copy}>© {new Date().getFullYear()} WIND Shopping. جميع الحقوق محفوظة.</p>
        </div>
      </div>

      {/* ════════ MOBILE ════════ */}
      <div className={styles.mobile}>

        <div className={styles.mobNl}>
          <Newsletter />
        </div>

        <div className={styles.mobBody}>
          <div className={styles.mobSoc}>
            <SocialRow />
          </div>
          <div className={styles.mobCols}>
            <div>
              <p className={styles.colLabel}>روابط سريعة</p>
              {quickLinks.map((l) => (
                <Link key={l.label} href={l.href} className={styles.fLink}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div>
              <p className={styles.colLabel}>سياساتنا</p>
              {policies.map((l) => (
                <Link key={l.label} href={l.href} className={styles.fLink}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className={`${styles.bottom} ${styles.mobBottom}`}>
          <PaymentIcons iconClass={styles.mobPayIcon} />
          <p className={styles.copy}>© {new Date().getFullYear()} WIND Shopping</p>
        </div>

      </div>

    </footer>
  );
}