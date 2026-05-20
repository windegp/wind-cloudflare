import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

/**
 * تحويل أي تنسيق تاريخ إلى milliseconds
 * تدعم: US locale "5/19/2026, 8:44:50 PM", Shopify "2025-11-29 07:22:28 +0200"
 * تدعم: Firebase Timestamp, ISO string
 */
function parseDateToMs(rawDate) {
  if (!rawDate) return NaN;
  if (typeof rawDate.toDate === 'function') return rawDate.toDate().getTime();
  if (rawDate instanceof Date) return rawDate.getTime();
  if (typeof rawDate !== 'string') return NaN;
  
  const ms = Date.parse(rawDate);
  if (!isNaN(ms)) return ms;
  
  const usMatch = rawDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (usMatch) {
    let [_, month, day, year, hours, minutes, seconds, ampm] = usMatch;
    hours = parseInt(hours);
    if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return new Date(parseInt(year), parseInt(month)-1, parseInt(day), hours, parseInt(minutes), parseInt(seconds)).getTime();
  }
  
  const withT = rawDate.replace(' ', 'T').split('+')[0].trim();
  const ms2 = Date.parse(withT);
  if (!isNaN(ms2)) return ms2;
  
  return NaN;
}

/**
 * استعلام واحد على Customers — يحسب الزوار والعملاء الحقيقيين معاً
 * لمنع التكرار (كانت 2 queried منفصلتين)
 */
