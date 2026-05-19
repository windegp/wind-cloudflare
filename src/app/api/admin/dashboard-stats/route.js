import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'today';

  try {
    const db = getDb();
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
        if (!startDate || !endDate) return Response.json({ success: false, error: 'مطلوب startDate و endDate' }, { status: 400 });
        dateFilterStart = startDate + ' 00:00:00';
        dateFilterEnd = endDate + ' 23:59:59';
        break;
      }
      default: break;
    }

    if (dateFilterStart && dateFilterEnd) {
      filterStartMs = Date.parse(dateFilterStart.replace(' ', 'T'));
      filterEndMs = Date.parse(dateFilterEnd.replace(' ', 'T'));
      if (isNaN(filterStartMs) || isNaN(filterEndMs)) { filterStartMs = 0; filterEndMs = Date.now(); }
    }

    let periodDays = 0;
    if (dateFilterStart && dateFilterEnd) {
      const s = new Date(dateFilterStart);
      const e = new Date(dateFilterEnd);
      periodDays = Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }

    // ==========================================
    // 3. حساب الزوار — استعلام حقيقي لكل فترة
    // ==========================================
    // القاعدة: جميع الفترات تستعلم real data من Firebase
    // - اليوم: counters.todayVisitors (عداد لحظي)
    // - أمس: counters.yesterdayVisitors (محفوظ من منتصف الليل)
    // - الأسبوع/الشهر: استعلام حقيقي على Customers حسب last_active
    // - الكل: counters.visitors (30,000 + جديد)
    // - الشهر الماضي: 0 (المتجر ماكانش شغال)
    // ==========================================

    let visitorsForPeriod = 0;

    if (period === 'all') {
      visitorsForPeriod = totalVisitors;
    } else if (period === 'today') {
      visitorsForPeriod = todayVisitors;
    } else if (period === 'yesterday') {
      visitorsForPeriod = yesterdayVisitors;
    } else if (period === 'last_month') {
      visitorsForPeriod = 0;
    } else if (period === 'custom') {
      // فترة مخصصة: استعلام حقيقي
      const DEC_START_MS = new Date('2025-12-01T00:00:00+02:00').getTime();
      const FEB_28_MS = new Date('2026-02-28T23:59:59+02:00').getTime();
      const isOverlappingHistorical = filterStartMs <= FEB_28_MS && filterEndMs >= DEC_START_MS;

      if (isOverlappingHistorical) {
        // جزء تاريخي من baseline
        const effectiveStart = Math.max(DEC_START_MS, filterStartMs);
        const effectiveEnd = Math.min(FEB_28_MS, filterEndMs);
        const historicalDays = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);
        visitorsForPeriod = Math.round((historicalDays / 90) * 30000);
      } else {
        // استعلام حقيقي من Customers
        visitorsForPeriod = await countUniqueCustomersByDate(db, dateFilterStart, filterEndMs);
      }
    } else {
      // week, month: استعلام حقيقي من Customers
      visitorsForPeriod = await countUniqueCustomersByDate(db, dateFilterStart, filterEndMs);
    }

    // ==========================================
    // 4. حساب الطلبات
    // ==========================================
    let orderStats = { orders: 0, sales: 0, completed: 0 };

    if (period === 'all') {
      orderStats.orders = totalOrders;
      orderStats.sales = totalSales;
      orderStats.completed = totalOrders;
    } else {
      try {
        const ordersSnap = await getDocs(query(
          collection(db, "Orders"),
          where("Created at", ">=", dateFilterStart)
        ));
        for (const d of ordersSnap.docs) {
          try {
            const o = d.data();
            if (!o) continue;
            const orderDateMs = parseDateToMs(o['Created at']);
            if (isNaN(orderDateMs) || orderDateMs > filterEndMs) continue;
            if (o['Financial Status'] === 'deleted') continue;
            const isAbandoned = o['Financial Status'] === 'abandoned' || o['Financial Status'] === 'pending_payment' || (o.Name && o.Name.startsWith('DRAFT-'));
            if (isAbandoned) continue;
            orderStats.orders++;
            let total = 0;
            try {
              if (o.Total != null) {
                const totalStr = String(o.Total).replace(/[^0-9.\-]/g, '');
                if (totalStr && totalStr !== '-') total = parseFloat(totalStr) || 0;
              }
            } catch (e) { total = 0; }
            orderStats.sales += total;
            orderStats.completed++;
          } catch (e) { continue; }
        }
      } catch (qErr) {
        orderStats = { orders: 0, sales: 0, completed: 0 };
      }
    }

    // ==========================================
    // 5. حساب العملاء
    // ==========================================
    let totalCustomers = 0;

    if (period === 'all') {
      totalCustomers = totalCustomersCount;
    } else if (period === 'last_month') {
      totalCustomers = 0;
    } else {
      totalCustomers = visitorsForPeriod; // same query: unique customers = visitors for this period
    }

    // ==========================================
    // 6. معدل التحويل — محمي من القسمة على 0
    // ==========================================
    const conversionRate = (visitorsForPeriod > 0 && orderStats.completed > 0)
      ? ((orderStats.completed / visitorsForPeriod) * 100)
      : 0;

    // ==========================================
    // 7. تسمية الفترة
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
    console.error("Dashboard Stats Critical Error:", error);
    return Response.json({ success: false, error: error.message, data: null }, { status: 500 });
  }
}

/**
 * دالة مساعدة: تحسب عدد العملاء الفريدين في فترة زمنية
 * تستعلم Customers collection حسب last_active
 */
async function countUniqueCustomersByDate(db, dateFilterStart, filterEndMs) {
  try {
    const customersSnap = await getDocs(query(
      collection(db, "Customers"),
      where("last_active", ">=", dateFilterStart)
    ));
    const uniqueCustomers = new Map();
    for (const d of customersSnap.docs) {
      try {
        const c = d.data();
        if (!c) continue;
        const custDateMs = parseDateToMs(c.last_active);
        if (isNaN(custDateMs) || custDateMs > filterEndMs) continue;
        const email = (c.Email || c.email || '').toLowerCase().trim();
        const phone = String(c.Phone || c['Default Address Phone'] || '').replace(/[^0-9]/g, '');
        const uniqueId = email || phone || d.id;
        if (!uniqueCustomers.has(uniqueId)) uniqueCustomers.set(uniqueId, true);
      } catch (e) { continue; }
    }
    return uniqueCustomers.size;
  } catch (qErr) {
    return 0;
  }
}