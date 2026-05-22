# ADMIN DASHBOARD ANALYTICS AUDIT

## Date: 2026-05-22
## Auditor: Cline

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW DIAGRAM                       │
└─────────────────────────────────────────────────────────────┘

1. ORDER CREATION (COD/Instapay)
   checkout/page.js ───→ Firebase Orders/{orderId}
                    └──→ Firebase Customers/{customerId}
                    └──→ settings/siteSettings → counters (increment)

2. ORDER CREATION (Card/Pending)
   checkout/page.js ───→ Firebase Orders/{orderId} (pending_payment)
                    └──→ localStorage pendingOrder (for thank-you page)

3. CARD PAYMENT COMPLETION
   Kashier Webhook ───→ Firebase Orders/{orderId} (mark paid)
   kashier/route.js ───→ Firebase Customers/{customerId} (update)
                    └──→ settings/siteSettings → counters (partial increment)

4. THANK-YOU PAGE
   thank-you/page.js ───→ /api/create-order (email only, NO counters)
                     └──→ clearCart + remove pendingOrder

5. DASHBOARD STATS
   admin/page.js ───→ /api/admin/dashboard-stats?period=X
   dashboard-stats/route.js
     ├── Reads from counters (settings/siteSettings)
     ├── Queries Customers collection live
     └── Queries Orders collection live

6. CUSTOMERS PAGE (Dedicated)
   admin/customers/page.js ───→ Firebase Customers (paginated query)
```

---

## CRITICAL BUGS FOUND

### BUG #1 [CRITICAL]: New card-paying customers never enter Customers collection
**File**: `src/app/api/webhooks/kashier/route.js` (line 78-95)
**Issue**: 
- Webhook handles `if (customerSnap.exists())` but has NO `else` branch
- First-time card customers (no prior record) are silently dropped
- No customer document created → invisible in dashboard
- No `counters.customers` increment for new card customers
**Impact**: Card-paying customers missing from analytics. Dashboard "All" undercounts.

### BUG #2 [CRITICAL]: `counters.customers` never incremented for card payments
**Files**: 
- `checkout/page.js` (line 353): `if (paymentMethod !== 'card')` guards counter increment
- `webhooks/kashier/route.js` (line 100-103): Only increments `orders` and `sales`
**Impact**: Dashboard "All" period uses `counters.customers` → wrong count

### BUG #3 [HIGH]: Week/Month customer count missing today's buyers
**File**: `src/app/api/admin/dashboard-stats/route.js` (line 241-250)
**Issue**:
```js
// For week, month periods:
const result = await countVisitorsAndCustomers(db, dateFilterStart, yesterdayEndMs);
visitorsForPeriod = result.visitors + todayVisitors;
totalCustomers = result.realCustomers;  // ← BUG: today's customers NOT added!
```
- `visitorsForPeriod` correctly adds `todayVisitors`
- `totalCustomers` does NOT add today's customers
**Impact**: Week/Month customer counts are incomplete

### BUG #4 [HIGH]: `last_active` stored in locale-dependent format, queried in ISO format
**Files**:
- `checkout/page.js` (line 259): Stores as `new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })`
  → Produces: `"5/22/2026, 10:30:00 PM"`
- `dashboard-stats/route.js` (line 44-46): Queries as `where("last_active", ">=", "2026-05-22 00:00:00")`
  → String comparison: `"5/22/2026..." >= "2026-05-22..."` 
  → ASCII: '5'(53) >= '2'(50) → true (works for months 5-9)
  → For months 10-12: '1'(49) >= '2'(50) → false (MISSED!)
  → For months 1-2: '1' or '2' - inconsistent results
**Impact**: Customers with activity in Oct-Dec may be missed by range queries

### BUG #5 [MEDIUM]: Webhook segments logic uses pre-increment order count
**File**: `src/app/api/webhooks/kashier/route.js` (line 84-87)
```js
const currentOrders = Number(existingData['Total Orders'] || 0);
const newSegment = currentOrders >= 1 ? "VIP_Customer" : "Purchased_Once";
await setDoc(customerRef, {
  "Total Orders": currentOrders + 1,
  ...
  segments: [newSegment]
});
```
- For an existing customer with 0 orders (abandoned cart only): `currentOrders = 0`, segment = "Purchased_Once", then Total Orders = 1 → CORRECT
- For existing customer with 1 order: `currentOrders = 1`, segment = "VIP_Customer", Total Orders = 2 → CORRECT
- Actually this logic is fine.

### BUG #6 [LOW]: Customer document has both `segments` and `status` fields
**File**: `src/app/checkout/page.js` (line 399-400)
- `segments: [newSegment]` AND `status: newSegment`
- `status` duplicates the segment info, potentially confusing dashboard reading logic

---

## DATA SOURCE OF TRUTH MAPPING

| Metric | Source: "All" Period | Source: Other Periods | Source: Dedicated Page |
|--------|----------------------|----------------------|----------------------|
| Customer Count | `counters.customers` (counters) | `countVisitorsAndCustomers()` (live query) | Paginated Firestore query |
| Order Count | `counters.orders` (counters) | Firestore Orders query | N/A |
| Sales | `counters.sales` (counters) | Firestore Orders query | N/A |
| Visitors | `counters.visitors` (counters) | `countVisitorsAndCustomers()` (live query) | N/A |
| Conversion Rate | Calculated | Calculated | N/A |

---

## TIMESTAMP FLOW

```
User checkout (Cairo time):
  new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
  → "5/22/2026, 10:30:00 PM"  (stored as "Created at" in Orders, "last_active" in Customers)

