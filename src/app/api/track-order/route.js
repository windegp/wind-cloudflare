import { serverOrderStore } from "@/lib/serverOrderStore";
import { parseDisplayNumber } from "@/lib/orderDisplayNumber";
import { CHECKOUT_ATTEMPTS, ORDER_NUMBER_COLLECTION, orderNumberIndexId } from "@/lib/durableCheckout";
import { NextResponse } from "next/server";
import { isSameOrigin, enforceRateLimit } from "@/lib/apiGuards";
import {
  isTrackableOrder,
  normalizeOrderNumber,
  phoneMatchesOrder,
  toPublicOrder,
} from "@/lib/orderTracking";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, private" };
// Same answer for "no such order" and "wrong phone", so the endpoint cannot be used
// to find out which order numbers exist.
const NOT_FOUND = { found: false, message: "مش لاقيين طلب بالبيانات دي. راجع رقم الطلب ورقم الموبايل." };

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const limited = await enforceRateLimit(request, "TRACK_ORDER");
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ found: false, message: "بيانات غير صحيحة" }, { status: 400, headers: HEADERS });
  }

  const displayNumber = parseDisplayNumber(body?.orderNumber);
  const orderNumber = normalizeOrderNumber(body?.orderNumber);
  const phone = String(body?.phone ?? "");
  if ((!orderNumber && !displayNumber) || phone.length > 30) {
    return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
  }

  try {
    if (displayNumber) {
      const index = await serverOrderStore.get(ORDER_NUMBER_COLLECTION, orderNumberIndexId(displayNumber));
      const resolved = index?.data?.orderId;
      if (index?.data?.orderNumber !== displayNumber || typeof resolved !== "string" ||
          !/^WIND-D-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(resolved)) {
        return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
      }
      // Sequential numbers are enumerable. Authorize against the private canonical
      // phone, never a browser-writable Orders projection or the index alone.
      const canonical = await serverOrderStore.get(CHECKOUT_ATTEMPTS, resolved);
      const source = canonical?.data;
      if (source?.orderNumber !== displayNumber) return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
      const safeOrder = {
        "Order Number": source.orderNumber, Phone: source.customer?.phone, "Alternate Phone": source.customer?.altPhone,
        "Financial Status": source.status === "confirmed" ? "pending" : source.status,
        "Payment Method": source.paymentMethod, "Created at": source.createdAt,
        Total: source.financials?.total, Currency: source.financials?.currency,
        lineItems: source.financials?.lineItems,
      };
      if (!isTrackableOrder(safeOrder) || !phoneMatchesOrder(phone, safeOrder)) return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
      // Fulfilment stays in the dashboard projection; use only allowlisted status.
      // Service-account read (public read is being closed), same document as before.
      const projection = await serverOrderStore.getData("Orders", resolved);
      if (projection) safeOrder["Fulfillment Status"] = projection["Fulfillment Status"];
      return NextResponse.json({ found: true, order: toPublicOrder(safeOrder, resolved) }, { headers: HEADERS });
    }
    // Service-account read (public read is being closed), same document as before.
    const order = await serverOrderStore.getData("Orders", orderNumber);
    if (!isTrackableOrder(order) || !phoneMatchesOrder(phone, order)) {
      return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
    }
    return NextResponse.json({ found: true, order: toPublicOrder(order, orderNumber) }, { headers: HEADERS });
  } catch {
    return NextResponse.json(
      { found: false, message: "حصلت مشكلة مؤقتة. حاول تاني بعد شوية." },
      { status: 500, headers: HEADERS }
    );
  }
}
