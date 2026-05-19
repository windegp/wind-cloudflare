import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

/**
 * تحويل أي تنسيق تاريخ إلى milliseconds
 */
function parseDateToMs(rawDate) {
  if (!rawDate) return NaN;
  if (typeof rawDate.toDate === 'function') return rawDate.toDate().getTime();
  if (rawDate instanceof Date) return rawDate.getTime();
  if (typeof rawDate !== 'string') return NaN;
  
  const ms = Date.parse(rawDate);
  if (!isNaN(ms)) return ms;
  
  // US locale: "5/19/2026, 8:44:50 PM"
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

    // ==========================================
    // 1. العدادات العامة من Firebase
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const counters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
    
    const totalVisitors = Number(counters.visitors) || 0;
    const BASELINE_VISITORS = 30000;

    // ==========================================
    // 2. نطاق التاريخ
    // ==========================================
    let dateFilterStart = null;
    let dateFilterEnd = null;
    let filterStartMs = 0;
    let filterEndMs = 0;

    const now = new Date();
    const nowCairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const pad = (n) => String(n).padStart(2, '0');
    const formatCairoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    switch (period) {
      case 'today':
        dateFilterStart = formatCairoDate(nowCairo) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(nowCairo) + ' 23:59:59';
        break;
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
          return Response.json({ success: false, error: 'مطلوب startDate و endDate' }, { status: 400 });
        }
        dateFilterStart = startDate + ' 00:00:00';
        dateFilterEnd = endDate + ' 23:59:59';
        break;
      }
      default: break; // 'all'
    }

    // تحويل حدود التاريخ إلى ms
    if (dateFilterStart && dateFilterEnd) {
      filterStartMs = Date.parse(dateFilterStart.replace(' ', 'T'));
      filterEndMs = Date.parse(dateFilterEnd.replace(' ', 'T'));
      if (isNaN(filterStartMs) || isNaN(filterEndMs)) {
        filterStartMs = 0;
        filterEndMs = Date.now();
      }
    }

    // ==========================================
    // 3. حساب الأيام
    // ==========================================
    let periodDays = 0;
    if (dateFilterStart && dateFilterEnd) {
      const s = new Date(dateFilterStart);
      const e = new Date(dateFilterEnd);
      periodDays = Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }

    // ==========================================
    // 4. حساب الزوار — قواعد صارمة
    // ==========================================
    // القاعدة: اليوم/الأسبوع/الشهر = 0 زائر (نقي، لا historical bleed)
    // الكل = counters.visitors (30,000 + الجدد)
    // فترة مخصصة: لو فيها Dec-Feb => count visitors from baseline + proportional, غير كدة = 0
    // ==========================================
    const FEB_28_2026 = new Date('2026-02-28T23:59:59+02:00').getTime();
    const isPureRealTime = period === 'today' || period === 'week' || period === 'month' || period === 'last_month';

    let visitorsForPeriod = 0;

    if (period === 'all') {
      // الكل = 30,000 + أي زوار جدد (من counters.visitors)
      visitorsForPeriod = totalVisitors;
    } else if (period === 'custom') {
      // تحقق: هل الفترة تشمل ديسمبر-فبراير؟
      if (filterStartMs <= FEB_28_2026) {
        // الفترة فيها حصة من الـ 30,000 historical baseline
        // نحسب عدد الأيام في ديسمبر-فبراير ضمن الفترة
        const decStart = new Date('2025-12-01T00:00:00+02:00').getTime();
        const febEnd = new Date('2026-02-28T23:59:59+02:00').getTime();
        const effectiveStart = Math.max(decStart, filterStartMs);
        const effectiveEnd = Math.min(febEnd, filterEndMs);
        const historicalDays = Math.max(0, Math.ceil((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);
        visitorsForPeriod = Math.round((historicalDays / 90) * BASELINE_VISITORS);
      } else {
        // الفترة بعد فبراير بالكامل: 0 زائر (نقي)
        visitorsForPeriod = 0;
      }
    } else {
      // اليوم/الأسبوع/الشهر/الشهر_الماضي: 0 زائر — لا historical data bleed
      visitorsForPeriod = 0;
    }

    // ==========================================
    // 5. حساب الطلبات
    // ==========================================
    let orderStats = { orders: 0, sales: 0, completed: 0 };

    if (period === 'all') {
      // الكل: يقرأ العدادات (بعد الـ Migration تشمل الـ Shopify baseline + الجدد)
      orderStats.orders = Number(counters.orders) || 0;
      orderStats.sales = Number(counters.sales) || 0;
      orderStats.completed = Number(counters.orders) || 0;
    } else {
      // كل الفترات التانية: استعلام حقيقي من Firebase
      try {
        const ordersQuery = query(
          collection(db, "Orders"),
          where("Created at", ">=", dateFilterStart)
        );
        
        const ordersSnap = await getDocs(ordersQuery);
        
        for (const docSnap of ordersSnap.docs) {
          try {
            const o = docSnap.data();
            if (!o) continue;
            
            const orderDateMs = parseDateToMs(o['Created at']);
            if (isNaN(orderDateMs)) continue;
            if (orderDateMs > filterEndMs) continue;
            if (o['Financial Status'] === 'deleted') continue;
            
            const isAbandoned = o['Financial Status'] === 'abandoned' || 
                                o['Financial Status'] === 'pending_payment' || 
                                (o.Name && o.Name.startsWith('DRAFT-'));
            
            if (!isAbandoned) {
              orderStats.orders++;
              let total = 0;
              try {
                if (o.Total != null) {
                  const totalStr = String(o.Total).replace(/[^0-9.\-]/g, '');
                  if (totalStr) total = parseFloat(totalStr) || 0;
                }
              } catch (e) { total = 0; }
              orderStats.sales += total;
              orderStats.completed++;
            }
          } catch (docErr) { continue; }
        }
      } catch (qErr) {
        console.error("Orders query failed:", qErr.message);
        orderStats = { orders: 0, sales: 0, completed: 0 };
      }
    }

    // ==========================================
    // 6. حساب العملاء
    // ==========================================
    let totalCustomers = 0;

    if (period === 'all') {
      totalCustomers = Number(counters.customers) || 0;
    } else {
      try {
        const customersQuery = query(
          collection(db, "Customers"),
          where("last_active", ">=", dateFilterStart)
        );
        
        const customersSnap = await getDocs(customersQuery);
        const uniqueCustomers = new Map();

        for (const docSnap of customersSnap.docs) {
          try {
            const c = docSnap.data();
            if (!c) continue;
            
            const custDateMs = parseDateToMs(c.last_active);
            if (isNaN(custDateMs)) continue;
            if (custDateMs > filterEndMs) continue;
            
            const email = (c.Email || c.email || '').toLowerCase().trim();
            const phone = String(c.Phone || c['Default Address Phone'] || '').replace(/[^0-9]/g, '');
            const uniqueId = email || phone || docSnap.id;
            if (!uniqueCustomers.has(uniqueId)) {
              uniqueCustomers.set(uniqueId, true);
            }
          } catch (custErr) { continue; }
        }
        totalCustomers = uniqueCustomers.size;
      } catch (qErr) {
        totalCustomers = 0;
      }
    }

    // ==========================================
    // 7. معدل التحويل
    // ==========================================
    // CR = (completedOrders / visitors) × 100
    // لو visitors = 0 و completedOrders = 0 => 0%
    const conversionRate = visitorsForPeriod > 0 
      ? ((orderStats.completed / visitorsForPeriod) * 100) 
      : 0;

    // ==========================================
    // 8. تسمية الفترة
    // ==========================================
    const periodLabels = {
      all: 'جميع البيانات',
      today: `اليوم — ${formatCairoDate(nowCairo)}`,
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
        sales: Math.round(orderStats.sales * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
        periodDays,
        dateRange: dateFilterStart && dateFilterEnd 
          ? { start: dateFilterStart.split(' ')[0], end: dateFilterEnd.split(' ')[0] } 
          : null,
        isPureRealTime: isPureRealTime
      }
    });

  } catch (error) {
    console.error("Dashboard Stats Critical Error:", error);
    return Response.json({ 
      success: false, 
      error: error.message,
      data: null 
    }, { status: 500 });
  }
}