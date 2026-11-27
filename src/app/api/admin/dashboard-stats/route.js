import { serverOrderStore } from "@/lib/serverOrderStore";
import { parseDateToMs, isRealCustomer, getCairoDateStr } from '@/lib/analytics-helpers';
import { verifyAdminIdToken } from '@/lib/verifyAdminIdToken';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════
 * DASHBOARD STATS — STABLE HYBRID APPROACH
 * ═══════════════════════════════════════════════════════════
 *
 * PRIMARY SOURCE FOR ALL-TIME TOTALS: Firestore counters (settings/siteSettings)
 *   - counters.visitors = 30000 historical baseline + real visitor increments
 *   - counters.orders, counters.sales, counters.customers = real-time updated
 *
 * PRIMARY SOURCE FOR FILTERED PERIODS: Live Firestore queries
 *   - visitor_events collection (for ALL time-filtered visitor counts)
 *   - Orders collection (filtered by "Created at")
 *   - Customers collection (filtered by "last_active")
 *
 * CRITICAL RULE:
 *   visitor_events = source of truth for all time-based filters (today, yesterday, week, month, custom)
 *   counters       = only for real-time display (today/all totals fallback), NOT analytics queries
 *
 * NO getAllAggregated() — avoids Worker 1102 CPU limit errors
 * NO full analytics_daily scan — avoids heavy aggregation
 * 
 * All timezone calculations use Africa/Cairo.
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Query visitor_events for a date range — returns unique session count (real visitors)
 * Uses the date field (YYYY-MM-DD) which is indexed in visitor_events.
 * Analytics source for the admin dashboard.
 * Do NOT use Customers.last_active for visitors — that only captures purchasers.
 */
async function queryVisitorsFromEvents(startDateOnly, endDateOnly) {
  try {
    // visitor_events.date is stored as "YYYY-MM-DD" string — perfect for range queries
    // Firestore string comparison on YYYY-MM-DD sorts correctly lexicographically.
    // Service-account read (public read on these collections is being closed).
    const rows = await serverOrderStore.query("visitor_events", { filters: [
      { field: "date", op: "GREATER_THAN_OR_EQUAL", value: startDateOnly },
      { field: "date", op: "LESS_THAN_OR_EQUAL", value: endDateOnly },
    ] });

    const uniqueSessions = new Set();
    rows.forEach(({ data: ev }) => {
      if (ev.sessionId) uniqueSessions.add(ev.sessionId);
    });
    return uniqueSessions.size;
  } catch (qErr) {
    console.error(`[dashboard-stats] visitor_events query failed: ${qErr.code || qErr.message}`);
    return 0;
  }
}

/**
 * Query Customers for a date range — returns real customer count only.
 * Used ONLY for the "totalCustomers" metric, NOT for visitors.
 */
async function queryRealCustomersForRange(startDateStr, endDateStr, filterStartMs, filterEndMs) {
  const result = { realCustomers: 0 };

  try {
    const rows = await serverOrderStore.query("Customers", { filters: [
      { field: "last_active", op: "GREATER_THAN_OR_EQUAL", value: startDateStr },
      { field: "last_active", op: "LESS_THAN_OR_EQUAL", value: endDateStr },
    ] });

    const realCustomers = new Map();

    for (const d of rows) {
      try {
        const c = d.data;
        if (!c) continue;
        
        const custDateMs = parseDateToMs(c.last_active);
        if (isNaN(custDateMs) || custDateMs > filterEndMs) continue;
        
        const email = (c.Email || c.email || '').toLowerCase().trim();
        const phone = String(c.Phone || c['Default Address Phone'] || '').replace(/[^0-9]/g, '');
        const uniqueId = email || phone || d.id;
        
        // Real customer = has email/phone AND has orders AND is in Purchased_Once/VIP
        if ((email || phone) && isRealCustomer(c)) {
          if (!realCustomers.has(uniqueId)) realCustomers.set(uniqueId, true);
        }
      } catch (err) {
        console.error(`[dashboard-stats] Skipping bad customer doc: ${d.id}`, err.message);
        continue;
      }
    }
    
    result.realCustomers = realCustomers.size;
  } catch (qErr) {
    console.error(`[dashboard-stats] Customers query failed: ${qErr.code || qErr.message}`);
    result.realCustomers = 0;
  }
  
  return result;
}

/**
 * Query Orders for a date range — returns order count + revenue sum
 */
