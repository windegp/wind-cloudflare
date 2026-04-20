import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'site_settings_v1';

export async function GET(request) {
  // 🔥 تعديل WIND: استخراج بارامتر "fresh" لمعرفة هل الطلب من الأدمن أم من الزوار
  const { searchParams } = new URL(request.url);
  const isFreshRequested = searchParams.get('fresh') === 'true';

  let kv = null;
  try {
    const ctx = await getCloudflareContext({ async: true });
    kv = ctx?.env?.WIND_KV || null;
  } catch {}

  // 🛡️ لو الطلب مش "فريش" والـ KV متاح، نرجع الكاش فوراً للزوار (توفير كوتا)
  if (kv && !isFreshRequested) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) {
        return Response.json({ success: true, source: 'cache', data: JSON.parse(cached) },
          { headers: { 'X-Cache': 'HIT' } });
      }
    } catch {}
  }

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "settings", "siteSettings"));
    const data = snap.exists() ? snap.data() : null;

    if (kv && data) {
      try { await kv.put(CACHE_KEY, JSON.stringify(data)); } catch {}
    }

    return Response.json({ success: true, source: 'firebase', data },
      { headers: { 'X-Cache': 'MISS' } });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}