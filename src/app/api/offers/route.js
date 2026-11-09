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
  .filter((o) => o.active === true && (environment === "preview"
    ? o.environment === "preview"
    : o.environment !== "preview"))
  .map((offer) => {
    // قسائم الشراء: نرسل بيانات العرض اللازمة للبانر فقط.
    // لا نرسل couponCode أو config أو أي بيانات داخلية.
    if (offer.type === "coupon_fixed") {
      return {
        id: offer.id,
        type: offer.type,
        active: offer.active,
        startsAt: offer.startsAt || null,
        endsAt: offer.endsAt || null,
        displayText: offer.displayText || "",
        campaignLabel: offer.campaignLabel || "",
        description: offer.description || "",
        productScope: offer.productScope === "selected" ? "selected" : "all",
        productIds: Array.isArray(offer.productIds) ? offer.productIds : [],
        excludedProductIds: Array.isArray(offer.excludedProductIds)
          ? offer.excludedProductIds
          : [],
        excludeDiscounted: offer.excludeDiscounted === true,
      };
    }

    // باقي العروض تحتفظ بسلوكها الحالي دون تغيير.
    return offer;
  });

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
