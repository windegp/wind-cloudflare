import { NextResponse } from "next/server";
import { verifyCheckoutQuote } from "@/lib/checkoutQuoteToken";
import { saveCartRecovery } from "@/lib/cartRecoveryStore";
import { isSameOrigin, enforceRateLimit } from "@/lib/apiGuards";
import { OrderStoreError } from "@/lib/serverOrderStore";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, private" };

/**
 * يحفظ لقطة سلة متروكة على السيرفر. المدخل الوحيد هو توكن تسعير موقّع من
 * /api/checkout-quote، فيتحقق التوقيع هنا قبل التخزين: الأسعار المحفوظة هي
 * اللي السيرفر حسبها بنفسه، مش أي حاجة جاية من المتصفح.
 */
export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const limited = await enforceRateLimit(request, "CART_RECOVERY");
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: HEADERS });
  }

  const orderId = String(body?.orderId || "");
  if (!/^WIND-[A-Za-z0-9-]{8,100}$/.test(orderId)) {
    return NextResponse.json({ error: "رقم طلب غير صالح" }, { status: 400, headers: HEADERS });
  }

  let quote = null;
  try {
    quote = await verifyCheckoutQuote(body?.quoteToken, orderId);
  } catch {
    quote = null;
  }
  if (!quote) {
    return NextResponse.json({ error: "تسعير غير صالح" }, { status: 400, headers: HEADERS });
  }

  try {
    const token = await saveCartRecovery({ orderId, quote });
    return NextResponse.json({ success: true, token }, { headers: HEADERS });
  } catch (error) {
    const status = error instanceof OrderStoreError ? error.status : 503;
    return NextResponse.json(
      { error: "تعذر حفظ نسخة السلة حالياً." },
      { status, headers: HEADERS }
    );
  }
}
