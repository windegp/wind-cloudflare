import "./globals.css"; 
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