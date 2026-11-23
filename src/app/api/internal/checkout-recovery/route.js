import { NextResponse } from "next/server";
import { authorizedCheckoutRunner } from "@/lib/checkoutRecoveryAuth";
import { runCheckoutRecovery } from "@/lib/checkoutRecovery";
import { checkoutDeliveryHandlers } from "@/lib/checkoutDeliveryHandlers";
export const dynamic = "force-dynamic";
export async function POST(request) {
  const headers = { "Cache-Control": "no-store, private" };
  // Separate opt-in prevents a secret alone from activating unfinished production migration.
  if (process.env.CHECKOUT_RECOVERY_ENABLED !== "true") return NextResponse.json({ error: "NOT_ENABLED" }, { status: 503, headers });
  if (!authorizedCheckoutRunner(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  try {
    const result = await runCheckoutRecovery({ handlers: checkoutDeliveryHandlers() });
    return NextResponse.json(result, { status: result.errors ? 503 : 200, headers });
  } catch (_) {
    console.error(JSON.stringify({ event: "checkout_recovery_failed", code: "RECOVERY_TICK_FAILED" }));
    return NextResponse.json({ error: "RECOVERY_TICK_FAILED" }, { status: 503, headers });
  }
}
