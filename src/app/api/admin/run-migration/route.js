import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc, orderBy, limit, startAfter, setDoc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // ==========================================
  // 🔥 Migration Script: يحصي الأعداد الحقيقية من Firebase مرة واحدة
  // ويخزنها في settings/siteSettings/counters
  // يعمل مرة واحدة فقط!
  // ==========================================
  try {
    const db = getDb();
    let totalOrders = 0;
    let totalSales = 0;
    let totalCustomers = 0;
    let totalVisitors = 0;
    let lastDoc = null;
    let fetchMore = true;
    
    // ==========================================
    // 1. سحب كل الطلبات من Orders
    // ==========================================
    while (fetchMore) {
      let constraints = [collection(db, "Orders"), limit(500)];
      if (lastDoc) constraints.push(startAfter(lastDoc));
      const snap = await getDocs(query(...constraints));
      
      if (snap.empty) {
        fetchMore = false;
      } else {
        snap.docs.forEach(d => {
          const o = d.data();
          // نستبعد المحذوف
          if (o['Financial Status'] === 'deleted') return;
          
          // نستبعد السلات المتروكة
          const isAbandoned = o['Financial Status'] === 'abandoned' || 
                              o['Financial Status'] === 'pending_payment' || 
                              o.Name?.startsWith('DRAFT-');
          
          if (!isAbandoned) {
            totalOrders++;
            // Total ممكن يكون string أو number
            const total = typeof o.Total === 'string' ? parseFloat(o.Total) || 0 : Number(o.Total) || 0;
            totalSales += total;
          }
        });
        
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 500) fetchMore = false;
      }
    }

    // ==========================================
    // 2. سحب كل العملاء من Customers
    // ==========================================
    fetchMore = true;
    lastDoc = null;
    
    while (fetchMore) {
      let constraints = [collection(db, "Customers"), limit(500)];
      if (lastDoc) constraints.push(startAfter(lastDoc));
      const snap = await getDocs(query(...constraints));
      
      if (snap.empty) {
        fetchMore = false;
      } else {
        totalCustomers += snap.docs.length;
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 500) fetchMore = false;
      }
    }

    // ==========================================
    // 3. جلب العداد الحالي للزوار (محافظ على قيمته)
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const currentCounters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
    totalVisitors = currentCounters.visitors || 0;

    // تحديد تاريخ النهارده لإعداد todayVisitors
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

    // ==========================================
    // 4. تحديث العدادات في Firebase
    // ==========================================
    await setDoc(doc(db, "settings", "siteSettings"), { counters: {
      orders: totalOrders,
      sales: totalSales,
      customers: totalCustomers,
      products: currentCounters.products || 0,
      visitors: totalVisitors,
      todayDate: todayDate,
      todayVisitors: 0,
      yesterdayVisitors: 0
    }}, { merge: true });

    // محاولة تحديث الـ KV cache (تتجاهل الأخطاء في dev mode)
    try {
      const { kvSet } = await import('@/lib/kv-cache');
      await kvSet('site_settings_v1', { counters: {
        orders: totalOrders,
        sales: totalSales,
        customers: totalCustomers,
        products: currentCounters.products || 0,
        visitors: totalVisitors,
        todayDate: todayDate,
        todayVisitors: 0,
        yesterdayVisitors: 0
      }});
    } catch (kvErr) {
      console.log("KV cache update skipped (not available)");
    }

    return Response.json({
      success: true,
      message: `✅ تم تحديث العدادات بنجاح`,
      data: {
        orders: totalOrders,
        sales: totalSales,
        customers: totalCustomers,
        visitors: totalVisitors
      }
    });

  } catch (error) {
    console.error("Migration Error:", error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}