import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore/lite";
import { getCairoDayBoundaries, getCairoDateStr, parseDateToMs, isRealCustomer, getDateRange, formatCairoDate } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════
 * DASHBOARD STATS — DETERMINISTIC HISTORICAL AGGREGATION
 * ═══════════════════════════════════════════════════════════
 *
 * PRIMARY SOURCE: analytics_daily/{YYYY-MM-DD}
 *   Pre-computed daily documents from analytics-daily route.
 *   If a daily doc doesn't exist, it will be computed on-the-fly.
 *
 * FALLBACK: Live Firestore queries (when daily docs unavailable)
 * 
 * ALL timezone calculations use Africa/Cairo.
 * NO mutable counters (todayVisitors/yesterdayVisitors).
 * NO fake visitor estimations.
 * ═══════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════
// DAILY DOC HELPERS
// ═══════════════════════════════════════════════════════════

async function getDailyDoc(db, dateStr) {
  try {
    const snap = await getDoc(doc(db, "analytics_daily", dateStr));
    if (snap.exists()) return snap.data();
  } catch {}
  return null;
}

async function getOrComputeDaily(db, dateStr) {
  const existing = await getDailyDoc(db, dateStr);
  if (existing) return existing;
  
  // Compute on-the-fly from live queries (same logic as analytics-daily route)
  const bounds = getCairoDayBoundaries(dateStr);
  const result = { visitors: 0, customers: 0, orders: 0, revenue: 0, conversionRate: 0 };
  
  // Visitors from visitor_events
  try {
    const eventsSnap = await getDocs(query(collection(db, "visitor_events"), where("date", "==", dateStr)));
    const uniqueSessions = new Set();
    eventsSnap.docs.forEach(d => { const e = d.data(); if (e.sessionId) uniqueSessions.add(e.sessionId); });
    result.visitors = uniqueSessions.size;
  } catch {
    // Fallback: Customers.last_active
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
    } catch { result.visitors = 0; }
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
  } catch { result.customers = 0; }
  
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
  } catch { result.orders = 0; result.revenue = 0; }
  
  if (result.visitors > 0 && result.orders > 0) {
    result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
  }
  return result;
}

