import { validDisplayNumber } from "@/lib/orderDisplayNumber";
import { verifyCheckoutQuote } from "@/lib/checkoutQuoteToken";
import { getCairoTimestamp } from "@/lib/analytics-helpers";
import { serverOrderStore, OrderStoreError } from "@/lib/serverOrderStore";

export const CHECKOUT_ATTEMPTS = "WindCheckoutAttempts";
export const CHECKOUT_OUTBOX = "WindCheckoutOutbox";
// Reuse the existing private namespace, never publicly writable siteSettings counters.
export const ORDER_NUMBER_COLLECTION = "WindCheckoutEffects";
export const ORDER_SEQUENCE_ID = "order_sequence_v1";
export const orderNumberIndexId = number => `order_number_${number}`;
export class CheckoutPersistenceError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}
const fail = (code, status = 400, message = "تعذر تأكيد الطلب. راجع بياناتك وحاول مرة أخرى.") => {
  throw new CheckoutPersistenceError(code, status, message);
};
const text = (value, length = 300) => String(value || "").trim().slice(0, length);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export async function checkoutFingerprint(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Called by the gated server route only after rollout protections are installed.
 * The caller may only start payment once this returns persisted=true.
 * Canonical snapshot and jobs are private. Orders is a compatibility projection.
 */
export async function persistVerifiedCheckout(input, { store = serverOrderStore, verify = verifyCheckoutQuote, now = () => new Date() } = {}) {
  const { orderId, paymentMethod, quoteToken } = input || {};
  if (typeof orderId !== "string" || !/^WIND-[A-Za-z0-9-]{8,100}$/.test(orderId)) fail("INVALID_CHECKOUT_ID");
  if (!["card", "cod", "instapay"].includes(paymentMethod)) fail("INVALID_PAYMENT_METHOD");
  const form = input.formData || {};
  const customer = {
    email: text(form.email, 120).toLowerCase(), phone: text(form.phone, 30),
    firstName: text(form.firstName, 80), lastName: text(form.lastName, 80),
    address: text(form.address), landmark: text(form.landmark), city: text(form.city, 100),
    governorate: text(form.governorate, 100), postalCode: text(form.postalCode, 20), altPhone: text(form.altPhone, 30),
  };
  if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(customer.email) ||
      customer.phone.replace(/\D/g, "").length < 11 || !customer.firstName || !customer.address || !customer.city || !customer.governorate) fail("INVALID_CHECKOUT_CUSTOMER");
  let quote;
  let expired = false;
  try {
    quote = await verify(quoteToken, orderId);
    if (!quote) {
      // Expired signatures can authenticate replay of an existing identical attempt,
      // never authorize creating a new order at an obsolete price.
      quote = await verify(quoteToken, orderId, { allowExpired: true });
      expired = Boolean(quote);
    }
  }
  catch (_) { fail("CHECKOUT_VERIFICATION_UNAVAILABLE", 503, "تعذر التحقق من تسعير الطلب حالياً. لم يبدأ الدفع. حاول لاحقاً."); }
  if (!quote) fail("INVALID_CHECKOUT_QUOTE", 409, "انتهت صلاحية التسعير. راجع الإجمالي ثم أعد المحاولة.");
  if (![quote.subtotal, quote.discount ?? 0, quote.shipping, quote.total].every(v => Number.isFinite(Number(v)) && Number(v) >= 0) ||
      Math.abs(Number(quote.total) - (Number(quote.subtotal) - Number(quote.discount || 0) + Number(quote.shipping))) > 0.01 ||
      !Array.isArray(quote.lineItems) || !quote.lineItems.length) fail("INVALID_CHECKOUT_FINANCIALS", 409);

  // The integration must bind welcome eligibility to the same identity in the signed quote.
  if (quote.customerIdentity?.governorate !== customer.governorate || quote.customerIdentity?.email !== customer.email ||
      String(quote.customerIdentity?.phone || "").replace(/\D/g, "") !== customer.phone.replace(/\D/g, "")) {
    fail("CHECKOUT_IDENTITY_MISMATCH", 409, "تغيرت بيانات العميل. أعد التحقق من الخصم والإجمالي.");
  }
  const financials = {
    subtotal: Number(quote.subtotal), discount: Number(quote.discount || 0), shipping: Number(quote.shipping), total: Number(quote.total),
    currency: "EGP", lineItems: quote.lineItems, cartItems: quote.cartItems || [],
    discountLines: quote.discountLines || [], discountSource: quote.discountSource || "none",
    appliedPromo: quote.appliedPromo || null, appliedOffer: quote.appliedOffer || null,
    originalSubtotal: quote.originalSubtotal ?? quote.subtotal, productDiscountTotal: quote.productDiscountTotal || 0,
  };
  // Issued/expires-at token metadata deliberately excluded: same quote can be freshly signed on retry.
  const fingerprint = await checkoutFingerprint({ customer, financials, paymentMethod });
  const receipt = record => {
    if (record.data.fingerprint !== fingerprint) fail("CHECKOUT_ID_REUSED", 409, "هذا الطلب محفوظ ببيانات مختلفة. تحقق من حالته قبل بدء طلب جديد.");
    return { persisted: true, replay: true, orderId, ...(validDisplayNumber(record.data.orderNumber) ? { orderNumber: record.data.orderNumber } : {}), status: record.data.status, paymentMethod: record.data.paymentMethod, financials: record.data.financials };
  };
  try {
    const existing = await store.get(CHECKOUT_ATTEMPTS, orderId);
    if (existing) return receipt(existing);
    if (expired) fail("INVALID_CHECKOUT_QUOTE", 409, "انتهت صلاحية التسعير. راجع الإجمالي ثم أعد المحاولة.");
    // Allocation, mapping and order creation share a single CAS-protected commit.
    // Retries after a lost acknowledgement recover by UUID, never increment alone.
    for (let allocation = 0; allocation < 8; allocation++) {
      const committed = await store.get(CHECKOUT_ATTEMPTS, orderId);
      if (committed) return receipt(committed);
      const sequence = await store.get(ORDER_NUMBER_COLLECTION, ORDER_SEQUENCE_ID);
      const lastNumber = sequence ? sequence.data.lastNumber : 1000;
      if (!Number.isSafeInteger(lastNumber) || lastNumber < 1000 || lastNumber >= Number.MAX_SAFE_INTEGER) {
        fail("ORDER_SEQUENCE_INVALID", 503, "تعذر إصدار رقم الطلب حالياً. حاول لاحقاً بنفس المحاولة.");
      }
      const orderNumber = lastNumber + 1;
      const timestamp = now().toISOString();
      const status = paymentMethod === "card" ? "pending_payment" : "confirmed";
      const record = { schemaVersion: 1, orderId, orderNumber, fingerprint, paymentMethod, customer, financials, status, createdAt: timestamp };
      const projection = {
        Name: orderId, "Order Number": orderNumber, Email: customer.email, Phone: customer.phone, "Alternate Phone": customer.altPhone,
        "Billing Name": `${customer.firstName} ${customer.lastName}`, "Shipping Address1": `${customer.address}${customer.landmark ? ` - ${customer.landmark}` : ""}`,
        "Shipping City": customer.city, "Shipping Province": customer.governorate, "Shipping Phone": customer.phone, "Shipping Zip": customer.postalCode,
        Subtotal: financials.subtotal, Shipping: financials.shipping, Total: financials.total, Currency: financials.currency,
        "Financial Status": paymentMethod === "card" ? "pending_payment" : "pending", "Payment Method": paymentMethod,
        "Created at": getCairoTimestamp(), data_source: "WIND_Web", "Server Checkout Version": 1,
        "Discount Amount": financials.discount, "Discount Type": financials.discountSource,
        "Discount Label": financials.discountLines.map(line => line.label).join(" + "), "Discount Breakdown": financials.discountLines,
        "Free Shipping Applied": financials.shipping === 0, lineItems: financials.lineItems,
      };
      const jobs = paymentMethod === "card" ? [] : ["customer_counters", "admin_email", "customer_email", "admin_push"];
      const writes = [
        { collection: ORDER_NUMBER_COLLECTION, id: ORDER_SEQUENCE_ID,
          ...(sequence ? { version: sequence.version } : { create: true }),
          data: { lastNumber: orderNumber, updatedAt: timestamp } },
        { collection: ORDER_NUMBER_COLLECTION, id: orderNumberIndexId(orderNumber), create: true,
          data: { orderId, orderNumber, createdAt: timestamp } },
        { collection: CHECKOUT_ATTEMPTS, id: orderId, data: record, create: true },
        // Never overwrite an older/browser-created order using the same key.
        { collection: "Orders", id: orderId, data: projection, create: true },
        ...jobs.map(type => ({ collection: CHECKOUT_OUTBOX, id: `${orderId}.${type}`, create: true,
          data: { schemaVersion: 1, orderId, type, state: "pending", attempts: 0, createdAt: timestamp, nextAttemptAt: timestamp } })),
      ];
      try { await store.commit(writes); }
      catch (error) {
        // Commit response may be lost after a successful atomic write. Always resolve by key.
        for (let attempt = 0; attempt < 2; attempt++) {
          const recovered = await store.get(CHECKOUT_ATTEMPTS, orderId);
          if (recovered) return receipt(recovered);
        }
        if (error.code === "ORDER_WRITE_CONFLICT") {
          // A pre-existing projection or number mapping is not ours to overwrite.
          if (await store.get("Orders", orderId)) fail("CHECKOUT_CONFLICT", 409, "الطلب قيد التحقق. أعد المحاولة بنفس رقم الطلب، ولا تبدأ دفعاً جديداً.");
          const latest = await store.get(ORDER_NUMBER_COLLECTION, ORDER_SEQUENCE_ID);
          if ((latest?.data.lastNumber ?? 1000) === lastNumber) fail("ORDER_SEQUENCE_CONFLICT", 503, "تعذر إصدار رقم الطلب حالياً. حاول لاحقاً بنفس المحاولة.");
          continue;
        }
        throw error;
      }
      return { persisted: true, replay: false, orderId, orderNumber, status, paymentMethod, financials };
    }
    fail("CHECKOUT_CONFLICT", 409, "الطلب قيد التحقق. أعد المحاولة بنفس رقم الطلب، ولا تبدأ دفعاً جديداً.");
  } catch (error) {
    if (error instanceof CheckoutPersistenceError) throw error;
    console.error(JSON.stringify({ event: "checkout_persistence_failed", orderId, code: error instanceof OrderStoreError ? error.code : "UNEXPECTED_STORAGE_ERROR" }));
    fail("CHECKOUT_STORAGE_UNAVAILABLE", 503, "تعذر حفظ الطلب بأمان الآن. لم يبدأ الدفع. احتفظ بالسلة وحاول لاحقاً.");
  }
}

/** Signed quote is a bearer credential. Returns status only, never customer/source details.
 * Expiry does not block a customer checking a charge; signature and order binding still apply.
 */
export async function readCheckoutStatus({ orderId, quoteToken }, { store = serverOrderStore, verify = verifyCheckoutQuote } = {}) {
  const quote = await verify(quoteToken, orderId, { allowExpired: true });
  if (!quote) fail("INVALID_CHECKOUT_CREDENTIAL", 401);
  const order = await store.get(CHECKOUT_ATTEMPTS, orderId);
  if (!order) return { orderId, status: "not_found" };
  if (quote.customerIdentity?.email !== order.data.customer.email ||
      String(quote.customerIdentity?.phone || "").replace(/\D/g, "") !== order.data.customer.phone.replace(/\D/g, "") ||
      Number(quote.total) !== order.data.financials.total) fail("CHECKOUT_CREDENTIAL_MISMATCH", 401);
  return { orderId, ...(validDisplayNumber(order.data.orderNumber) ? { orderNumber: order.data.orderNumber } : {}), status: order.data.status, paymentMethod: order.data.paymentMethod, total: order.data.financials.total, currency: order.data.financials.currency };
}
