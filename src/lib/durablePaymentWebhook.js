import { verifyWebhookSignature } from "@/lib/kashier";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { CHECKOUT_ATTEMPTS } from "@/lib/durableCheckout";
import { receiveVerifiedPayment } from "@/lib/durablePayments";

/** Return null only for a legacy order. Authentication runs before any private read.
 * New canonical orders remain on durable processing even if new-order creation is disabled.
 */
export async function durablePaymentWebhook(body, signature, { store = serverOrderStore, verify = verifyWebhookSignature, receive = receiveVerifiedPayment } = {}) {
  const data = body?.data;
  const required = ["merchantOrderId", "transactionId", "amount", "currency", "status"];
  if (!data || !Array.isArray(data.signatureKeys) || !required.every(key => data.signatureKeys.includes(key)) ||
      !data.signatureKeys.every(key => typeof key === "string" && Object.hasOwn(data, key)) ||
      typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return { status: 401, code: "INVALID_SIGNATURE" };
  if (!await verify(data, signature)) return { status: 401, code: "INVALID_SIGNATURE" };
  if (typeof data.merchantOrderId !== "string" || !/^WIND-[A-Za-z0-9-]{8,100}$/.test(data.merchantOrderId)) return { status: 400, code: "INVALID_ORDER_ID" };
  const order = await store.get(CHECKOUT_ATTEMPTS, data.merchantOrderId);
  if (!order && !/^WIND-D-[0-9a-f-]{36}$/i.test(data.merchantOrderId)) return null;
  // The new browser uses a distinct UUID namespace. Retain unknown new-order
  // receipts for recovery while old IDs continue through the legacy handler.
  // Signature-authenticated status governs payment, not the unsigned envelope event string.
  const result = await receive(data, { store });
  return { status: 200, code: result.state };
}