async function getTotalCounters(db) {
  try {
    const snap = await getDoc(doc(db, "settings", "siteSettings"));
    const c = snap.exists() ? (snap.data().counters || {}) : {};
    return { orders: Number(c.orders) || 0, sales: Number(c.sales) || 0, customers: Number(c.customers) || 0, visitors: Number(c.visitors) || 0 };
  } catch { return { orders: 0, sales: 0, customers: 0, visitors: 0 }; }
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'today';

  try {
    const db = getDb();
    const todayStr = getCairoDateStr(new Date());

    // Today's data: always compute from analytics_daily or live query
    const todayData = await getOrComputeDaily(db, todayStr);

    let result = { visitors: 0, customers: 0, orders: 0, revenue: 0, conversionRate: 0 };
    let dateRange = null;
    let periodDays = 0;

    switch (period) {
      case 'today':
        result = todayData;
        periodDays = 1;
        dateRange = { start: todayStr, end: todayStr };
        break;

      case 'yesterday': {
        // Compute yesterday's Cairo date string without Date arithmetic timezone issues
        const todayParts = todayStr.split('-').map(Number);
        const yesterdayDate = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2] - 1, 12, 0, 0));
        const yesterdayStr = getCairoDateStr(yesterdayDate);
        result = await getOrComputeDaily(db, yesterdayStr);
        periodDays = 1;
        dateRange = { start: yesterdayStr, end: yesterdayStr };
        break;
      }

      case 'week': {
        // Compute 7 day Cairo date strings without Date arithmetic timezone issues
        const todayParts = todayStr.split('-').map(Number);
        const sevenDays = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2] - i, 12, 0, 0));
          sevenDays.push(getCairoDateStr(d));
        }
        const days = await Promise.all(sevenDays.map(s => getOrComputeDaily(db, s)));
        result.visitors = days.reduce((a, d) => a + d.visitors, 0);
        result.customers = days.reduce((a, d) => a + d.customers, 0);
        result.orders = days.reduce((a, d) => a + d.orders, 0);
        result.revenue = parseFloat(days.reduce((a, d) => a + d.revenue, 0).toFixed(2));
        periodDays = 7;
        dateRange = { start: sevenDays[0], end: sevenDays[6] };
        if (result.visitors > 0 && result.orders > 0) {
          result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
        }
        break;
      }

      case 'month': {
        // Compute month start from Cairo date string to avoid timezone roundtrip issues
        const monthStartStr = todayStr.slice(0, 7) + '-01';
        const dates = getDateRange(monthStartStr, todayStr);
        const days = await Promise.all(dates.map(s => getOrComputeDaily(db, s)));
        result.visitors = days.reduce((a, d) => a + d.visitors, 0);
        result.customers = days.reduce((a, d) => a + d.customers, 0);
        result.orders = days.reduce((a, d) => a + d.orders, 0);
        result.revenue = parseFloat(days.reduce((a, d) => a + d.revenue, 0).toFixed(2));
        periodDays = dates.length;
        dateRange = { start: dates[0], end: dates[dates.length - 1] };
        if (result.visitors > 0 && result.orders > 0) {
          result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
        }
        break;
      }

      case 'last_month': {
        // Compute last month bounds directly from Cairo date strings
        const [curYear, curMonth] = todayStr.split('-').map(Number);
        let lastMonth = curMonth - 1;
        let lastYear = curYear;
        if (lastMonth === 0) { lastMonth = 12; lastYear--; }
        const firstStr = `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`;
        // Last day of last month = day 0 of this month
        const lastDayDate = new Date(Date.UTC(curYear, curMonth - 1, 0, 12, 0, 0));
        const lastStr = getCairoDateStr(lastDayDate);
        const dates = getDateRange(firstStr, lastStr);
        const days = await Promise.all(dates.map(s => getOrComputeDaily(db, s)));
        result.visitors = days.reduce((a, d) => a + d.visitors, 0);
        result.customers = days.reduce((a, d) => a + d.customers, 0);
        result.orders = days.reduce((a, d) => a + d.orders, 0);
        result.revenue = parseFloat(days.reduce((a, d) => a + d.revenue, 0).toFixed(2));
        periodDays = dates.length;
        dateRange = { start: dates[0], end: dates[dates.length - 1] };
        if (result.visitors > 0 && result.orders > 0) {
          result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
        }
        break;
      }

      case 'custom': {
        if (!startDate || !endDate) {
          return Response.json({ success: false, error: 'مطلوب startDate و endDate' }, { status: 400 });
        }
        const dates = getDateRange(startDate, endDate);
        const days = await Promise.all(dates.map(s => getOrComputeDaily(db, s)));
        result.visitors = days.reduce((a, d) => a + d.visitors, 0);
        result.customers = days.reduce((a, d) => a + d.customers, 0);
        result.orders = days.reduce((a, d) => a + d.orders, 0);
        result.revenue = parseFloat(days.reduce((a, d) => a + d.revenue, 0).toFixed(2));
        periodDays = dates.length;
        dateRange = { start: dates[0], end: dates[dates.length - 1] };
        if (result.visitors > 0 && result.orders > 0) {
          result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
        }
        break;
      }

      case 'all': {
        const counters = await getTotalCounters(db);
        result.orders = counters.orders;
        result.revenue = counters.sales;
        result.customers = counters.customers;
        result.visitors = counters.visitors;
        periodDays = 90; // approximate for the Shopify import period
        // Compute conversion rate for ALL period using aggregated counters
        if (result.visitors > 0 && result.orders > 0) {
          result.conversionRate = parseFloat(((result.orders / result.visitors) * 100).toFixed(2));
        }
        break;
      }
    }

    // Compute Cairo month name for label using Intl.DateTimeFormat
    const todayDate = new Date(Date.UTC(+todayStr.slice(0, 4), +todayStr.slice(5, 7) - 1, +todayStr.slice(8, 10), 12, 0, 0));
    const monthName = todayDate.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', month: 'long' });

    const periodLabels = {
      all: 'جميع البيانات',
      today: `اليوم — ${todayStr}`,
      yesterday: 'أمس',
      week: 'آخر 7 أيام',
      month: `شهر ${monthName}`,
      last_month: 'الشهر الماضي',
      custom: 'فترة مخصصة'
    };

    return Response.json({
      success: true,
      data: {
        period,
        periodLabel: periodLabels[period] || period,
        visitors: result.visitors,
        totalCustomers: result.customers,
        orders: result.orders,
        completedOrders: result.orders,
        sales: result.revenue,
        conversionRate: result.conversionRate,
        periodDays,
        dateRange
      }
    });

  } catch (error) {
    console.error(`[dashboard-stats] CRITICAL error for period=${searchParams.get('period')}:`, error.name, error.message);
    return Response.json({ success: false, error: 'خطأ في تحميل الإحصائيات', data: null }, { status: 500 });
  }
}