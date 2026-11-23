import Link from "next/link";
import { CONTACT_INFO } from "@/lib/contactInfo";

export const metadata = {
  title: "تواصل معانا | WIND Shopping",
  description: "طرق التواصل مع WIND Shopping: واتساب، السوشيال ميديا، والدعم.",
  alternates: { canonical: "/contact-us" },
};

export default function ContactUsPage() {
  const channels = [CONTACT_INFO.whatsapp, CONTACT_INFO.instagram, CONTACT_INFO.tiktok, CONTACT_INFO.facebook].filter(Boolean);
  return (
    <main className="px-4 py-12 max-w-xl mx-auto" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <h1 className="text-2xl md:text-3xl font-black text-[#1A1A1A] mb-2">تواصل معانا</h1>
      <p className="text-gray-600 mb-8">فريق WIND جاهز يساعدك في الطلبات والمقاسات وأي استفسار.</p>

      <ul className="space-y-3 mb-8">
        {channels.map((c) => (
          <li key={c.label}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between border border-gray-200 rounded-[3px] px-4 py-3 hover:border-[#1A1A1A] transition-colors"
            >
              <span className="font-bold text-[#1A1A1A]">{c.label}</span>
              <span className="text-gray-600 text-sm" dir="ltr">{c.display}</span>
            </a>
          </li>
        ))}
        {CONTACT_INFO.email && (
          <li>
            <a href={`mailto:${CONTACT_INFO.email}`} className="flex items-center justify-between border border-gray-200 rounded-[3px] px-4 py-3 hover:border-[#1A1A1A] transition-colors">
              <span className="font-bold text-[#1A1A1A]">البريد الإلكتروني</span>
              <span className="text-gray-600 text-sm" dir="ltr">{CONTACT_INFO.email}</span>
            </a>
          </li>
        )}
      </ul>

      {CONTACT_INFO.hours && <p className="text-sm text-gray-600 mb-8">مواعيد الرد: {CONTACT_INFO.hours}</p>}

      <div className="flex flex-wrap gap-3">
        <Link href="/track-order" className="bg-[#1A1A1A] text-white px-6 py-2.5 rounded-[3px] font-bold">تتبع طلبك</Link>
        <Link href="/policies" className="border border-[#1A1A1A] text-[#1A1A1A] px-6 py-2.5 rounded-[3px] font-bold">مركز السياسات</Link>
      </div>
    </main>
  );
}
