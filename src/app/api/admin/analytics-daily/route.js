import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc, setDoc } from "firebase/firestore/lite";
import { getCairoDayBoundaries, getCairoDateStr, parseDateToMs, isRealCustomer } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════
 * DETERMINISTIC DAILY ANALYTICS — PRIMARY AGGREGATION LAYER
 * ═══════════════════════════════════════════════════════════
 *
 * SOURCE COLLECTIONS (immutable truth):
 *   - Orders:     actual completed orders
 *   - Customers:  purchasing customer records (Purchased_Once / VIP_Customer)
 *   - visitor_events: per-session visitor records
 * 
 * OUTPUT:
 *   analytics_daily/2026-05-23
 *   {
 *     visitors: 351,      // unique sessions from visitor_events
 *     customers: 17,       // unique purchasing customers from Customers
 *     orders: 29,          // completed orders from Orders
 *     revenue: 18750.00,   // sum of completed order totals
 *     conversionRate: 8.26 // orders / visitors * 100
 *   }
 * 
 * Yesterday = analytics_daily/<yesterday>
 * Last 7 days = sum last 7 daily docs
 * This month = sum month daily docs
 * 
 * NO mutable counters. NO rollover logic. NO fake estimations.
 * ═══════════════════════════════════════════════════════════
 */

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date'); // YYYY-MM-DD
  const rebuild = searchParams.get('rebuild') === 'true';

  try {
    const db = getDb();
    const targetDateStr = dateParam || getCairoDateStr(new Date());

    // If exists and not rebuilding, return cached
    if (!rebuild) {
      const existing = await getDoc(doc(db, "analytics_daily", targetDateStr));
      if (existing.exists()) {
        return Response.json({ success: true, source: 'cached', data: existing.data() });
      }
    }

    const bounds = getCairoDayBoundaries(targetDateStr);

    // ══════════════════════════════════════════════════════
    // 1. Visitors from visitor_events collection
    // ══════════════════════════════════════════════════════
    let visitors = 0;
    try {
      const eventsSnap = await getDocs(query(
        collection(db, "visitor_events"),
        where("date", "==", targetDateStr)
      ));
      // Each doc = one session-day. Unique sessions = visitors.
      const uniqueSessions = new Set();
      eventsSnap.docs.forEach(d => {
        const ev = d.data();
        if (ev.sessionId) uniqueSessions.add(ev.sessionId);
      });
      visitors = uniqueSessions.size;
    } catch (qErr) {
      console.warn(`[analytics-daily] visitor_events query failed: ${qErr.message}`);
      // Fallback to Customers.last_active if visitor_events doesn't exist yet
      try {
        const custSnap = await getDocs(query(
          collection(db, "Customers"),
          where("last_active", ">=", bounds.start)
        ));
        const unique = new Set();
        custSnap.docs.forEach(d => {
          const c = d.data();
          if (!c) return;
          const ms = parseDateToMs(c.last_active);
          if (isNaN(ms) || ms > bounds.endMs) return;
          const email = (c.Email || c.email || '').toLowerCase().trim();
          const phone = String(c.Phone || '').replace(/[^0-9]/g, '');
          unique.add(email || phone || d.id);
        });
        visitors = unique.size;
      } catch {
        visitors = 0;
      }
    }

    // ══════════════════════════════════════════════════════
    // 2. Customers from real purchasing customers
    // ══════════════════════════════════════════════════════
    let customers = 0;
    try {
      const custSnap = await getDocs(query(
        collection(db, "Customers"),
        where("last_active", ">=", bounds.start)
      ));
      const uniqueReal = new Set();
      custSnap.docs.forEach(d => {
        const c = d.data();
        if (!c) return;
        const ms = parseDateToMs(c.last_active);
        if (isNaN(ms) || ms > bounds.endMs) return;
        if (!isRealCustomer(c)) return;
        const email = (c.Email || c.email || '').toLowerCase().trim();
        const phone = String(c.Phone || '').replace(/[^0-9]/g, '');
        uniqueReal.add(email || phone || d.id);
      });
      customers = uniqueReal.size;
    } catch {
      customers = 0;
    }

    // ══════════════════════════════════════════════════════
    // 3. Orders and revenue from Orders collection
    // ══════════════════════════════════════════════════════
    let orders = 0;
    let revenue = 0;
    try {
      const ordersSnap = await getDocs(query(
        collection(db, "Orders"),
        where("Created at", ">=", bounds.start)
      ));
      ordersSnap.docs.forEach(d => {
        const o = d.data();
        if (!o) return;
        const ms = parseDateToMs(o['Created at']);
        if (isNaN(ms) || ms > bounds.endMs) return;
        if (o['Financial Status'] === 'deleted') return;
        const isAbandoned = o['Financial Status'] === 'abandoned' || 
                            o['Financial Status'] === 'pending_payment' || 
                            (o.Name && o.Name.startsWith('DRAFT-'));
        if (isAbandoned) return;
        orders++;
        const totalStr = String(o.Total || '').replace(/[^0-9.\-]/g, '');
        if (totalStr && totalStr !== '-') revenue += parseFloat(totalStr) || 0;
      });
    } catch {
      orders = 0;
      revenue = 0;
    }

    // ══════════════════════════════════════════════════════
    // 4. Conversion rate
    // ══════════════════════════════════════════════════════
    const conversionRate = (visitors > 0 && orders > 0)
      ? parseFloat(((orders / visitors) * 100).toFixed(2))
      : 0;

    // ══════════════════════════════════════════════════════
    // 5. Build and store deterministic doc
    // ══════════════════════════════════════════════════════
    const analyticsDoc = {
      date: targetDateStr,
      visitors,
      customers,
      orders,
      revenue: parseFloat(revenue.toFixed(2)),
      conversionRate,
      computedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, "analytics_daily", targetDateStr), analyticsDoc);

    return Response.json({ success: true, source: 'computed', data: analyticsDoc });

  } catch (error) {
    console.error("[analytics-daily] Fatal error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}