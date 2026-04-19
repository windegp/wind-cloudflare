"use client";
import Link from 'next/link';

// مكون أيقونة السهم الخارجي (External Link Icon)
const ExternalIcon = () => (
  <svg className="w-3.5 h-3.5 mr-1.5 inline-block opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
  </svg>
);

export default function Footer() {
  return (
    <footer className="bg-black text-white pt-12 pb-10 flex flex-col items-center justify-center font-sans" dir="rtl">
      
      {/* 1. صف السوشيال ميديا */}
      <div className="flex gap-8 mb-10 items-center">
        {/* TikTok */}
        <a href="#" className="hover:opacity-70 transition-opacity">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 15.68a6.32 6.32 0 0 0 6.31 6.32 6.32 6.32 0 0 0 6.3-6.32V10.3a8.39 8.39 0 0 0 4.39 1.28V8.13a4.91 4.91 0 0 1-2.41-.44z"/></svg>
        </a>
        {/* Instagram */}
        <a href="#" className="hover:opacity-70 transition-opacity">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.88z"/></svg>
        </a>
        {/* X (Twitter) */}
        <a href="#" className="hover:opacity-70 transition-opacity">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
        {/* YouTube */}
        <a href="#" className="hover:opacity-70 transition-opacity">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.498 5.814a3.016 3.016 0 0 0 2.122 2.136c1.872.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>
        {/* Facebook */}
        <a href="#" className="hover:opacity-70 transition-opacity">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </a>
      </div>

      {/* 2. صف الروابط الأول */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-4 text-[15px] font-medium tracking-wide">
        <Link href="/pages/contact" className="hover:underline flex items-center">تواصل معنا <ExternalIcon/></Link>
        <Link href="/collections/all" className="hover:underline flex items-center">جميع المنتجات <ExternalIcon/></Link>
        <Link href="/collections/best-sellers" className="hover:underline flex items-center">الأكثر مبيعاً <ExternalIcon/></Link>
      </div>

      {/* 3. صف الروابط الثاني */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-4 text-[15px] font-medium tracking-wide">
        <Link href="/policies/shipping" className="hover:underline flex items-center">سياسة الشحن والتوصيل <ExternalIcon/></Link>
        <Link href="/policies/refund" className="hover:underline flex items-center">الاستبدال والاسترجاع <ExternalIcon/></Link>
      </div>

      {/* 4. صف الروابط الثالث */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-4 text-[15px] font-medium tracking-wide">
        <Link href="/pages/about" className="hover:underline">من نحن</Link>
        <Link href="/pages/faq" className="hover:underline flex items-center">الأسئلة الشائعة <ExternalIcon/></Link>
        <Link href="/pages/quality" className="hover:underline flex items-center">جودة التصنيع <ExternalIcon/></Link>
      </div>

      {/* 5. صف الروابط الرابع */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-8 text-[15px] font-medium tracking-wide">
        <Link href="/policies/terms" className="hover:underline">شروط الاستخدام</Link>
        <Link href="/policies/privacy" className="hover:underline">سياسة الخصوصية</Link>
      </div>

      {/* 6. تفضيلات الخصوصية */}
      <div className="flex items-center gap-2 mb-8 cursor-pointer hover:underline group">
        <div className="flex items-center bg-[#1A73E8] rounded-full px-1.5 py-0.5">
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
          <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
        </div>
        <span className="text-[15px] font-medium">تفضيلات الخصوصية للإعلانات</span>
      </div>

      {/* 7. شعار الشركة */}
      <div className="mb-6 flex justify-center items-center gap-2">
        <span className="font-normal text-[15px]">إحدى شركات</span>
        <span className="font-black text-xl italic tracking-wider">لs</span>
      </div>

      {/* 8. حقوق النشر والتاريخ */}
      <div className="text-[#a3a3a3] text-[13px] tracking-wide font-sans text-center">
        {""}
        &copy;
        {" 2019-"}
        {new Date().getFullYear()}
        {" لشركة WIND Shopping"}
      </div>

    </footer>
  );
}
