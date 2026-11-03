import "./globals.css";
// Polyfills for legacy browser compatibility (must load before React)
import "../lib/polyfills";
import { CartProvider } from "../context/CartContext";
import { GlobalLoaderProvider } from "../context/GlobalLoaderContext";
import { SettingsProvider } from "../context/SettingsContext";
import { AuthProvider } from "../context/AuthContext";
import { SWRProvider } from "../components/SWRProvider"; // ✅ استيراد الـ SWRProvider الجديد
import GlobalLoader from "../components/GlobalLoader";
import Script from 'next/script';
import { Cairo, Tajawal } from 'next/font/google';

import StoreLayout from "../components/layout/StoreLayout";
import LiveTracker from "../components/LiveTracker";
import { getSiteSettingsServer } from "../lib/getSiteSettingsServer";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "../lib/seo-helpers";

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['400', '700', '900'],
  display: 'swap',
  variable: '--font-cairo',
});

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '700', '900'],
  display: 'swap',
  variable: '--font-tajawal',
});

const SITE_TITLE = 'WIND Shopping | أسلوبك يبدأ من هنا';
const SITE_DESCRIPTION = 'اكتشف تشكيلة مختارة بعناية تجمع بين التصميم العصري والراحة والجودة، وصمّم إطلالتك بأسلوب يعكس شخصيتك مع WIND Shopping.';

// 🔥 SEO: تحويل metadata الثابت إلى generateMetadata async
// ملاحظة: هذا التحويل SEO-only — لا يغيّر أي منطق تتبع (Pixel/CAPI/GA4) الموجود
// داخل <head> في RootLayout نفسه، ولا أي جزء من شجرة الـ Providers تحت <body>.
// getSiteSettingsServer() تقرأ KV مباشرة (site_settings_v1) بدون أي fetch لـ /api/site-settings
// وبدون أي تأثير على SettingsContext الحالي (Client-side) أو أي Firestore read إضافي عند KV HIT.
export async function generateMetadata() {
  const settings = await getSiteSettingsServer();
  const logo = settings?.logoUrl || 'https://windeg.com/logo.png';

  return {
    metadataBase: new URL('https://windeg.com'),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png' }],
    },
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: 'https://windeg.com',
      siteName: 'WIND Shopping',
      images: [{ url: logo }],
      locale: 'ar_EG',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [logo],
    },
    alternates: {
      canonical: 'https://windeg.com',
    },
  };
}

export default async function RootLayout({ children }) {
  // نفس الدالة (React cache()) — لا تسبب Firestore read إضافي لأنها اتنادت بالفعل من generateMetadata لنفس الـ request
  const settings = await getSiteSettingsServer();
  const organizationJsonLd = buildOrganizationJsonLd(settings);
  const websiteJsonLd = buildWebSiteJsonLd();

  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable}`}> 
      <head>
        {/* 🔥 SEO JSON-LD — Organization/OnlineStore + WebSite. لا علاقة لها بأي Tracking/Pixel/CAPI/GA4 أدناه. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />

        {/*
          🔥 Facebook Pixel — Base Code فقط (Browser-side).
          Zaraz أُزيل نهائياً من المشروع — المسار الوحيد الآن هو:
          Browser Pixel (هنا) + Conversions API (عبر fbTrack.js/api/fb-track)،
          يطلقان كل حدث معاً بنفس event_id (Dual Fire + Deduplication).

          autoConfig معطّل عمداً: يمنع Meta من فحص الصفحة تلقائياً وإطلاق
          أحداث تخمينية (مثل SubscribedButtonClick) لم يطلبها أي كود هنا —
          هذا كان مصدر التحذيرات وغير القابلة للتفسير في الجلسات السابقة.
          كل حدث نُرسله الآن مقصود ومُتحكَّم به بالكامل من fbTrack.js فقط.

          PageView نفسه لا يُطلق من هنا — StoreLayout.js يستدعي fbTrack()
          الموحّدة عند كل تغيير مسار، فتُطلق Browser + Server معاً بنفس الـ ID.
        */}
        <Script id="fb-pixel-base" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('set', 'autoConfig', false, '880930164288645');
            fbq('init', '880930164288645');
          `}
        </Script>

        {/*
          🔥 TikTok Pixel — مستقل تمامًا عن Meta Pixel أعلاه (سكريبت منفصل،
          لا مشاركة أي متغيّر أو دالة). Pixel ID عبر env var (غير حساس، لكن
          بطلب صريح من صاحب المشروع لإبقائه env var بدل hardcode).

          ⚠️ لا يوجد استدعاء ttq.page() تلقائيًا من هذا السكريبت.
StoreLayout.js هو المصدر الوحيد لـ PageView، وttTrack.js يستخدم
ttq.page() عند استقبال PageView، بينما باقي الأحداث تستخدم ttq.track().
هذا يمنع Double PageView ويجعل PageView منفصلًا عن أحداث التحويل.
        */}
        <Script id="tiktok-pixel-base" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=i+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('${process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}');
            }(window, document, 'ttq');
          `}
        </Script>

        {/*
          🔥 Google Analytics 4 (GA4) — مشروع مستقل تماماً عن Facebook Pixel،
          لا تداخل بينهما. يُستخدم لقياس سلوك الزوار العام (مصدر الزيارة،
          مدة الجلسة، معدل الارتداد) + أحداث Enhanced Ecommerce
          (view_item, add_to_cart, begin_checkout, purchase) المُرسلة
          من نفس نقاط الكود التي ترسل لـ fbTrack (عبر دالة gaTrack في
          lib/gaTrack.js)، بدون أي تأثير على نظام فيسبوك.

          ⚠️ مهم: نستخدم <script> خام هنا (لا مكوّن next/script) عمداً —
          في App Router، حتى مع strategy="beforeInteractive"، مكوّن
          next/script لا يُضمَّن كنص حرفي في الـ HTML الذي يولّده السيرفر
          (بل يُحقَن لاحقاً عبر JS)، فلا تستطيع أدوات الفحص الخارجية
          (مثل أداة "Test" في Google Analytics) رؤيته رغم أنه يعمل فعلياً
          في المتصفح. الـ script الخام هو الحل الموصى به رسمياً لهذه الحالة.
        */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-17RCL06LKM"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-17RCL06LKM');
            `,
          }}
        />
      </head>
      <body className={`${cairo.className} bg-white text-[#1A1A1A] antialiased overflow-x-hidden`}>
        {/* ✅ تغليف الموقع بالكامل بـ SWRProvider لضمان حماية الكوتا عالمياً */}
        <SWRProvider>
          <GlobalLoaderProvider>
            <GlobalLoader />
            
            <AuthProvider>
              <SettingsProvider>
                <CartProvider>
                  <LiveTracker />
                  
                  <StoreLayout>
                    {children}
                  </StoreLayout>
                </CartProvider>
              </SettingsProvider>
            </AuthProvider>
            
          </GlobalLoaderProvider>
        </SWRProvider>
      </body>
    </html>
  );
}