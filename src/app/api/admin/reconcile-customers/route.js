import { getDb } from "@/lib/firebase";
import { collection, query, getDocs, getDoc, doc, startAfter, limit, updateDoc } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

/**
 * ✅ SAFE HISTORICAL CUSTOMER COUNTER RECONCILIATION
 * 
 * PURPOSE:
 * Recalculate settings/siteSettings → counters.customers
 * using ONLY real purchasing customers (Purchased_Once / VIP_Customer).
 * 
 * SAFETY:
 * - Dry-run mode enabled by default (set ?dryRun=true param to execute)
 * - Only modifies counters.customers — preserves all other counters
 * - No document deletions
 * - No orders/revenue modification
 * - KV cache synced after final write
 * 
 * REAL CUSTOMER LOGIC (same as dashboard-stats/route.js):
 * - segments includes "Purchased_Once" or "VIP_Customer"
 * - OR Total Orders > 0 (legacy data fallback)
 */

// ==========================================
// PURCHASING LOGIC — same as dashboard analytics
// ==========================================
function isRealCustomer(customer) {
  if (!customer) return false;
  return (
    (customer.segments && Array.isArray(customer.segments) && 
     (customer.segments.includes('Purchased_Once') || customer.segments.includes('VIP_Customer'))) ||
    Number(customer['Total Orders'] || 0) > 0
  );
}

// ==========================================
// CANONICAL IDENTITY — same as dashboard analytics
// ==========================================
function getCanonicalId(customer, docId) {
  const email = (customer.Email || customer.email || '').toLowerCase().trim();
  const phone = String(customer.Phone || customer['Default Address Phone'] || '').replace(/[^0-9]/g, '');
  return email || phone || docId;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== 'false'; // dryRun=true by default

  try {
    const db = getDb();

    // ==========================================
    // 1. Read existing counter
    // ==========================================
    const settingsSnap = await getDoc(doc(db, "settings", "siteSettings"));
    const existingCounters = settingsSnap.exists() ? (settingsSnap.data().counters || {}) : {};
    const previousCounterValue = Number(existingCounters.customers) || 0;

    // ==========================================
    // 2. Scan all Customers — count real buyers only
    // ==========================================
    let totalScanned = 0;
    let realBuyerCount = 0;
    let excludedCount = 0;
    let duplicateCount = 0;
    let lastDoc = null;
    let fetchMore = true;

    const seenIdentities = new Set();
    const excludedTypes = {
      abandoned: 0,
      emailOnly: 0,
      noOrders: 0,
      draft: 0,
      emptyDoc: 0,
    };

    while (fetchMore) {
      let constraints = [collection(db, "Customers"), limit(500)];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(...constraints));

      if (snap.empty) {
        fetchMore = false;
      } else {
        for (const d of snap.docs) {
          totalScanned++;
          const c = d.data();

          if (!c || Object.keys(c).length === 0) {
            excludedTypes.emptyDoc++;
            excludedCount++;
            continue;
          }

          // Determine customer segments
          const segments = c.segments || [];
          const totalOrders = Number(c['Total Orders'] || 0);
          const hasSegments = Array.isArray(segments) && segments.length > 0;
          const hasEmail = !!(c.Email || c.email);
          const hasPhone = !!(c.Phone || c['Default Address Phone']);
          const isAbandonedOnly = hasSegments && segments.includes('Abandoned_Checkout') && totalOrders === 0;
          const isPotentialOnly = hasSegments && segments.includes('Potential_Customer') && totalOrders === 0;

          // Classify exclusions
          if (isAbandonedOnly) {
            excludedTypes.abandoned++;
            excludedCount++;
            continue;
          }
          if (isPotentialOnly) {
            excludedTypes.noOrders++;
            excludedCount++;
            continue;
          }
          if (!isRealCustomer(c)) {
            if (hasEmail && !hasPhone && totalOrders === 0) {
              excludedTypes.emailOnly++;
            } else {
              excludedTypes.draft++;
            }
            excludedCount++;
            continue;
          }

          // Real buyer: deduplicate
          const canonicalId = getCanonicalId(c, d.id);
          if (seenIdentities.has(canonicalId)) {
            duplicateCount++;
            continue;
          }
          seenIdentities.add(canonicalId);
          realBuyerCount++;
        }

        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 500) fetchMore = false;
      }
    }

    // ==========================================
    // 3. Build reconciliation report
    // ==========================================
    const report = {
      dryRun,
      timestamp: new Date().toISOString(),
      previousCounterValue,
      recalculatedValue: realBuyerCount,
      delta: realBuyerCount - previousCounterValue,
      totalScanned,
      totalUniqueRealBuyers: realBuyerCount,
      excludedRecordCount: excludedCount,
      duplicateRecordCount: duplicateCount,
      breakdown: {
        scanned: totalScanned,
        realBuyers: realBuyerCount,
        excluded: excludedCount,
        duplicates: duplicateCount,
      },
      excludedTypes,
      purchasingCustomerLogic: {
        method: "segments(Purchased_Once|VIP_Customer) OR Total Orders > 0",
        sameAs: "src/app/api/admin/dashboard-stats/route.js countVisitorsAndCustomers()",
      }
    };

    // ==========================================
    // 4. Dry-run: Return report without writing
    // ==========================================
    if (dryRun) {
      return Response.json({
        success: true,
        message: `🔍 Dry-run complete. Found ${realBuyerCount} real purchasing customers. Previous counter: ${previousCounterValue}. Pass ?dryRun=false to apply.`,
        report
      });
    }

    // ==========================================
    // 5. Apply: Update counters.customers only
    // ==========================================
    try {
      await updateDoc(doc(db, "settings", "siteSettings"), {
        "counters.customers": realBuyerCount
      });
    } catch (writeError) {
      return Response.json({
        success: false,
        error: `Failed to update counters.customers: ${writeError.message}`,
        report
      }, { status: 500 });
    }

    // ==========================================
    // 6. Sync KV cache
    // ==========================================
    let cacheSynced = false;
    try {
      const { kvGet, kvSet } = await import('@/lib/kv-cache');
      const cachedSettings = await kvGet('site_settings_v1');
      if (cachedSettings && cachedSettings.counters) {
        cachedSettings.counters.customers = realBuyerCount;
        await kvSet('site_settings_v1', cachedSettings);
        cacheSynced = true;
      } else {
        // Re-fetch and re-cache the full settings
        const freshSnap = await getDoc(doc(db, "settings", "siteSettings"));
        if (freshSnap.exists()) {
          await kvSet('site_settings_v1', freshSnap.data());
          cacheSynced = true;
        }
      }
    } catch (kvErr) {
      console.warn("[reconcile-customers] KV cache sync skipped:", kvErr.message);
    }

    return Response.json({
      success: true,
      message: `✅ counters.customers reconciled: ${previousCounterValue} → ${realBuyerCount} (${realBuyerCount - previousCounterValue >= 0 ? '+' : ''}${realBuyerCount - previousCounterValue})`,
      report: {
        ...report,
        applied: true,
        cacheSynced
      }
    });

  } catch (error) {
    console.error("[reconcile-customers] Fatal error:", error);
    return Response.json({
      success: false,
      error: `Reconciliation failed: ${error.message}`,
    }, { status: 500 });
  }
}