Dashboard query:
  formatCairoDate(nowCairo) + ' 00:00:00'
  → "2026-05-22 00:00:00"  (used for Firestore query comparison)

BOTH are Cairo timezone, but DIFFERENT STRING FORMATS:
- Storage: "M/D/YYYY, H:MM:SS AM/PM"   (US locale)
- Query:  "YYYY-MM-DD HH:MM:SS"         (ISO-like)

String comparison mismatch leads to query filtering issues!
```

---

## COUNTER UPDATE PATHS

```
Path A: COD/Instapay new customer
checkout/page.js line 409-419
  → increment("counters.customers") ✓

Path B: COD/Instapay existing customer
checkout/page.js line 381-405
  → NO counter increment (customer already counted) ✓

Path C: Card payment new customer
webhooks/kashier/route.js line 78-107
  → increment("counters.orders") ✓
  → increment("counters.sales") ✓
  → increment("counters.customers") ✗ (MISSING!)
  → Customer document creation ✗ (MISSING!)

Path D: Card payment existing customer
webhooks/kashier/route.js line 78-107
  → increment("counters.orders") ✓
  → increment("counters.sales") ✓
  → increment("counters.customers") ✗ (SHOULD NOT increment) ✓
```

---

## RISK ANALYSIS FOR FIXES

| Fix | Risk | Mitigation |
|-----|------|------------|
| Fix webhook to create new customers | LOW - only affects new card customers | Use merge:true, idempotency already in place |
| Fix webhook to increment customers counter | LOW - uses updateDoc | Guard with sessionStorage? No - webhook is server-side |
| Fix week/month to include today's customers | LOW - pure calculation fix | No side effects |
| Fix last_active format | MEDIUM - affects existing data | Must handle both old and new formats |
| Fix date query format | MEDIUM - affects existing queries | parseDateToMs already handles both formats |

---

## PLAN FOR SAFE FIXES

### Fix 1: Webhook - Create new customer + increment counter
Modify `webhooks/kashier/route.js`:
- Add `else` branch to create customer document
- Increment `counters.customers` for new customers only (add customer-exists check)

### Fix 2: Webhook - Always handle new customers
- Extract customer ID from order data
- If customer doesn't exist, create with segments: ["Purchased_Once"]

### Fix 3: Dashboard - Fix week/month customer count
- Add `todayResult.realCustomers` to totalCustomers for week/month

### Fix 4: Normalize `last_active` format (Safe approach)
- Store as ISO string instead of locale string in checkout
- Keep parseDateToMs backward-compatible
- No migration needed - function handles both formats

### Fix 5: Dashboard - Fix dateFilterStart query format
- Already works for most cases due to parseDateToMs fallback
- But add direct `last_active` timestamp field for reliable querying

---

## VALIDATION CHECKLIST

- [ ] Today: Customer counts match live queries
- [ ] Yesterday: Customer counts match
- [ ] Week: Includes both past days and today
- [ ] Month: Complete month data
- [ ] All: counters.customers accurate
- [ ] Card payment: New customers appear
- [ ] Card payment: Customer counter increments
- [ ] COD/Instapay: Counters work as before
- [ ] Date filtering: Consistent across periods
- [ ] No regression: Existing metrics unchanged