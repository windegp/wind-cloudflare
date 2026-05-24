import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, getDoc, doc, startAfter, limit, updateDoc } from "firebase/firestore/lite";
import { parseDateToMs, isRealCustomer } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════
 * SAFE ONE-TIME COUNTERS REBUILD
 * ═══════════════════════════════════════════════════════════
 *
 * PURPOSE:
 * Recompute counters.orders, counters.sales, counters.customers
 * by reading ONLY from Orders and Customers collections (the immutable source of truth).
 *
 * IMPORTANT:
 * - counters.visitors is NEVER modified (preserves 30000 historical baseline)
 * - Dry-run mode by default (?dryRun=true to apply)
 * - Reads ALL documents with pagination (safe for production)
 * - Is NOT intended for regular use — one-time rebuild only
 *
 * COUNTERS AFFECTED:
 *   counters.orders     = total completed, non-abandoned, non-draft orders
 *   counters.sales      = sum of all completed order totals
 *   counters.customers  = unique real purchasing customers (Purchased_Once or VIP_Customer)
 *
 * COUNTERS PRESERVED (NOT TOUCHED):
 *   counters.visitors   = 30000 historical baseline + future increments
 *   counters.todayVisitors
 *   counters.yesterdayVisitors
 *   counters.todayDate
 *   counters.products
 * ═══════════════════════════════════════════════════════════
 */

