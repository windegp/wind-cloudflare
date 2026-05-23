import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
const CACHE_KEY = 'site_settings_v1';

/**
 * TTL reduced from 86400 (24h) to 3600 (1h)
 * to prevent stale counter values from being served for too long.
 * The 24h TTL caused: counters.customers showing 30k after reconciliation to 12k.
 * Counters change frequently (every visitor increment), so 1h TTL is safer.
 */
const CACHE_TTL = 3600; // 1 hour instead of 24 hours

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const isFreshRequested = searchParams.get('fresh') === 'true';

  // للزوار فقط - رجّع الكاش فوراً
  if (!isFreshRequested) {
    const cached = await kvGet(CACHE_KEY);
    if (cached) {
      return Response.json(
        { success: true, source: 'cache', data: cached },
        { headers: { 'X-Cache': 'HIT' } }
      );
    }
  }

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "settings", "siteSettings"));

    // ✅ Bug Fix: data كانت مش معرّفة خالص
    const data = snap.exists() ? snap.data() : null;

    if (!data) {
      return Response.json({ success: false, error: 'Settings not found' }, { status: 404 });
    }

    // خزّن في KV (للزوار الجايين)
    await kvSet(CACHE_KEY, data);

    return Response.json(
      { success: true, source: 'firebase', data },
      { headers: { 'X-Cache': 'MISS' } }
    );

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}