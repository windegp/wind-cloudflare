import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/apiGuards";
import { persistVerifiedCheckout, CheckoutPersistenceError } from "@/lib/durableCheckout";
import { assertCheckoutPaymentConfiguration, checkoutIframeData } from "@/lib/checkoutPaymentSetup";
import { assertOrderStoreConfiguration } from "@/lib/serverOrderStore";
export const dynamic = "force-dynamic";
export async function POST(request) {
  const headers = { "Cache-Control": "no-store, private" };
  if (process.env.CHECKOUT_DURABLE_ENABLED !== "true") return NextResponse.json({ error: "NOT_ENABLED" }, { status: 503, headers });
  const limited = await enforceRateLimit(request, "CREATE_ORDER"); if (limited) return limited;
  let orderId;
  try {
    const body = await request.json(); orderId = body?.orderId;
    assertOrderStoreConfiguration();
    if (process.env.FIREBASE_PROJECT_ID !== "wind-reviews" || process.env.CHECKOUT_RECOVERY_ENABLED !== "true" ||
        process.env.CHECKOUT_DURABLE_WEBHOOK_ENABLED !== "true" || (process.env.CHECKOUT_RECOVERY_SECRET || "").length < 32) {
      throw new Error("DURABLE_CHECKOUT_PREREQUISITES_NOT_CONFIGURED");
    }
    // Missing payment config must be detected before creating a pending card order.
    assertCheckoutPaymentConfiguration(body?.paymentMethod);
    const result = await persistVerifiedCheckout(body);
    const iframeData = result.paymentMethod === "card" && result.status === "pending_payment"
      ? await checkoutIframeData(result.orderId, result.financials.total) : undefined;
    return NextResponse.json({ success: true, orderId: result.orderId, status: result.status, replay: result.replay, iframeData }, { headers });
  } catch (error) {
    const known = error instanceof CheckoutPersistenceError;
    console.error(JSON.stringify({ event: "checkout_attempt_failed", code: known ? error.code : "CHECKOUT_UNAVAILABLE" }));
    return NextResponse.json({ success: false, code: known ? error.code : "CHECKOUT_UNAVAILABLE", orderId: typeof orderId === "string" && /^WIND-[A-Za-z0-9-]{8,100}$/.test(orderId) ? orderId : undefined,
      error: known ? error.message : "تعذر تأكيد الطلب حالياً. احتفظ بالسلة ورقم الطلب وأعد المحاولة بنفس الرقم. لا تكرر الدفع قبل التحقق من حالته." },
      { status: known ? error.status : 503, headers });
  }
}
