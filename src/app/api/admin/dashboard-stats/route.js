import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc, orderBy, limit } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'all'; // all, today, week, month, last_month, custom

  try {
    const db = getDb();

    // ==========================================
    // 1. جلب إعدادات العدادات العامة
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const counters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
    const totalVisitors = 30000; // يدوي: إجمالي الزوار من ديسمبر 2025 لفبراير 2026

    // إجمالي الأيام من ديسمبر 2025 لفبراير 2026
    const totalDaysInData = 90; // Dec(31) + Jan(31) + Feb(28) = 90

    // ==========================================
    // 2. تحديد نطاق التاريخ
    // ==========================================
    let dateFilterStart = null;
    let dateFilterEnd = null;

    const now = new Date();
    const nowCairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const formatCairoDate = (d) => d.toLocaleString('en-US', { 
      timeZone: 'Africa/Cairo', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).split('/').reverse().join('-');

    switch (period) {
      case 'today':
        dateFilterStart = formatCairoDate(nowCairo) + ' 00:00:00';
        dateFilterEnd = nowCairo.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
        break;
      case 'week': {
        const weekAgo = new Date(nowCairo);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilterStart = formatCairoDate(weekAgo) + ' 00:00:00';
        dateFilterEnd = nowCairo.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
        break;
      }
      case 'month': {
        const monthStart = new Date(nowCairo.getFullYear(), nowCairo.getMonth(), 1);
        dateFilterStart = formatCairoDate(monthStart) + ' 00:00:00';
        dateFilterEnd = nowCairo.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
        break;
      }
      case 'last_month': {
        const firstDayLastMonth = new Date(nowCairo.getFullYear(), nowCairo.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(nowCairo.getFullYear(), nowCairo.getMonth(), 0);
        dateFilterStart = formatCairoDate(firstDayLastMonth) + ' 00:00:00';
        dateFilterEnd = formatCairoDate(lastDayLastMonth) + ' 23:59:59';
        break;
      }
      case 'custom': {
        if (!startDate || !endDate) {
          return Response.json({ success: false, error: 'مطلوب startDate و endDate للفترة المخصصة' }, { status: 400 });
        }
        dateFilterStart = startDate + ' 00:00:00';
        dateFilterEnd = endDate + ' 23:59:59';
        break;
      }
      default: // 'all'
        break;
    }

    // ==========================================
    // 3. حساب عدد الأيام في الفترة (للتوزيع التناسبي للزوار)
    // ==========================================
    let periodDays = totalDaysInData;
    if (dateFilterStart && dateFilterEnd) {
      const start = new Date(dateFilterStart);
      const end = new Date(dateFilterEnd);
      periodDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    }

    // توزيع تناسبي للزوار حسب الفترة
    const visitorsForPeriod = period === 'all' ? totalVisitors : Math.round((periodDays / totalDaysInData) * totalVisitors);

    // ==========================================
    // 4. حساب إحصائيات الطلبات حسب الفترة
    // ==========================================
    let orderStats = { orders: 0, sales: 0, completed: 0 };

    if (period === 'all') {
      // الفترة "الكل": نستخدم العدادات العامة (0 قراءات)
      orderStats.orders = counters.orders || 0;
      orderStats.sales = counters.sales || 0;
      orderStats.completed = counters.orders || 0; // تقريبي
    } else {
      // الفترة المحددة: نسحب الطلبات في النطاق الزمني
      const ordersQuery = query(
        collection(db, "Orders"),
        where("Created at", ">=", dateFilterStart),
        where("Created at", "<=", dateFilterEnd)
      );
      
      const ordersSnap = await getDocs(ordersQuery);
      
      ordersSnap.docs.forEach(doc => {
        const o = doc.data();
        if (o['Financial Status'] === 'deleted') return;

        const isAbandoned = o['Financial Status'] === 'abandoned' || 
                            o['Financial Status'] === 'pending_payment' || 
                            o.Name?.startsWith('DRAFT-');

        if (!isAbandoned) {
          orderStats.orders++;
          orderStats.sales += Number(o.Total || 0);
          orderStats.completed++;
        }
      });
    }

    // ==========================================
    // 5. حساب عدد العملاء (Customers) حسب الفترة
    // ==========================================
    let totalCustomers = 0;

    if (period === 'all') {
      totalCustomers = counters.customers || 0;
    } else {
      // نسحب العملاء اللي last_active في الفترة
      const customersQuery = query(
        collection(db, "Customers"),
        where("last_active", ">=", dateFilterStart),
        where("last_active", "<=", dateFilterEnd)
      );
      
      const customersSnap = await getDocs(customersQuery);
      const uniqueCustomers = new Map();

      customersSnap.docs.forEach(doc => {
        const c = doc.data();
        const email = (c.Email || c.email || '').toLowerCase().trim();
        const rawPhone = c.Phone || c['Default Address Phone'] || '';
        const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
        const uniqueId = email || cleanPhone || doc.id;
        
        if (!uniqueCustomers.has(uniqueId)) {
          uniqueCustomers.set(uniqueId, true);
        }
      });

      totalCustomers = uniqueCustomers.size;
    }

    // ==========================================
    // 6. حساب معدل التحويل
    // ==========================================
    const conversionRate = visitorsForPeriod > 0 
      ? ((orderStats.completed / visitorsForPeriod) * 100) 
      : 0;

    return Response.json({
      success: true,
      data: {
        period,
        visitors: visitorsForPeriod,
        totalCustomers,
        orders: orderStats.orders,
        completedOrders: orderStats.completed,
        sales: orderStats.sales,
        conversionRate: Math.round(conversionRate * 100) / 100,
        periodDays,
        dateRange: dateFilterStart && dateFilterEnd 
          ? { start: dateFilterStart, end: dateFilterEnd } 
          : null
      }
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return Response.json({ 
      success: false, 
      error: error.message,
      data: null 
    }, { status: 500 });
  }
}