async function queryOrdersForRange(startDateStr, endDateStr, filterStartMs, filterEndMs) {
  const result = { orders: 0, sales: 0, completed: 0 };

  try {
    // IMPORTANT:
// We intentionally use a single bounded query here instead of full collection scans.
// Final end-date filtering happens in-memory via parseDateToMs().
// This avoids Cloudflare Worker CPU explosions from analytics rebuild-style scans.
const rows = await serverOrderStore.query("Orders", { filters: [
  { field: "Created at", op: "GREATER_THAN_OR_EQUAL", value: startDateStr },
  { field: "Created at", op: "LESS_THAN_OR_EQUAL", value: endDateStr },
] });

    for (const d of rows) {
      try {
        const o = d.data;
        if (!o) continue;
        
        const orderDateMs = parseDateToMs(o['Created at']);
        if (isNaN(orderDateMs) || orderDateMs > filterEndMs) continue;
        if (o['Financial Status'] === 'deleted') continue;
        
        const isAbandoned = o['Financial Status'] === 'abandoned' ||
                            o['Financial Status'] === 'pending_payment' ||
                            (o.Name && o.Name.startsWith('DRAFT-'));
        if (isAbandoned) continue;
        
        result.orders++;
        let total = 0;
        if (o.Total != null) {
          const totalStr = String(o.Total).replace(/[^0-9.\-]/g, '');
          if (totalStr && totalStr !== '-') total = parseFloat(totalStr) || 0;
        }
        result.sales += total;
        result.completed++;
      } catch (err) {
        console.error(`[dashboard-stats] Skipping bad order doc: ${d.id}`, err.message);
        continue;
      }
    }
  } catch (qErr) {
    console.error(`[dashboard-stats] Orders query failed: ${qErr.code || qErr.message}`);
    result.orders = 0;
    result.sales = 0;
    result.completed = 0;
  }
  
  return result;
}

