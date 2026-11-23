import Link from "next/link";
import { CONTACT_INFO } from "@/lib/contactInfo";
import ContactForm from "./ContactForm";
import SubscribeForm from "./SubscribeForm";

export const metadata = {
  title: "تواصل معانا | WIND Shopping",
  description: "ابعتلنا رسالتك أو كلمنا على واتساب. فريق WIND Shopping جاهز يساعدك في الطلبات والمقاسات وأي استفسار.",
  alternates: { canonical: "/contact-us" },
};

const icons = {
  whatsapp: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M20.5 3.5A11 11 0 0 0 3.2 17l-1.2 4.4 4.5-1.2A11 11 0 1 0 20.5 3.5zM12 20a9 9 0 0 1-4.6-1.3l-.3-.2-2.7.7.7-2.6-.2-.3A9 9 0 1 1 12 20zm5-6.7c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6 0a7.4 7.4 0 0 1-2.2-1.4 8 8 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.3-.4a.7.7 0 0 0 0-.6c-.1-.1-.6-1.5-.9-2-.2-.5-.4-.5-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-1 2.3 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.7 4.2c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z"/></svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
  ),
  social: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>
  ),
};

function Card({ icon, title, value, href, external, dir }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex items-center gap-4 bg-white border border-gray-200 rounded-[3px] px-4 py-4 hover:border-[#1A1A1A] hover:shadow-md transition"
    >
      <span className="shrink-0 w-11 h-11 rounded-full bg-[#1A1A1A] text-[#F5C518] flex items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-gray-500 mb-0.5">{title}</span>
        <span className="block font-bold text-[#1A1A1A] truncate" dir={dir}>{value}</span>
      </span>
    </a>
  );
}

export default function ContactUsPage() {
  const c = CONTACT_INFO;
  const socials = [c.instagram, c.tiktok, c.facebook].filter(Boolean);
  return (
    <main dir="rtl" className="bg-[#FAFAF8]" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <section className="bg-[#1A1A1A] text-white">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20 text-center">
          <span className="inline-block text-[#F5C518] text-xs font-bold tracking-[0.25em] mb-4">CONTACT US</span>
          <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight">تواصل معانا</h1>
          <p className="text-gray-300 max-w-xl mx-auto leading-relaxed">
            عندك سؤال عن طلب أو مقاس أو شحن؟ ابعتلنا رسالتك وفريق WIND هيرد عليك في أقرب وقت.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-5 py-10 md:py-14 grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3 bg-white border border-gray-200 rounded-[3px] p-6 md:p-8 shadow-sm" aria-labelledby="form-title">
          <h2 id="form-title" className="text-xl md:text-2xl font-black text-[#1A1A1A] mb-1">ابعتلنا رسالة</h2>
          <p className="text-gray-500 text-sm mb-6">املا البيانات وهنتواصل معاك.</p>
          <ContactForm />
        </section>

        <aside className="lg:col-span-2 space-y-3" aria-label="طرق التواصل">
          <Card icon={icons.whatsapp} title="واتساب" value={c.whatsapp.display} href={c.whatsapp.href} external dir="ltr" />
          <Card icon={icons.phone} title="الخط الساخن" value={c.phone.display} href={c.phone.href} dir="ltr" />
          <Card icon={icons.email} title="البريد الإلكتروني" value={c.email} href={`mailto:${c.email}`} dir="ltr" />
          <div className="bg-white border border-gray-200 rounded-[3px] px-4 py-4">
            <p className="text-xs text-gray-500 mb-3">تابعنا</p>
            <div className="flex flex-wrap gap-2">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="px-4 py-2 border border-gray-300 rounded-[3px] text-sm font-bold text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white hover:border-[#1A1A1A] transition">
                  {s.label}
                </a>
              ))}
            </div>
          </div>
          {c.hours && <p className="text-sm text-gray-600 px-1">مواعيد الرد: {c.hours}</p>}
          <p className="text-sm text-gray-600 px-1 pt-2">
            بتسأل عن أوردر؟ <Link href="/track-order" className="font-bold text-[#1A1A1A] underline">تتبع طلبك</Link> بدل ما تستنى الرد.
          </p>
        </aside>
      </div>

      <section className="bg-[#1A1A1A] text-white" aria-labelledby="sub-title">
        <div className="max-w-3xl mx-auto px-5 py-12 text-center">
          <span className="inline-block text-[#F5C518] text-xs font-bold tracking-[0.25em] mb-3">NEWSLETTER</span>
          <h2 id="sub-title" className="text-2xl md:text-3xl font-black mb-2">اشترك واستنى الخصومات</h2>
          <p className="text-gray-300 mb-6">سيب بريدك وهتوصلك عروضنا وخصوماتنا الجديدة قبل أي حد.</p>
          <SubscribeForm />
        </div>
      </section>

      {c.map && (
        <section className="max-w-5xl mx-auto px-5 py-14" aria-labelledby="map-title">
          <div className="flex items-end justify-between mb-4">
            <h2 id="map-title" className="text-xl md:text-2xl font-black text-[#1A1A1A]">موقعنا</h2>
            <a href={c.map.href} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#1A1A1A] underline">افتح في خرائط جوجل</a>
          </div>
          <iframe
            src={c.map.embedSrc}
            title="موقع WIND Shopping على خريطة جوجل"
            className="w-full h-72 md:h-96 border border-gray-200 rounded-[3px] bg-gray-100"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </section>
      )}
    </main>
  );
}
