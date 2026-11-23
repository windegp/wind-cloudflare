import TrackOrderForm from "./TrackOrderForm";

export const metadata = {
  title: "تتبع طلبك | WIND Shopping",
  description: "اعرف حالة طلبك من WIND Shopping برقم الطلب ورقم الموبايل.",
  alternates: { canonical: "/track-order" },
};

export default function TrackOrderPage() {
  return (
    <main className="px-4 py-12 max-w-xl mx-auto" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <h1 className="text-2xl md:text-3xl font-black text-[#1A1A1A] mb-2">تتبع طلبك</h1>
      <p className="text-gray-600 mb-8">اكتب رقم الطلب (موجود في رسالة التأكيد وبيبدأ بـ WIND) ورقم الموبايل اللي طلبت بيه.</p>
      <TrackOrderForm />
    </main>
  );
}