export async function GET(request) {
  // بيانات البيزنس دي للأدمن بس — التحقق على السيرفر (نفس نمط revalidate/delete-image).
  const auth = await verifyAdminIdToken(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'today';

  try {
    // ==========================================
    // 1. Read counters from settings/siteSettings
    //    (Used for 'all' period, not for filtered time periods)
    // ==========================================
    const settingsData = await serverOrderStore.getData("settings", "siteSettings");
    const counters = settingsData ? (settingsData.counters || {}) : {};
    
    const totalVisitors = Number(counters.visitors) || 0;
    const todayVisitors = Number(counters.todayVisitors) || 0;
    const totalOrders = Number(counters.orders) || 0;
    const totalSales = Number(counters.sales) || 0;
    const totalCustomersCount = Number(counters.customers) || 0;

    // ==========================================
    // 2. Compute Cairo date boundaries for this period
    // ==========================================
    const dateParts = getCairoDateStr(new Date()).split('-').map(Number);
    const todayDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0));
    
    const pad = (n) => String(n).padStart(2, '0');
    const formatCairoDate = (d) => {
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    };
    
    let dateFilterStart = null;
    let dateFilterEnd = null;
    let filterStartMs = 0;
    let filterEndMs = 0;

    switch (period) {
      case 'today':
        dateFilterStart = formatCairoDate(todayDate) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(todayDate) + ' 23:59:59';
        break;
      case 'yesterday': {
        const yesterday = new Date(todayDate);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        dateFilterStart = formatCairoDate(yesterday) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(yesterday) + ' 23:59:59';
        break;
      }
      case 'week': {
        const weekAgo = new Date(todayDate);
        weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
        dateFilterStart = formatCairoDate(weekAgo) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(todayDate) + ' 23:59:59';
        break;
      }
      case 'month': {
        const monthStart = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1, 12, 0, 0));
        dateFilterStart = formatCairoDate(monthStart) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(todayDate) + ' 23:59:59';
        break;
      }
      case 'last_month': {
        const firstDay = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() - 1, 1, 12, 0, 0));
        const lastDay = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 0, 12, 0, 0));
        dateFilterStart = formatCairoDate(firstDay) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(lastDay) + ' 23:59:59';
        break;
      }
      case 'custom': {
        if (!startDate || !endDate) {
          return Response.json({ success: false, error: 'مطلوب startDate و endDate' }, { status: 400 });
        }
        dateFilterStart = startDate + ' 00:00:00';
        dateFilterEnd = endDate + ' 23:59:59';
        break;
      }
    }

    if (dateFilterStart && dateFilterEnd) {
      // Parse dates using Date.parse() with explicit UTC interpretation.
      // dateFilterStart/End are already Cairo-midnight strings like "2026-05-24 00:00:00".
      // Replacing space with T and appending Z forces UTC interpretation,
      // which is deterministic regardless of runtime locale (Worker, Edge, Node).
      const startMs = Date.parse(dateFilterStart.replace(' ', 'T') + 'Z');
      const endMs = Date.parse(dateFilterEnd.replace(' ', 'T') + 'Z');
      if (!isNaN(startMs) && !isNaN(endMs)) {
        filterStartMs = startMs;
        filterEndMs = endMs;
      }
    }

    // Compute periodDays
    let periodDays = 0;
    if (dateFilterStart && dateFilterEnd) {
      const s = new Date(dateFilterStart);
      const e = new Date(dateFilterEnd);
      periodDays = Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }

    // ==========================================
    // 3. Compute stats for the requested period
    // ==========================================
    let visitorsForPeriod = 0;
    let customersForPeriod = 0;
    let orderStats = { orders: 0, sales: 0, completed: 0 };

    if (period === 'all') {
      // ALL: Use counters directly — fast, no heavy scans
      visitorsForPeriod = totalVisitors;
      customersForPeriod = totalCustomersCount;
      orderStats.orders = totalOrders;
      orderStats.sales = totalSales;
      orderStats.completed = totalOrders;
      periodDays = Math.max(
        1,
        Math.floor(
          (Date.now() - new Date('2025-12-01T00:00:00Z').getTime()) /
          (1000 * 60 * 60 * 24)
        )
      );
    } else if (period === 'today') {
      // TODAY fast path — 1 read total (counters), no visitor_events scan
      //
      // PATCH: verify counters.todayDate matches today before using todayVisitors.
      // Without this, if rollover hasn't happened yet (no regular visitor since midnight),
      // todayVisitors still holds yesterday's count → wrong Dashboard display.
      //
      // NOTE: This fixes the display only. The root cause remains:
      // rollover depends on the first regular visitor triggering SettingsContext
      // (admin visits are excluded via !isAdmin check).
      // TODO: Move rollover to a server-side scheduled function or a Firestore
      // Transaction in dashboard-stats itself, so it doesn't depend on
      // the first client-side visitor of the day.
      const cairoTodayStr = getCairoDateStr(new Date());
      visitorsForPeriod = counters.todayDate === cairoTodayStr
        ? todayVisitors
        : 0; // rollover not yet triggered — day genuinely started at zero
      periodDays = 1;

      // Orders today: light query with limit — today only
      if (dateFilterStart && filterStartMs && filterEndMs) {
        const startDateOnly = dateFilterStart.split(' ')[0];
        const endDateOnly = dateFilterEnd.split(' ')[0];
        orderStats = await queryOrdersForRange(dateFilterStart, dateFilterEnd, filterStartMs, filterEndMs);
        // Skip customers query for today polling — not needed for real-time display
        customersForPeriod = 0;
      }
    } else {
      // ═══════════════════════════════════════════════════════════
      // ALL FILTERED PERIODS: Use visitor_events as source of truth
      // ═══════════════════════════════════════════════════════════
      // This includes 'today', 'yesterday', 'week', 'month',
      // 'last_month', and 'custom'.
      //
      // CRITICAL: We do NOT use counters.todayVisitors for the 'today'
      // period, because after midnight Cairo time, the counter still
      // holds yesterday's value until the first visitor triggers a
      // rollover. This would cause inflated "today" counts during
      // the gap between midnight and first visitor.
      //
      // visitor_events.date is always correct because it's written
      // with getCairoDateStr() at event creation time, independent
      // of counter rollover logic.
      // ═══════════════════════════════════════════════════════════
      if (dateFilterStart && filterStartMs && filterEndMs) {
        const startDateOnly = dateFilterStart.split(' ')[0];
        const endDateOnly = dateFilterEnd.split(' ')[0];

        // Visitors from visitor_events (accurate for all time filters)
        visitorsForPeriod = await queryVisitorsFromEvents(startDateOnly, endDateOnly);

        // Customers
        const custResult = await queryRealCustomersForRange(dateFilterStart, dateFilterEnd, filterStartMs, filterEndMs);
        customersForPeriod = custResult.realCustomers;

        // Orders & revenue
        orderStats = await queryOrdersForRange(dateFilterStart, dateFilterEnd, filterStartMs, filterEndMs);
      }
    }

    // ==========================================
    // 4. Conversion rate
    // ==========================================
    const conversionRate = (visitorsForPeriod > 0 && orderStats.completed > 0)
      ? parseFloat(((orderStats.completed / visitorsForPeriod) * 100).toFixed(2))
      : 0;

    // ==========================================
    // 5. Period label
    // ==========================================
    // Compute Cairo month name for label
    const monthName = todayDate.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', month: 'long' });

    const periodLabels = {
      all: 'جميع البيانات',
      today: `اليوم — ${formatCairoDate(todayDate)}`,
      yesterday: 'أمس',
      week: 'آخر 7 أيام',
      month: `شهر ${monthName}`,
      last_month: 'الشهر الماضي',
      custom: 'فترة مخصصة'
    };

    // Build dateRange for response
    let dateRangeForResponse = null;
    if (dateFilterStart && dateFilterEnd && period !== 'all') {
      dateRangeForResponse = {
        start: dateFilterStart.split(' ')[0],
        end: dateFilterEnd.split(' ')[0]
      };
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        period,
        periodLabel: periodLabels[period] || period,
        visitors: visitorsForPeriod,
        totalCustomers: customersForPeriod,
        orders: orderStats.orders,
        completedOrders: orderStats.completed,
        sales: parseFloat(orderStats.sales.toFixed(2)),
        conversionRate,
        periodDays,
        dateRange: dateRangeForResponse
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error(`[dashboard-stats] CRITICAL error for period=${searchParams.get('period')}:`, error.name, error.message);
    return Response.json({
      success: false,
      error: 'خطأ في تحميل الإحصائيات',
      data: null
    }, { status: 500 });
  }
}