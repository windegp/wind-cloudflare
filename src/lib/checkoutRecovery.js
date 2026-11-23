import { serverOrderStore } from "@/lib/serverOrderStore";
import { CHECKOUT_OUTBOX } from "@/lib/durableCheckout";
import { PAYMENT_RECEIPTS, processPaymentReceipt } from "@/lib/durablePayments";
import { processCheckoutJob } from "@/lib/checkoutOutbox";

/** Bounded recovery tick. Caller authenticates before invoking. No private data in summary.
 * Large backlogs need frequent ticks and external alerting. One tick is not a delivery guarantee.
 */
export async function runCheckoutRecovery({ store = serverOrderStore, handlers = {}, now = () => new Date(), limit = 10, budgetMs = 18000 } = {}) {
  const started = Date.now();
  const summary = { receipts: 0, jobs: 0, review: 0, errors: 0, budgetExhausted: false };
  const receipts = await store.listDue(PAYMENT_RECEIPTS, { states: ["received", "awaiting_order"], before: now().toISOString(), limit });
  for (const receipt of receipts) {
    if (Date.now() - started >= budgetMs) { summary.budgetExhausted = true; break; }
    try {
      const result = await processPaymentReceipt(receipt.id, { store, now });
      summary.receipts++; if (result.state === "review") summary.review++;
    } catch (_) { summary.errors++; }
  }
  if (!summary.budgetExhausted) {
    const jobs = await store.listDue(CHECKOUT_OUTBOX, { states: ["pending", "retry", "processing"], before: now().toISOString(), limit });
    for (const job of jobs) {
      if (Date.now() - started >= budgetMs) { summary.budgetExhausted = true; break; }
      try {
        const result = await processCheckoutJob(job.id, { store, handlers, now });
        summary.jobs++; if (result.state === "review") summary.review++;
      } catch (_) { summary.errors++; }
    }
  }
  return summary;
}
