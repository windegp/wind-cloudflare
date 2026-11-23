import { CHECKOUT_ATTEMPTS, CHECKOUT_OUTBOX, checkoutFingerprint } from "@/lib/durableCheckout";
import { serverOrderStore, OrderStoreError } from "@/lib/serverOrderStore";

export const PAYMENT_RECEIPTS = "WindPaymentReceipts";
const CONFIRMATION_JOBS = ["customer_counters", "admin_email", "customer_email", "admin_push"];
const terminal = state => ["applied", "review", "observed"].includes(state);

/** Accept only after authenticating Kashier's signature. No side effects, no quote TTL check.
 * Receipt is durable before processing, so a crash between these commits is recoverable.
 * The scheduled recovery runner must retry nonterminal receipts even without provider retries.
 */
export async function receiveVerifiedPayment(data, { store = serverOrderStore, now = () => new Date() } = {}) {
  if (!data || typeof data.transactionId !== "string" || !data.transactionId.trim() || data.transactionId.length > 200 ||
      typeof data.merchantOrderId !== "string" || !/^WIND-[A-Za-z0-9-]{8,100}$/.test(data.merchantOrderId) ||
      !["SUCCESS", "FAILURE", "PENDING"].includes(data.status)) {
    throw new OrderStoreError("INVALID_PAYMENT_EVENT", 400);
  }
  // No provider customer information or full webhook body is retained.
  const event = { transactionId: data.transactionId, orderId: data.merchantOrderId, status: data.status,
    amount: typeof data.amount === "number" || typeof data.amount === "string" ? String(data.amount) : "",
    currency: typeof data.currency === "string" ? data.currency.toUpperCase() : "" };
  const id = await checkoutFingerprint({ transactionId: event.transactionId, status: event.status });
  const payloadHash = await checkoutFingerprint(event);
  let receipt = await store.get(PAYMENT_RECEIPTS, id);
  if (!receipt) {
    const timestamp = now().toISOString();
    try {
      await store.commit([{ collection: PAYMENT_RECEIPTS, id, create: true, data: {
        schemaVersion: 1, event, payloadHash, state: "received", receivedAt: timestamp, nextAttemptAt: timestamp,
      } }]);
    } catch (error) {
      receipt = await store.get(PAYMENT_RECEIPTS, id);
      if (!receipt) throw error;
    }
    receipt ||= await store.get(PAYMENT_RECEIPTS, id);
  }
  if (!receipt) throw new OrderStoreError("PAYMENT_RECEIPT_UNRESOLVED");
  if (receipt.data.payloadHash !== payloadHash) throw new OrderStoreError("PAYMENT_EVENT_CONFLICT", 409);
  return processPaymentReceipt(id, { store, now });
}

export async function processPaymentReceipt(id, { store = serverOrderStore, now = () => new Date() } = {}) {
  // CAS conflicts are bounded retries; the durable receipt remains available if contention persists.
  for (let attempt = 0; attempt < 4; attempt++) {
    const receipt = await store.get(PAYMENT_RECEIPTS, id);
    if (!receipt) throw new OrderStoreError("PAYMENT_RECEIPT_NOT_FOUND", 404);
    if (terminal(receipt.data.state)) return { receiptId: id, state: receipt.data.state, reason: receipt.data.reason || null, replay: true };
    const event = receipt.data.event;
    const canonical = await store.get(CHECKOUT_ATTEMPTS, event.orderId);
    const timestamp = now().toISOString();
    let state = "observed", reason = null;
    const writes = [];
    if (!canonical) {
      // Do not acknowledge-and-forget a paid event that arrived before order visibility.
      // Recovery retries it and the status exposes its age to operators.
      state = "awaiting_order"; reason = "CANONICAL_ORDER_MISSING";
    } else if (canonical.data.paymentMethod !== "card") {
      state = "review"; reason = "PAYMENT_METHOD_MISMATCH";
    } else if (event.status === "SUCCESS") {
      const expected = Number(canonical.data.financials?.total);
      const received = event.amount.trim() ? Number(event.amount) : NaN;
      if (!Number.isFinite(expected) || !Number.isFinite(received) || expected < 0 ||
          Math.abs(expected - received) > 0.001 || event.currency !== canonical.data.financials?.currency) {
        state = "review"; reason = "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH";
      } else if (canonical.data.status === "paid") {
        state = canonical.data.paymentReference === event.transactionId ? "applied" : "review";
        reason = state === "review" ? "SECOND_SUCCESSFUL_TRANSACTION" : null;
      } else if (canonical.data.status !== "pending_payment") {
        state = "review"; reason = "ORDER_NOT_PAYABLE";
      } else {
        const projection = await store.get("Orders", event.orderId);
        if (!projection) {
          state = "review"; reason = "ORDER_PROJECTION_MISSING";
        } else {
        state = "applied";
        writes.push({ collection: CHECKOUT_ATTEMPTS, id: event.orderId, version: canonical.version, merge: true,
          data: { status: "paid", paymentReference: event.transactionId, paidAt: timestamp } });
        writes.push({ collection: "Orders", id: event.orderId, version: projection.version, merge: true,
          data: { "Financial Status": "paid", "Payment Method": "card", "Payment Reference": event.transactionId } });
        writes.push(...CONFIRMATION_JOBS.map(type => ({ collection: CHECKOUT_OUTBOX, id: `${event.orderId}.${type}`, create: true,
          data: { schemaVersion: 1, orderId: event.orderId, type, state: "pending", attempts: 0, createdAt: timestamp, nextAttemptAt: timestamp } })));
        }
      }
    }
    writes.push({ collection: PAYMENT_RECEIPTS, id, version: receipt.version, merge: true,
      data: { state, reason, processedAt: timestamp,
        nextAttemptAt: state === "awaiting_order" ? new Date(now().getTime() + 60000).toISOString() : undefined } });
    try {
      await store.commit(writes);
      return { receiptId: id, state, reason, replay: false };
    } catch (error) {
      // A response can be lost after commit. Re-read receipt before reporting an error.
      const recovered = await store.get(PAYMENT_RECEIPTS, id);
      if (recovered && terminal(recovered.data.state)) return { receiptId: id, state: recovered.data.state, reason: recovered.data.reason || null, replay: true };
      if (error.code !== "ORDER_WRITE_CONFLICT") throw error;
    }
  }
  throw new OrderStoreError("PAYMENT_PROCESSING_CONTENTION");
}