function getCanonicalId(customer, docId) {
  const email = (customer.Email || customer.email || '').toLowerCase().trim();
  const phone = String(customer.Phone || customer['Default Address Phone'] || '').replace(/[^0-9]/g, '');
  return email || phone || docId;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== 'false';

  try {
    const db = getDb();

    // ==========================================
    // 1. Read existing counters for report
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const existingCounters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
    
    const previousOrders = Number(existingCounters.orders) || 0;
    const previousSales = Number(existingCounters.sales) || 0;
    const previousCustomers = Number(existingCounters.customers) || 0;
    
    // ==========================================
    // 2. Scan ALL Orders — count completed, sum revenue
    // ==========================================
    let orderCount = 0;
    let salesTotal = 0;
    let ordersScanned = 0;
    let ordersExcluded = 0;
    let lastOrderDoc = null;
    let fetchOrders = true;

    console.log("[rebuild-counters] Starting Orders scan...");

    while (fetchOrders) {
      let constraints = [collection(db, "Orders"), limit(500)];
      if (lastOrderDoc) constraints.push(startAfter(lastOrderDoc));

      const snap = await getDocs(query(...constraints));

      if (snap.empty) {
        fetchOrders = false;
      } else {
        for (const d of snap.docs) {
          ordersScanned++;
          const o = d.data();
          if (!o) {
            ordersExcluded++;
            continue;
          }

          // Skip deleted orders
          if (o['Financial Status'] === 'deleted') {
            ordersExcluded++;
            continue;
          }

          // Skip abandoned/draft/pending payment
          const isAbandoned = o['Financial Status'] === 'abandoned' ||
                              o['Financial Status'] === 'pending_payment' ||
                              (o.Name && o.Name.startsWith('DRAFT-'));
          if (isAbandoned) {
            ordersExcluded++;
            continue;
          }

          // Valid completed order
          orderCount++;
          let total = 0;
          if (o.Total != null) {
            const totalStr = String(o.Total).replace(/[^0-9.\-]/g, '');
            if (totalStr && totalStr !== '-') total = parseFloat(totalStr) || 0;
          }
          salesTotal += total;
        }

        lastOrderDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 500) fetchOrders = false;
      }
    }

    salesTotal = parseFloat(salesTotal.toFixed(2));
    console.log(`[rebuild-counters] Orders scan complete: ${orderCount} valid, ${ordersExcluded} excluded, total scanned ${ordersScanned}`);

    // ==========================================
    // 3. Scan ALL Customers — count real buyers
    // ==========================================
    let customerCount = 0;
    let customersScanned = 0;
    let customersExcluded = 0;
    let duplicateCount = 0;
    let lastCustDoc = null;
    let fetchCustomers = true;

    const seenIdentities = new Set();

    console.log("[rebuild-counters] Starting Customers scan...");

    while (fetchCustomers) {
      let constraints = [collection(db, "Customers"), limit(500)];
      if (lastCustDoc) constraints.push(startAfter(lastCustDoc));

      const snap = await getDocs(query(...constraints));

      if (snap.empty) {
        fetchCustomers = false;
      } else {
        for (const d of snap.docs) {
          customersScanned++;
          const c = d.data();

          if (!c || Object.keys(c).length === 0) {
            customersExcluded++;
            continue;
          }

          const totalOrders = Number(c['Total Orders'] || 0);
          const segments = c.segments || [];
          const hasSegments = Array.isArray(segments) && segments.length > 0;
          
          // Skip abandoned-only customers
          if (hasSegments && segments.includes('Abandoned_Checkout') && totalOrders === 0) {
            customersExcluded++;
            continue;
          }
          
          // Skip potential-only customers
          if (hasSegments && segments.includes('Potential_Customer') && totalOrders === 0) {
            customersExcluded++;
            continue;
          }

          // Check if real purchasing customer
          if (!isRealCustomer(c)) {
            customersExcluded++;
            continue;
          }

          // Deduplicate by email/phone
          const canonicalId = getCanonicalId(c, d.id);
          if (seenIdentities.has(canonicalId)) {
            duplicateCount++;
            continue;
          }
          seenIdentities.add(canonicalId);
          customerCount++;
        }

        lastCustDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 500) fetchCustomers = false;
      }
    }

    console.log(`[rebuild-counters] Customers scan complete: ${customerCount} real buyers, ${customersExcluded} excluded, ${duplicateCount} duplicates, total scanned ${customersScanned}`);

    // ==========================================
    // 4. Build reconciliation report
    // ==========================================
    const report = {
      dryRun,
      timestamp: new Date().toISOString(),
      orders: {
        previous: previousOrders,
        recalculated: orderCount,
        delta: orderCount - previousOrders,
        scanned: ordersScanned,
        excluded: ordersExcluded,
      },
      sales: {
        previous: previousSales,
        recalculated: salesTotal,
        delta: parseFloat((salesTotal - previousSales).toFixed(2)),
      },
      customers: {
        previous: previousCustomers,
        recalculated: customerCount,
        delta: customerCount - previousCustomers,
        scanned: customersScanned,
        excluded: customersExcluded,
        duplicates: duplicateCount,
      },
      visitors: {
        preserved: true,
        message: "counters.visitors NOT modified — historical baseline preserved",
      },
    };

    // ==========================================
    // 5. Dry-run: Return report without writing
    // ==========================================
    if (dryRun) {
      return Response.json({
        success: true,
        message: `🔍 Dry-run complete. Orders: ${previousOrders} → ${orderCount}, Sales: EGP ${previousSales.toFixed(2)} → EGP ${salesTotal.toFixed(2)}, Customers: ${previousCustomers} → ${customerCount}. Pass ?dryRun=false to apply.`,
        report
      });
    }

    // ==========================================
    // 6. Apply: Update counters (preserving visitors)
    // ==========================================
    try {
      await updateDoc(doc(db, "settings", "siteSettings"), {
        "counters.orders": orderCount,
        "counters.sales": salesTotal,
        "counters.customers": customerCount,
      });
    } catch (writeError) {
      return Response.json({
        success: false,
        error: `Failed to update counters: ${writeError.message}`,
        report
      }, { status: 500 });
    }

    // ==========================================
    // 7. Sync KV cache
    // ==========================================
    let cacheSynced = false;
    try {
      const { kvGet, kvSet } = await import('@/lib/kv-cache');
      const cachedSettings = await kvGet('site_settings_v1');
      if (cachedSettings && cachedSettings.counters) {
        cachedSettings.counters.orders = orderCount;
        cachedSettings.counters.sales = salesTotal;
        cachedSettings.counters.customers = customerCount;
        await kvSet('site_settings_v1', cachedSettings);
        cacheSynced = true;
      } else {
        const freshSnap = await getDoc(doc(db, "settings", "siteSettings"));
        if (freshSnap.exists()) {
          await kvSet('site_settings_v1', freshSnap.data());
          cacheSynced = true;
        }
      }
    } catch (kvErr) {
      console.warn("[rebuild-counters] KV cache sync skipped:", kvErr.message);
    }

    return Response.json({
      success: true,
      message: `✅ Counters rebuilt. Orders: ${previousOrders} → ${orderCount}, Sales: EGP ${previousSales.toFixed(2)} → EGP ${salesTotal.toFixed(2)}, Customers: ${previousCustomers} → ${customerCount}. Visitors preserved (${Number(existingCounters.visitors) || 0}).`,
      report: {
        ...report,
        applied: true,
        cacheSynced
      }
    });

  } catch (error) {
    console.error("[rebuild-counters] Fatal error:", error);
    return Response.json({
      success: false,
      error: `Rebuild failed: ${error.message}`,
    }, { status: 500 });
  }
}