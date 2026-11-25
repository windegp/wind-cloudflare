// Fixes Customers.last_active values written in the old "M/D/YYYY, h:mm:ss AM" format.
// Never deletes. Dry run by default:
//   node scripts/fix-customer-last-active.cjs
//   node scripts/fix-customer-last-active.cjs --apply
// Needs ../serviceAccountKey.json (same as export-firestore.cjs).
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { normalizeLastActive } = require("./normalizeLastActive.cjs");

const apply = process.argv.includes("--apply");
initializeApp({ credential: cert(require("../serviceAccountKey.json")) });
const db = getFirestore();

(async () => {
  const snap = await db.collection("Customers").get();
  let n = 0;
  for (const d of snap.docs) {
    const fixed = normalizeLastActive(d.data().last_active);
    if (!fixed) continue;
    n++;
    console.log(`${d.id}: "${d.data().last_active}" -> "${fixed}"`);
    if (apply) await d.ref.update({ last_active: fixed });
  }
  console.log(apply ? `updated ${n}` : `dry run, ${n} would change, nothing written`);
})();