async function countVisitorsAndCustomers(db, dateFilterStart, filterEndMs) {
  const result = { visitors: 0, realCustomers: 0 };
  
  try {
    const customersSnap = await getDocs(query(
      collection(db, "Customers"),
      where("last_active", ">=", dateFilterStart)
    ));
    
    const uniqueVisitors = new Map();
    const realCustomers = new Map();
    
    for (const d of customersSnap.docs) {
      try {
        const c = d.data();
        if (!c) continue;
        
        const custDateMs = parseDateToMs(c.last_active);
        if (isNaN(custDateMs) || custDateMs > filterEndMs) continue;
        
        const email = (c.Email || c.email || '').toLowerCase().trim();
        const phone = String(c.Phone || c['Default Address Phone'] || '').replace(/[^0-9]/g, '');
        const uniqueId = email || phone || d.id;
        
        // All = visitor
        if (!uniqueVisitors.has(uniqueId)) uniqueVisitors.set(uniqueId, true);
        
        // Real customer check
        const hasOrders = Number(c['Total Orders'] || 0) > 0;
        const hasAbandoned = c.hasAbandoned === true || (c.segments && c.segments.includes('Abandoned_Checkout'));
        
        if ((email || phone) && (hasOrders || hasAbandoned)) {
          if (!realCustomers.has(uniqueId)) realCustomers.set(uniqueId, true);
        }
      } catch (docErr) {
        console.error(`[dashboard-stats] Skipping bad customer doc: ${d.id}`, docErr.message);
        continue;
      }
    }
    
    result.visitors = uniqueVisitors.size;
    result.realCustomers = realCustomers.size;
  } catch (qErr) {
    console.error(`[dashboard-stats] Customers query failed: ${qErr.code || qErr.message}`, 
      qErr.message);
    // Graceful fallback
    result.visitors = 0;
    result.realCustomers = 0;
  }
  
  return result;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'today';

  try {
    const db = getDb();
    
    // ==========================================
    // 1. عدادات Firebase
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const counters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};

    const totalVisitors = Number(counters.visitors) || 0;
    const todayVisitors = Number(counters.todayVisitors) || 0;
    const yesterdayVisitors = Number(counters.yesterdayVisitors) || 0;
    const totalOrders = Number(counters.orders) || 0;
    const totalSales = Number(counters.sales) || 0;
    const totalCustomersCount = Number(counters.customers) || 0;

    const now = new Date();
    const nowCairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const pad = (n) => String(n).padStart(2, '0');
    const formatCairoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    // ==========================================
    // 2. نطاق التاريخ لكل فترة
    // ==========================================
    let dateFilterStart = null;
    let dateFilterEnd = null;
    let filterStartMs = 0;
    let filterEndMs = 0;

    switch (period) {
      case 'today':
        dateFilterStart = formatCairoDate(nowCairo) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(nowCairo) + ' 23:59:59';
        break;
      case 'yesterday': {
        const yesterday = new Date(nowCairo);
        yesterday.setDate(yesterday.getDate() - 1);
        dateFilterStart = formatCairoDate(yesterday) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(yesterday) + ' 23:59:59';
        break;
      }
      case 'week': {
        const weekAgo = new Date(nowCairo);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilterStart = formatCairoDate(weekAgo) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(nowCairo) + ' 23:59:59';
        break;
      }
      case 'month': {
        const monthStart = new Date(nowCairo.getFullYear(), nowCairo.getMonth(), 1);
        dateFilterStart = formatCairoDate(monthStart) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(nowCairo) + ' 23:59:59';
        break;
      }
      case 'last_month': {
        const firstDay = new Date(nowCairo.getFullYear(), nowCairo.getMonth() - 1, 1);
        const lastDay = new Date(nowCairo.getFullYear(), nowCairo.getMonth(), 0);
        dateFilterStart = formatCairoDate(firstDay) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(lastDay) + ' 23:59:59';
        break;
      }
      case 'custom': {
        if (!startDate || !endDate) {
          console.warn("[dashboard-stats] Custom period missing startDate/endDate");
          return Response.json({ success: false, error: 'مطلوب startDate و endDate' }, { status: 400 });
        }
        dateFilterStart = startDate + ' 00:00:00';
        dateFilterEnd = endDate + ' 23:59:59';
        break;
      }
      default:
        console.warn(`[dashboard-stats] Unknown period: ${period}, defaulting to all`);
        break;
    }

    if (dateFilterStart && dateFilterEnd) {
      filterStartMs = Date.parse(dateFilterStart.replace(' ', 'T'));
      filterEndMs = Date.parse(dateFilterEnd.replace(' ', 'T'));
      if (isNaN(filterStartMs) || isNaN(filterEndMs)) {
        console.warn("[dashboard-stats] Failed to parse date boundaries, using fallback");
        filterStartMs = 0; 
        filterEndMs = Date.now();
      }
    }

    let periodDays = 0;
    if (dateFilterStart && dateFilterEnd) {
      const s = new Date(dateFilterStart);
      const e = new Date(dateFilterEnd);
      periodDays = Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }

    // ==========================================
    // 3. حساب الزوار — استعلام واحد لكل الفترات
    // ==========================================
    let visitorsForPeriod = 0;
    let totalCustomers = 0;

    if (period === 'all') {
      visitorsForPeriod = totalVisitors;
      totalCustomers = totalCustomersCount;
    } else if (period === 'today') {
      visitorsForPeriod = todayVisitors;
      // Today customers: query real data (single scan)
      const todayResult = await countVisitorsAndCustomers(db, dateFilterStart, filterEndMs);
      totalCustomers = todayResult.realCustomers;
    } else if (period === 'yesterday') {
      visitorsForPeriod = yesterdayVisitors;
      // Fallback: لو yesterdayVisitors صفر، نجيب من الاستعلام
      if (yesterdayVisitors === 0 && dateFilterStart && dateFilterEnd) {
        const yesterdayResult = await countVisitorsAndCustomers(db, dateFilterStart, filterEndMs);
        visitorsForPeriod = yesterdayResult.visitors;
        totalCustomers = yesterdayResult.realCustomers;
      } else {
        const yesterdayResult = await countVisitorsAndCustomers(db, dateFilterStart, filterEndMs);
        totalCustomers = yesterdayResult.realCustomers;
      }
    } else if (period === 'last_month') {
      const result = await countVisitorsAndCustomers(db, dateFilterStart, filterEndMs);
      visitorsForPeriod = result.visitors;
      totalCustomers = result.realCustomers;
    } else if (period === 'custom') {
      const DEC_START_MS = new Date('2025-12-01T00:00:00+02:00').getTime();
      const FEB_28_MS = new Date('2026-02-28T23:59:59+02:00').getTime();
      const isOverlappingHistorical = filterStartMs <= FEB_28_MS && filterEndMs >= DEC_START_MS;

      if (isOverlappingHistorical) {
        const effectiveStart = Math.max(DEC_START_MS, filterStartMs);
        const effectiveEnd = Math.min(FEB_28_MS, filterEndMs);
        const historicalDays = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);
        visitorsForPeriod = Math.round((historicalDays / 90) * 30000);
        const custResult = await countVisitorsAndCustomers(db, dateFilterStart, filterEndMs);
        totalCustomers = custResult.realCustomers;
      } else {
        const result = await countVisitorsAndCustomers(db, dateFilterStart, filterEndMs);
        visitorsForPeriod = result.visitors;
        totalCustomers = result.realCustomers;
      }
    } else {
      // week, month: استعلام إلى نهاية أمس + todayVisitors
      const yesterdayDate = new Date(nowCairo);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayEndStr = formatCairoDate(yesterdayDate) + ' 23:59:59';
      const yesterdayEndMs = Date.parse(yesterdayEndStr.replace(' ', 'T'));
      
      const result = await countVisitorsAndCustomers(db, dateFilterStart, yesterdayEndMs);
      visitorsForPeriod = result.visitors + todayVisitors;
      totalCustomers = result.realCustomers;
    }

    // ==========================================
    // 4. حساب الطلبات
    // ==========================================
    let orderStats = { orders: 0, sales: 0, completed: 0 };

    if (period === 'all') {
      orderStats.orders = totalOrders;
      orderStats.sales = totalSales;
      orderStats.completed = totalOrders;
    } else if (dateFilterStart && dateFilterEnd) {
      try {
        const ordersSnap = await getDocs(query(
          collection(db, "Orders"),
          where("Created at", ">=", dateFilterStart)
        ));
        
        let processedCount = 0;
        for (const d of ordersSnap.docs) {
          try {
            const o = d.data();
            if (!o) continue;
            
            const orderDateMs = parseDateToMs(o['Created at']);
            if (isNaN(orderDateMs) || orderDateMs > filterEndMs) continue;
            if (o['Financial Status'] === 'deleted') continue;
            
            const isAbandoned = o['Financial Status'] === 'abandoned' || 
                                o['Financial Status'] === 'pending_payment' || 
                                (o.Name && o.Name.startsWith('DRAFT-'));
            if (isAbandoned) continue;
            
            orderStats.orders++;
            let total = 0;
            if (o.Total != null) {
              const totalStr = String(o.Total).replace(/[^0-9.\-]/g, '');
              if (totalStr && totalStr !== '-') total = parseFloat(totalStr) || 0;
            }
            orderStats.sales += total;
            orderStats.completed++;
            processedCount++;
          } catch (docErr) {
            console.error(`[dashboard-stats] Skipping bad order doc: ${d.id}`, docErr.message);
            continue;
          }
        }
        console.log(`[dashboard-stats] Orders query: ${processedCount} orders processed for ${period}`);
      } catch (qErr) {
        console.error(`[dashboard-stats] Orders query failed for ${period}:`, 
          qErr.code || 'QUERY_ERROR', qErr.message);
        orderStats = { orders: 0, sales: 0, completed: 0 };
      }
    }

    // ==========================================
    // 5. معدل التحويل
    // ==========================================
    const conversionRate = (visitorsForPeriod > 0 && orderStats.completed > 0)
      ? ((orderStats.completed / visitorsForPeriod) * 100)
      : 0;

    // ==========================================
    // 6. تسمية الفترة
    // ==========================================
    const periodLabels = {
      all: 'جميع البيانات',
      today: `اليوم — ${formatCairoDate(nowCairo)}`,
      yesterday: 'أمس',
      week: 'آخر 7 أيام',
      month: `شهر ${nowCairo.toLocaleString('ar-EG', { month: 'long' })}`,
      last_month: 'الشهر الماضي',
      custom: 'فترة مخصصة'
    };

    return Response.json({
      success: true,
      data: {
        period,
        periodLabel: periodLabels[period] || period,
        visitors: visitorsForPeriod,
        totalCustomers,
        orders: orderStats.orders,
        completedOrders: orderStats.completed,
        sales: parseFloat(orderStats.sales.toFixed(2)),
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        periodDays,
        dateRange: dateFilterStart && dateFilterEnd
          ? { start: dateFilterStart.split(' ')[0], end: dateFilterEnd.split(' ')[0] }
          : null
      }
    });

  } catch (error) {
    console.error(`[dashboard-stats] CRITICAL error for period=${searchParams.get('period')}:`, 
      error.name, error.message, error.stack?.split('\n')[0]);
    
    // Graceful fallback: return counters data only
    return Response.json({ 
      success: false, 
      error: 'خطأ في تحميل الإحصائيات، يرجى المحاولة مرة أخرى',
      data: null 
    }, { status: 500 });
  }
}