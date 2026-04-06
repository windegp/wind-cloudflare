import "./globals.css"; 
import { CartProvider } from "../context/CartContext";
import { GlobalLoaderProvider } from "../context/GlobalLoaderContext";
import GlobalLoader from "../components/GlobalLoader";
import Script from 'next/script';
import { Cairo, Tajawal } from 'next/font/google';

// 🔥 استدعاء الوسيط الجديد اللي هيتحكم في ظهور النافبار والفوتر
import StoreLayout from "../components/layout/StoreLayout";

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
  title: 'WIND Shopping | الأناقة والدفء في مكان واحد',
  description: 'اكتشف مجموعات WIND Shopping الفريدة من الشيلان والملابس الراقية المصممة بعناية.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable}`}> 
      <head>
        <Script 
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" 
          strategy="afterInteractive" 
        />
      </head>
      <body className={`${cairo.className} bg-[#121212] text-white antialiased overflow-x-hidden`}>
        <GlobalLoaderProvider>
          {/* شاشة التحميل (اللوجو) */}
          <GlobalLoader />
          
          <CartProvider>
            {/* 🔥 الوسيط هنا هيغلف المحتوى ويقرر يظهر إيه حسب المسار */}
            <StoreLayout>
              {children}
            </StoreLayout>
          </CartProvider>
        </GlobalLoaderProvider>
      </body>
    </html>
  );
}