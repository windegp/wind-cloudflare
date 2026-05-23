import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc, setDoc } from "firebase/firestore/lite";
import { getCairoDayBoundaries, getCairoDateStr, parseDateToMs, isRealCustomer, getDateRange } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════
 * REBUILD ANALYTICS — SAFE HISTORICAL RECOMPUTATION
 * ═══════════════════════════════════════════════════════════
 *
 * Rebuilds ALL analytics_daily documents from scratch.
 * Uses raw source collections (Orders, Customers, visitor_events).
 * 
 * DRY-RUN by default: pass ?dryRun=false to apply writes.
 * 
 * ⚠️ This is a HEAVY operation. For large datasets, it may take minutes.
 * ═══════════════════════════════════════════════════════════
 */

// Date range for rebuild: from first known order to today (Cairo)
async function getRebuildRange(db) {
  const now = new Date();
  const endDate = getCairoDateStr(now);
  
  // Try to get the earliest order date
  try {
    const ordersSnap = await getDocs(query(
      collection(db, "Orders"),
      where("Created at", ">", "")
    ));
    let earliestMs = Infinity;
    ordersSnap.docs.forEach(d => {
      const o = d.data();
      if (!o) return;
      const ms = parseDateToMs(o['Created at']);
      if (!isNaN(ms) && ms < earliestMs) earliestMs = ms;
    });
    
    if (earliestMs < Infinity && earliestMs < Date.now()) {
      const earliestDate = new Date(earliestMs);
      const startDate = getCairoDateStr(earliestDate);
      return { startDate, endDate, dateStrings: getDateRange(startDate, endDate) };
    }
  } catch {}
  
  // Fallback: last 90 days
  const past = new Date(now);
  past.setDate(past.getDate() - 90);
  const startDate = getCairoDateStr(past);
  return { startDate, endDate, dateStrings: getDateRange(startDate, endDate) };
}

async function computeDay(db, dateStr) {
  const bounds = getCairoDayBoundaries(dateStr);
  const result = { date: dateStr, visitors: 0, customers: 0, orders: 0, revenue: 0, conversionRate: 0 };
  
  // Visitors from visitor_events (primary)
  try {
    const eventsSnap = await getDocs(query(collection(db, "visitor_events"), where("date", "==", dateStr)));
    const uniqueSessions = new Set();
    eventsSnap.docs.forEach(d => { const e = d.data(); if (e.sessionId) uniqueSessions.add(e.sessionId); });
    result.visitors = uniqueSessions.size;
  } catch {}
  
  // Fallback visitors from Customers
  if (result.visitors === 0) {
    try {
      const custSnap = await getDocs(query(collection(db, "Customers"), where("last_active", ">=", bounds.start)));
      const unique = new Set();
      custSnap.docs.forEach(d => {
        const c = d.data(); if (!c) return;
        const ms = parseDateToMs(c.last_active);
        if (isNaN(ms) || ms > bounds.endMs) return;
        unique.add((c.Email || c.email || '').toLowerCase().trim() || String(c.Phone || '').replace(/[^0-9]/g, '') || d.id);
      });
      result.visitors = unique.size;
    } catch {}
  }
  
  // Customers
  try {
    const custSnap = await getDocs(query(collection(db, "Customers"), where("last_active", ">=", bounds.start)));
    const uniqueReal = new Set();
    custSnap.docs.forEach(d => {
      const c = d.data(); if (!c) return;
      const ms = parseDateToMs(c.last_active);
      if (isNaN(ms) || ms > bounds.endMs) return;
      if (!isRealCustomer(c)) return;
      uniqueReal.add((c.Email || c.email || '').toLowerCase().trim() || String(c.Phone || '').replace(/[^0-9]/g, '') || d.id);
    });
    result.customers = uniqueReal.size;
  } catch {}
  
  // Orders + revenue
  try {
    const ordersSnap = await getDocs(query(collection(db, "Orders"), where("Created at", ">=", bounds.start)));
    ordersSnap.docs.forEach(d => {
      const o = d.data(); if (!o) return;
      const ms = parseDateToMs(o['Created at']);
      if (isNaN(ms) || ms > bounds.endMs) return;
      if (o['Financial Status'] === 'deleted') return;
      if (o['Financial Status'] === 'abandoned' || o['Financial Status'] === 'pending_payment' || (o.Name && o.Name.startsWith('DRAFT-'))) return;
      result.orders++;
      const totalStr = String(o.Total || '').replace(/[^0-9.\-]/g, '');
      if (totalStr && totalStr !== '-') result.revenue += parseFloat(totalStr) || 0;
    });
  } catch {}
  
  result.revenue = parseFloat(result.revenue.toFixed(2));
  if (result.visitors > 0 && result.orders > 0) {
    result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
  }
  result.computedAt = new Date().toISOString();
  return result;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== 'false';
  const forceDate = searchParams.get('date'); // optional: rebuild single date

  try {
    const db = getDb();

    if (forceDate) {
      // Rebuild a single day
      const result = await computeDay(db, forceDate);
      if (!dryRun) {
        await setDoc(doc(db, "analytics_daily", forceDate), result);
      }
      return Response.json({
        success: true,
        dryRun,
        message: dryRun 
          ? `🔍 Dry-run for ${forceDate}. Would write: ${JSON.stringify(result)}`
          : `✅ analytics_daily/${forceDate} rebuilt`,
        data: result
      });
    }

    // Full rebuild
    const { startDate, endDate, dateStrings } = await getRebuildRange(db);
    const total = dateStrings.length;
    
    if (total === 0) {
      return Response.json({ success: false, error: 'No dates to rebuild' }, { status: 400 });
    }

    if (dryRun) {
      // Report only: count how many docs already exist
      let existing = 0;
      for (const dateStr of dateStrings) {
        const snap = await getDoc(doc(db, "analytics_daily", dateStr));
        if (snap.exists()) existing++;
      }
      return Response.json({
        success: true,
        dryRun: true,
        message: `🔍 Dry-run: ${total} dates (${startDate} → ${endDate}). ${existing} existing docs would be overwritten. Pass ?dryRun=false to rebuild all.`,
        stats: {
          totalDays: total,
          existingDocs: existing,
          missingDocs: total - existing,
          dateRange: { start: startDate, end: endDate }
        }
      });
    }

    // Apply: rebuild all days
    let computed = 0;
    for (const dateStr of dateStrings) {
      const result = await computeDay(db, dateStr);
      await setDoc(doc(db, "analytics_daily", dateStr), result);
      computed++;
      if (computed % 10 === 0) {
        console.log(`[rebuild-analytics] ${computed}/${total} days rebuilt`);
      }
    }

    return Response.json({
      success: true,
      dryRun: false,
      message: `✅ Rebuilt ${computed}/${total} analytics_daily documents (${startDate} → ${endDate})`,
      stats: {
        totalDays: total,
        rebuiltDays: computed,
        dateRange: { start: startDate, end: endDate }
      }
    });

  } catch (error) {
    console.error("[rebuild-analytics] Fatal error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}