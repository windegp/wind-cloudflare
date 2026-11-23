import Link from 'next/link';

export const metadata = {
  title: 'الصفحة غير موجودة | WIND Shopping',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="text-center px-4 py-24 max-w-xl mx-auto" dir="rtl">
      <p className="text-6xl font-black text-[#1A1A1A] mb-4">404</p>
      <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "'Cairo', sans-serif" }}>
        الصفحة اللي بتدور عليها مش موجودة
      </h1>
      <p className="text-gray-600 mb-8">
        ممكن الرابط اتغير أو الصفحة اتنقلت. تقدر ترجع للرئيسية أو تتصفح الأقسام.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/" className="bg-[#1A1A1A] text-white px-6 py-2.5 rounded-[3px] font-bold">
          الرئيسية
        </Link>
        <Link href="/policies" className="border border-[#1A1A1A] text-[#1A1A1A] px-6 py-2.5 rounded-[3px] font-bold">
          مركز السياسات
        </Link>
      </div>
    </div>
  );
}
