import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore/lite";
import { getDb } from "@/lib/firebase";
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

  const orderNumber = normalizeOrderNumber(body?.orderNumber);
  const phone = String(body?.phone ?? "");
  if (!orderNumber || phone.length > 30) {
    return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
  }

  try {
    const snap = await getDoc(doc(getDb(), "Orders", orderNumber));
    const order = snap.exists() ? snap.data() : null;
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
