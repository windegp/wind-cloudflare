// ═══════════════════════════════════════════════════════════
// 🔴  LEGACY MIGRATION ROUTE — RETIRED / HARDENED
// ═══════════════════════════════════════════════════════════
//
// WARNING:
// This migration was historically executed to bootstrap:
//   - initial counter values (orders, sales, customers)
//   - menu items
//   - KV cache seeding
//
// ⚠️  DO NOT RE-RUN IN PRODUCTION ⚠️
//   - Analytics logic has since evolved significantly
//   - Customer counting now uses Purchased_Once segment filtering
//   - Counter updates are handled incrementally by checkout & webhook flows
//   - Re-running will OVERWRITE counters with stale, incorrect totals
//
// This file is retained for:
//   - migration history / rollback investigation
//   - debugging reference
//   - architecture documentation
//
// ═══════════════════════════════════════════════════════════

import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, getDoc, doc, startAfter, limit, setDoc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

// 🔴  ADMIN SECRET REQUIRED — protects against accidental execution
// Set NEXT_PUBLIC_MIGRATION_SECRET in environment to enable this route
const REQUIRED_SECRET = process.env.NEXT_PUBLIC_MIGRATION_SECRET || '';

export async function GET(request) {
  try {
    // ╔══════════════════════════════════════════════════════╗
    // ║  🔴  SAFETY GUARD 1: Hard-block by default        ║
    // ╚══════════════════════════════════════════════════════╝
    const { searchParams } = new URL(request.url);
    const migrationSecret = searchParams.get('secret') || '';
    
    // Default: BLOCK unless explicit secret is provided AND matches env var
    if (!REQUIRED_SECRET || migrationSecret !== REQUIRED_SECRET) {
      return Response.json({
        success: false,
        error: '🔴 This migration route is RETIRED. It cannot be re-run without explicit authorization.',
        message: `
          ═══════════════════════════════════════════════════════
          LEGACY MIGRATION — BLOCKED
          ═══════════════════════════════════════════════════════
          
          This route was historically used for initial bootstrap migration.
          It is now HARDENED against accidental re-execution.
          
          Reason: Analytics logic has evolved. Re-running would overwrite
          counters with stale, incorrect values (legacy counting did not
          filter by Purchased_Once segments).
          
          If you absolutely MUST run this, set NEXT_PUBLIC_MIGRATION_SECRET
          in your environment variables and pass ?secret=VALUE as a query param.
          
          ⚠️  This is NOT recommended for any production environment.
          ═══════════════════════════════════════════════════════
        `.trim()
      }, { status: 403 });
    }

    // ╔══════════════════════════════════════════════════════╗
    // ║  🔴  SAFETY GUARD 2: Superseded by new system      ║
    // ╚══════════════════════════════════════════════════════╝
    return Response.json({
      success: false,
      error: '🔴 This migration is SUPERSEDED by incremental analytics.',
      message: `
        The legacy migration (run-migration) is no longer used.
        
        Current analytics system:
        - Checkout flow increments counters in real-time
        - Kashier webhook increments counters for card payments
        - Dashboard reads from live Firestore queries + cached counters
        - Customer reconciliation available via: /api/admin/reconcile-customers
        
        Use the dedicated reconciliation endpoint instead:
        /api/admin/reconcile-customers?dryRun=false
      `.trim()
    }, { status: 410 });

    // ============================================================
    // 🔻  CODE BELOW IS PRESERVED FOR HISTORICAL REFERENCE ONLY
    //     It will NOT execute due to the guards above.
    // ============================================================

    const db = getDb();

    // ==========================================
    //  حماية ضد إعادة التشغيل
    // ==========================================
    const checkSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const existingData = checkSnap.exists() ? checkSnap.data() : {};
    const existingCounters = existingData.counters || {};

    if (existingCounters.migrated === true && existingCounters.orders > 0) {
      return Response.json({
        success: true,
        message: `✅ الـ Migration تم من قبل. البيانات الحالية: ${existingCounters.orders} طلب`,
        data: {
          orders: existingCounters.orders || 0,
          sales: existingCounters.sales || 0,
          customers: existingCounters.customers || 0,
          visitors: existingCounters.visitors || 0,
          alreadyMigrated: true
        }
      });
    }

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
    totalVisitors = existingCounters.visitors || 0;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

    // ==========================================
    // 4. تحديث العدادات + المنيو — setDoc مع {merge:true} آمن
    // ==========================================
    const flatMenuItems = [
      { id: "pybo9dy3e", title: "الرئيسية", link: "/" },
      { id: "ldsj84fsj", title: "وصل حديثاً", link: "/collections/new-arrivals" },
      { id: "4ses324u5", title: "الأكثر مبيعاً", link: "/collections/best-sellers" },
      { id: "3sqa0h5fm", title: "تخفيضات", link: "/collections/women-sale" },
      { id: "c0mhfds4m", title: "ملابس صيفية", link: "/women/summer-wear" },
      { id: "mlwfw577r", title: "بلوفرات وسويترات", link: "/collections/womens-pullovers-sweaters" },
      { id: "qtnbqn5du", title: "الأساسيات", link: "/collections/womens-basics" },
      { id: "oyv20cpt3", title: "كارديجان", link: "/collections/womens-cardigans" },
      { id: "o86ofi6ec", title: "أطقم وسوتس (Sets)", link: "/collections/womens-matching-sets" },
      { id: "eol9izfzb", title: "بنطلونات", link: "/collections/womens-pants" },
      { id: "471ggbdwp", title: "الفساتين", link: "/collections/dresses" },
      { id: "w3xmhvd3x", title: "جاكيتات ومعاطف نسائية", link: "/collections/womens-jackets-coats" },
      { id: "nwg5bi4jt", title: "هوديز وسويت شيرت", link: "/collections/womens-hoodies-sweatshirts" },
      { id: "xcf1x0arc", title: "فستات نسائية", link: "/collections/womens-vests" },
      { id: "kpgr8ao0r", title: "شالات", link: "/collections/womens-shawls" },
      { id: "3rxyga0m4", title: "أوشحة", link: "/collections/womens-scarves" },
      { id: "cm4npav60", title: "وشاح الرأس (البونيه)", link: "/collections/inner-head-scarves" },
      { id: "62vb58joa", title: "طربوش حجاب", link: "/collections/tarboosh-hijab-caps" },
      { id: "l8j6p27en", title: "أغطية الرقبة (الرقبية)", link: "/collections/inner-neck-covers-hijab" },
      { id: "w6hwbz1c8", title: "أساسيات الحجاب", link: "/collections/inner-hijab-essentials" },
      { id: "9d1gtxzhe", title: "إسدال الصلاة", link: "/collections/womens-esdal-prayer" },
      { id: "032dec24l", title: "نسائي", link: "/collections/womens-clothing" },
      { id: "a8tiqlcnz", title: "رجالي", link: "/collections/mens-clothing" },
      { id: "ut22wu7zx", title: "تواصل معنا", link: "/contact-us" }
    ];

    await setDoc(doc(db, "settings", "siteSettings"), {
      menuItems: flatMenuItems,
      counters: {
        orders: totalOrders,
        sales: totalSales,
        customers: totalCustomers,
        products: existingCounters.products || 0,
        visitors: totalVisitors,
        todayDate: todayDate,
        todayVisitors: 0,
        yesterdayVisitors: 0,
        migrated: true
      },
      migration: {
        menu_moved: true
      }
    }, { merge: true });

    // تحديث الـ KV cache
    try {
      const { kvSet } = await import('@/lib/kv-cache');
      await kvSet('site_settings_v1', {
        counters: {
          orders: totalOrders,
          sales: totalSales,
          customers: totalCustomers,
          products: existingCounters.products || 0,
          visitors: totalVisitors,
          todayDate: todayDate,
          todayVisitors: 0,
          yesterdayVisitors: 0,
          migrated: true
        },
        migration: {
          menu_moved: true
        }
      });
    } catch (kvErr) {
      console.log("KV cache update skipped");
    }

    return Response.json({
      success: true,
      message: `✅ تم تحديث العدادات والمنيو بنجاح`,
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