import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, getDoc, doc, startAfter, limit, setDoc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // ==========================================
  // 🔥 Migration Script: يحصي الأعداد الحقيقية من Firebase مرة واحدة
  // ويخزنها في settings/siteSettings/counters بشكل آمن
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
          if (o['Financial Status'] === 'deleted') return;
          
          const isAbandoned = o['Financial Status'] === 'abandoned' || 
                              o['Financial Status'] === 'pending_payment' || 
                              o.Name?.startsWith('DRAFT-');
          
          if (!isAbandoned) {
            totalOrders++;
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
    // 3. جلب العداد الحالي للزوار
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const currentCounters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
    totalVisitors = currentCounters.visitors || 0;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

    // ==========================================
    // 4. تحديث العدادات وإعادة بناء المنيو المفقود بناءً على السناب شوت الجديد
    // ==========================================
    await setDoc(doc(db, "settings", "siteSettings"), { 
      brandName: "WIND Shopping",
      logoUrl: "https://ik.imagekit.io/windeg/WIND_Shopping/logo.png",
      announcements: ["شحن مجاني للطلبات أكثر من 2000 ج.م"],
      type: "siteSettings",
      menuItems: [
        { id: "pybo9dy3e", link: "/", title: "الرئيسية", children: [] },
        { id: "ldsj84fsj", link: "/collections/new-arrivals", title: "وصل حديثاً", children: [] },
        { id: "4ses324u5", link: "/collections/best-sellers", title: "الأكثر مبيعاً", children: [] },
        {
          id: "032dec24l",
          link: "/collections/womens-clothing",
          title: "نسائي",
          children: [
            { id: "3sqa0h5fm", link: "/collections/women-sale", title: "تخفيضات", children: [] },
            { id: "c0mhfds4m", link: "/women/summer-wear", title: "ملابس صيفية", children: [] },
            {
              id: "0c7un2epl",
              link: "/women/winter-wear",
              title: "ملابس شتوية",
              children: [
                { id: "mlwfw577r", link: "/collections/womens-pullovers-sweaters", title: "بلوفرات وسويترات", children: [] },
                { id: "qtnbqn5du", link: "/collections/womens-basics", title: "الأساسيات", children: [] },
                { id: "oyv20cpt3", link: "/collections/womens-cardigans", title: "كارديجان", children: [] },
                { id: "o86ofi6ec", link: "/collections/womens-matching-sets", title: "أطقم وسوتس (Sets)", children: [] },
                { id: "eol9izfzb", link: "/collections/womens-pants", title: "بنطلونات", children: [] },
                { id: "471ggbdwp", link: "/collections/dresses", title: "الفساتين", children: [] },
                { id: "w3xmhvd3x", link: "/collections/womens-jackets-coats", title: "جاكيتات ومعاطف نسائية", children: [] },
                { id: "nwg5bi4jt", link: "/collections/womens-hoodies-sweatshirts", title: "هوديز وسويت شيرت", children: [] },
                { id: "xcf1x0arc", link: "/collections/womens-vests", title: "فستات نسائية", children: [] }
              ]
            },
            { id: "kpgr8ao0r", link: "/collections/womens-shawls", title: "شالات", children: [] },
            { id: "3rxyga0m4", link: "/collections/womens-scarves", title: "أوشحة", children: [] },
            {
              id: "w6hwbz1c8",
              link: "/collections/inner-hijab-essentials",
              title: "أساسيات الحجاب",
              children: [
                { id: "cm4npav60", link: "/collections/inner-head-scarves", title: "وشاح الرأس (البونيه)", children: [] },
                { id: "62vb58joa", link: "/collections/tarboosh-hijab-caps", title: "طربوش حجاب", children: [] },
                { id: "l8j6p27en", link: "/collections/inner-neck-covers-hijab", title: "أغطية الرقبة (الرقبية)", children: [] }
              ]
            },
            { id: "9d1gtxzhe", link: "/collections/womens-esdal-prayer", title: "إسدال الصلاة", children: [] }
          ]
        },
        { id: "a8tiqlcnz", link: "/collections/mens-clothing", title: "رجالي", children: [] },
        { id: "ut22wu7zx", link: "/contact-us", title: "تواصل معنا", children: [] }
      ],
      counters: {
        orders: totalOrders,
        sales: totalSales,
        customers: totalCustomers,
        products: currentCounters.products || 0,
        visitors: totalVisitors,
        todayDate: todayDate,
        todayVisitors: 0,
        yesterdayVisitors: 0
      }
    }, { merge: true });

    // محاولة تحديث الـ KV cache إذا وُجدت
    try {
      const { kvSet } = await import('@/lib/kv-cache');
      await kvSet('site_settings_v1', { 
        counters: {
          orders: totalOrders,
          sales: totalSales,
          customers: totalCustomers,
          products: currentCounters.products || 0,
          visitors: totalVisitors,
          todayDate: todayDate,
          todayVisitors: 0,
          yesterdayVisitors: 0
        }
      });
    } catch (kvErr) {
      console.log("KV cache update skipped");
    }

    return Response.json({
      success: true,
      message: `✅ تم تحديث العدادات وإعادة بناء المنيو المحدث بنجاح`,
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