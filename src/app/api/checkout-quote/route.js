import { NextResponse } from "next/server";
import {
  CheckoutQuoteError,
  createServerCheckoutQuote,
} from "@/lib/serverCheckoutPricing";
import { signCheckoutQuote } from "@/lib/checkoutQuoteToken";

export const dynamic = "force-dynamic";

function getOfferEnvironment(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  const productionHosts = ["windeg.com", "www.windeg.com", "windeg.pages.dev"];
  return productionHosts.includes(host) ? "production" : "preview";
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body?.orderId) {
      return NextResponse.json(
        { success: false, message: "رقم الطلب غير موجود. حدّث الصفحة وحاول مرة أخرى." },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const quote = await createServerCheckoutQuote({
      ...body,
      offersEnvironment: getOfferEnvironment(request),
    });
    // Sign exactly the identity used for server-side welcome eligibility.
    quote.customerIdentity = { email: String(body.customerEmail || "").trim().toLowerCase(), phone: String(body.customerPhone || "").replace(/\D/g, ""), governorate: String(body.governorate || "").trim() };
    const quoteToken = await signCheckoutQuote(quote, body.orderId);

    return NextResponse.json(
      { success: true, quote, quoteToken },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );
  } catch (error) {
    if (error instanceof CheckoutQuoteError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    console.error("[checkout-quote] Failed to calculate trusted checkout quote:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تأكيد أسعار السلة حالياً. حاول مرة أخرى." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
