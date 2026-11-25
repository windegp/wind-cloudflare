// One-time cleanup for card orders stuck at "pending_payment" (shown as abandoned carts)
// although Kashier confirmed the payment. Never deletes anything.
//
// Dry run (default, writes nothing):
//   node scripts/reconcile-stuck-card-orders.cjs
// Apply, only for order IDs you checked in the Kashier dashboard:
//   node scripts/reconcile-stuck-card-orders.cjs --apply --ids WIND-15820-IM,WIND-xxxxx-xx
// Also clear the "abandoned" flag on customers who already have orders:
//   node scripts/reconcile-stuck-card-orders.cjs --apply --clear-customer-flags
//
// Needs ../serviceAccountKey.json (same as export-firestore.cjs). Counters
// (counters.orders / counters.sales) are NOT changed by this script.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const clearFlags = args.includes("--clear-customer-flags");
const idsArg = args.indexOf("--ids");
const ids = idsArg >= 0 ? String(args[idsArg + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

initializeApp({ credential: cert(require("../serviceAccountKey.json")) });
const db = getFirestore();

(async () => {
  const snap = await db.collection("Orders").where("Financial Status", "==", "pending_payment").get();
  console.log(`pending_payment card orders: ${snap.size}`);
  for (const d of snap.docs) {
    const o = d.data();
    console.log(`${d.id} | ${o["Created at"]} | total ${o.Total} | ${o.Email || o.Phone || ""}${ids.includes(d.id) ? "  <-- will be marked paid" : ""}`);
  }
  if (apply && ids.length) {
    for (const id of ids) {
      const ref = db.collection("Orders").doc(id);
      const cur = await ref.get();
      if (!cur.exists || cur.data()["Financial Status"] !== "pending_payment") { console.log(`skip ${id} (not pending_payment)`); continue; }
      await ref.set({ "Financial Status": "paid", "Payment Method": "card", "Reconciled Manually": true }, { merge: true });
      console.log(`marked paid: ${id}`);
    }
  }
  if (clearFlags) {
    const cs = await db.collection("Customers").where("hasAbandoned", "==", true).get();
    for (const c of cs.docs) {
      const x = c.data();
      if (Number(x["Total Orders"] || 0) < 1) continue;
      console.log(`customer with orders still flagged: ${c.id}`);
      if (apply) {
        const segs = Array.isArray(x.segments) ? x.segments.filter((s) => s !== "Abandoned_Checkout") : [];
        await c.ref.set({ hasAbandoned: false, segments: segs }, { merge: true });
      }
    }
  }
  console.log(apply ? "done" : "dry run only, nothing written");
})();
