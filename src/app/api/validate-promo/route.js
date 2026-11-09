import { NextResponse } from "next/server";
import {
  CheckoutQuoteError,
  createServerCheckoutQuote,
} from "@/lib/serverCheckoutPricing";

export const dynamic = "force-dynamic";

function getOffersEnvironment(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  const productionHosts = ["windeg.com", "www.windeg.com", "windeg.pages.dev"];
  return productionHosts.includes(host) ? "production" : "preview";
}

export async function POST(req) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").trim();

    if (!code) {
      return NextResponse.json(
        { valid: false, message: "الرجاء إدخال كود الخصم" },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const quote = await createServerCheckoutQuote({
      cartItems: body.cartItems,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      promoCode: code,
      customerChoiceGiftSelections: body.customerChoiceGiftSelections,
      offerGiftSelections: body.offerGiftSelections,
      governorate: body.governorate,
      offersEnvironment: getOffersEnvironment(req),
    });

    if (!quote.appliedPromo) {
      return NextResponse.json(
        { valid: false, message: "القسيمة لا تمنح خصماً على السلة الحالية." },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    return NextResponse.json(
      { ...quote.appliedPromo, valid: true },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    if (error instanceof CheckoutQuoteError) {
      return NextResponse.json(
        { valid: false, message: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    console.error("validate-promo error:", error);
    return NextResponse.json(
      { valid: false, message: "حدث خطأ، حاول مرة أخرى" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}