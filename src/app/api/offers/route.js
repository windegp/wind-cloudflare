import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore/lite';

export const dynamic = 'force-dynamic';

/**
 * GET /api/offers
 * بترجع العروض المفعّلة (active === true) فقط.
 * فلترة التواريخ (بتوقيت القاهرة) بتتم في offerEngine وقت الحساب.
 * أي فشل → قائمة فاضية، والسلة تشتغل بدون عروض زي ما هي.
 */
export async function GET() {
  try {
    const db = getDb();
    const snap = await getDocs(collection(db, 'offers'));
    const offers = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => o.active === true);

    return NextResponse.json(
      { success: true, offers },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('offers GET error:', err);
    return NextResponse.json({ success: false, offers: [] }, { status: 500 });
  }
}
