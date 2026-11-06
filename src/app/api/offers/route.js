import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';

export const dynamic = 'force-dynamic';

/**
 * GET /api/offers
 * بترجع العروض التلقائية المفعّلة فقط.
 * قسائم الشراء بكود لا تُرسل للمتصفح؛ التحقق منها يظل على السيرفر.
 * فلترة التواريخ (بتوقيت القاهرة) بتتم في offerEngine وقت الحساب.
 * أي فشل → قائمة فاضية، والسلة تشتغل بدون عروض زي ما هي.
 */
function isPreviewHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  const productionHosts = ["windeg.com", "www.windeg.com", "windeg.pages.dev"];
  return !productionHosts.includes(host);
}

export async function GET(request) {
  try {
    const db = getDb();
    const environment = isPreviewHost(new URL(request.url).hostname) ? "preview" : "production";
    const [snap, shippingRuleSnap] = await Promise.all([
      getDocs(collection(db, 'offers')),
      getDoc(doc(db, "settings", `offerShippingRules_${environment}`)),
    ]);
    const offers = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => o.active === true && o.type !== "coupon_fixed" && (environment === "preview"
        ? o.environment === "preview"
        : o.environment !== "preview"));

    const shippingRules = shippingRuleSnap.exists() ? shippingRuleSnap.data() : null;
    return NextResponse.json(
      { success: true, offers, shippingRules },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } }
    );
  } catch (err) {
    console.error('offers GET error:', err);
    return NextResponse.json({ success: false, offers: [], shippingRules: null }, { status: 500 });
  }
}
