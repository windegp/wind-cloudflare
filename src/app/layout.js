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

export const metadata = {
  metadataBase: new URL('https://windeg.com'),
  title: 'WIND Shopping | الأناقة والدفء في مكان واحد',
  description: 'اكتشف مجموعات WIND Shopping الفريدة من الشيلان والملابس الراقية المصممة بعناية.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable}`}> 
      <head>
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