import { CHECKOUT_ATTEMPTS, CHECKOUT_OUTBOX } from "@/lib/durableCheckout";
import { serverOrderStore, OrderStoreError } from "@/lib/serverOrderStore";

const MAX_ATTEMPTS = 12;
const LEASE_MS = 5 * 60 * 1000;
const EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const validTypes = new Set(["customer_counters", "admin_email", "customer_email", "admin_push"]);
const email = type => type === "admin_email" || type === "customer_email";

/** Process a single durable job, using injected handlers. A scheduler must enumerate due jobs.
 * Handlers must throw on failure and return {providerId?}. Email handlers MUST forward the
 * supplied stable idempotencyKey. Counter handlers MUST use their own atomic effect ledger.
 * Push may duplicate after a crash; no exactly-once delivery promise is made.
 */
export async function processCheckoutJob(id, { store = serverOrderStore, handlers = {}, now = () => new Date(), leaseToken = () => crypto.randomUUID() } = {}) {
  let job = await store.get(CHECKOUT_OUTBOX, id);
  if (!job) throw new OrderStoreError("OUTBOX_JOB_NOT_FOUND", 404);
  const data = job.data;
  if (["sent", "done", "review"].includes(data.state)) return { state: data.state, skipped: true };
  const clock = now().getTime();
  if ((data.state === "processing" && Date.parse(data.leaseUntil) > clock) ||
      (data.state !== "processing" && Date.parse(data.nextAttemptAt) > clock)) return { state: data.state, skipped: true };
  if (!validTypes.has(data.type) || typeof handlers[data.type] !== "function") throw new OrderStoreError("OUTBOX_HANDLER_UNAVAILABLE");
  const update = async patch => store.commit([{ collection: CHECKOUT_OUTBOX, id, version: job.version, merge: true, data: patch }]);
  // We deliberately stop before the provider's 24-hour idempotency window expires.
  if (data.attempts >= MAX_ATTEMPTS || (email(data.type) && data.firstAttemptAt && clock - Date.parse(data.firstAttemptAt) >= EMAIL_RETRY_WINDOW_MS)) {
    try { await update({ state: "review", lastError: "AUTOMATIC_RETRY_LIMIT", updatedAt: now().toISOString() }); }
    catch (error) { if (error.code !== "ORDER_WRITE_CONFLICT") throw error; return { state: "contended", skipped: true }; }
    return { state: "review", skipped: true };
  }
  const token = leaseToken();
  try {
    await update({ state: "processing", leaseToken: token, leaseUntil: new Date(clock + LEASE_MS).toISOString(),
      attempts: Number(data.attempts || 0) + 1, firstAttemptAt: data.firstAttemptAt || now().toISOString(), updatedAt: now().toISOString() });
  } catch (error) {
    // An ambiguous lease write is safe to recover using this execution's random token.
    const recovered = await store.get(CHECKOUT_OUTBOX, id);
    if (recovered?.data.leaseToken !== token || recovered.data.state !== "processing") {
      if (error.code === "ORDER_WRITE_CONFLICT") return { state: "contended", skipped: true };
      throw error;
    }
  }
  job = await store.get(CHECKOUT_OUTBOX, id);
  if (!job || job.data.leaseToken !== token) return { state: "contended", skipped: true };
  const order = await store.get(CHECKOUT_ATTEMPTS, data.orderId);
  let patch;
  try {
    if (!order || !["confirmed", "paid"].includes(order.data.status)) throw new OrderStoreError("OUTBOX_ORDER_NOT_CONFIRMED");
    const result = await handlers[data.type]({ order: order.data, jobId: id,
      idempotencyKey: `wind-order-v1/${id}`, leaseUntil: job.data.leaseUntil });
    patch = { state: email(data.type) ? "sent" : "done", providerId: String(result?.providerId || "").slice(0, 200),
      completedAt: now().toISOString(), lastError: null, leaseToken: null, leaseUntil: null };
  } catch (_) {
    // Never persist arbitrary provider errors: they can contain email addresses, tokens or HTML.
    patch = { state: job.data.attempts >= MAX_ATTEMPTS ? "review" : "retry", lastError: "HANDLER_FAILED",
      nextAttemptAt: new Date(now().getTime() + Math.min(3600000, 30000 * 2 ** (job.data.attempts - 1))).toISOString(),
      updatedAt: now().toISOString(), leaseToken: null, leaseUntil: null };
  }
  // Never overwrite a lease acquired by another runner after ours expired.
  const latest = await store.get(CHECKOUT_OUTBOX, id);
  if (!latest || latest.data.leaseToken !== token || latest.data.state !== "processing") return { state: "lease_lost", skipped: true };
  try {
    await store.commit([{ collection: CHECKOUT_OUTBOX, id, version: latest.version, merge: true, data: patch }]);
  } catch (error) {
    const recovered = await store.get(CHECKOUT_OUTBOX, id);
    if (recovered && ["sent", "done"].includes(recovered.data.state)) return { state: recovered.data.state, recovered: true };
    throw error; // Durable lease eventually expires. Handler must tolerate a retry.
  }
  return { state: patch.state };
}
