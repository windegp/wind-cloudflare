import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/apiGuards";
import { readCheckoutStatus, CheckoutPersistenceError } from "@/lib/durableCheckout";
export const dynamic = "force-dynamic";
export async function POST(request) {
  const headers = { "Cache-Control": "no-store, private" };
  if (process.env.CHECKOUT_DURABLE_ENABLED !== "true") return NextResponse.json({ error: "NOT_ENABLED" }, { status: 503, headers });
  const limited = await enforceRateLimit(request, "CREATE_ORDER"); if (limited) return limited;
  try { return NextResponse.json(await readCheckoutStatus(await request.json()), { headers }); }
  catch (error) {
    return NextResponse.json({ error: "CHECKOUT_STATUS_UNAVAILABLE" }, { status: error instanceof CheckoutPersistenceError ? error.status : 503, headers });
  }
}
