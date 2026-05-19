import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc, orderBy } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'today'; // today, week, month, last_month, custom, all

  try {
    const db = getDb();

    // ==========================================
    // 1. جلب إعدادات العدادات العامة
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const counters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};

    // ==========================================
    // 2. تحديد نطاق التاريخ
    // ==========================================
    let dateFilterStart = null;
    let dateFilterEnd = null;

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
    // 3. حساب عدد الأيام في الفترة
    // ==========================================
    const totalDaysInData = 90; // Dec(31) + Jan(31) + Feb(28)
    let periodDays = totalDaysInData;
    if (dateFilterStart && dateFilterEnd) {
      const start = new Date(dateFilterStart);
      const end = new Date(dateFilterEnd);
      periodDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }

    // ==========================================
    // 4. حساب إحصائيات الطلبات
    // ==========================================
    let orderStats = { orders: 0, sales: 0, completed: 0 };

    if (period === 'all') {
      orderStats.orders = counters.orders || 0;
      orderStats.sales = Number(counters.sales) || 0;
      orderStats.completed = counters.orders || 0;
    } else {
      const ordersQuery = query(
        collection(db, "Orders"),
        where("Created at", ">=", dateFilterStart),
        orderBy("Created at", "asc")
      );
      
      const ordersSnap = await getDocs(ordersQuery);
      
      ordersSnap.docs.forEach(doc => {
        const o = d.data();
        
        // تحقق من انتهاء التاريخ
        const orderDate = o['Created at'] || '';
        if (orderDate > dateFilterEnd) return;
        
        if (o['Financial Status'] === 'deleted') return;
        const isAbandoned = o['Financial Status'] === 'abandoned' || 
                            o['Financial Status'] === 'pending_payment' || 
                            o.Name?.startsWith('DRAFT-');
        if (!isAbandoned) {
          orderStats.orders++;
          const total = typeof o.Total === 'string' ? parseFloat(o.Total) || 0 : Number(o.Total) || 0;
          orderStats.sales += total;
          orderStats.completed++;
        }
      });
    }

    // ==========================================
    // 5. حساب عدد العملاء
    // ==========================================
    let totalCustomers = 0;

    if (period === 'all') {
      totalCustomers = counters.customers || 0;
    } else {
      const customersQuery = query(
        collection(db, "Customers"),
        where("last_active", ">=", dateFilterStart),
        orderBy("last_active", "asc")
      );
      
      const customersSnap = await getDocs(customersQuery);
      const uniqueCustomers = new Map();

      customersSnap.docs.forEach(doc => {
        const c = d.data();
        const custDate = c.last_active || '';
        if (custDate > dateFilterEnd) return;
        
        const email = (c.Email || c.email || '').toLowerCase().trim();
        const phone = String(c.Phone || c['Default Address Phone'] || '').replace(/[^0-9]/g, '');
        const uniqueId = email || phone || doc.id;
        if (!uniqueCustomers.has(uniqueId)) {
          uniqueCustomers.set(uniqueId, true);
        }
      });
      totalCustomers = uniqueCustomers.size;
    }

    // ==========================================
    // 6. حساب الزوار التقديريين
    // ==========================================
    // الكل => 30000 يدوي
    // الفترات الفرعية => توزيع تناسبي
    const totalVisitors = 30000;
    const visitorsForPeriod = period === 'all' ? totalVisitors : Math.round((periodDays / totalDaysInData) * totalVisitors);

    // ==========================================
    // 7. معدل التحويل
    // ==========================================
    const conversionRate = visitorsForPeriod > 0 
      ? ((orderStats.completed / visitorsForPeriod) * 100) 
      : 0;

    // ==========================================
    // 8. تسمية الفترة
    // ==========================================
    const periodLabels = {
      all: 'جميع البيانات (منذ ديسمبر 2025)',
      today: `اليوم — ${formatCairoDate(nowCairo)}`,
      week: `آخر 7 أيام`,
      month: `شهر ${nowCairo.toLocaleString('ar-EG', { month: 'long' })}`,
      last_month: `الشهر الماضي`,
      custom: `فترة مخصصة`
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