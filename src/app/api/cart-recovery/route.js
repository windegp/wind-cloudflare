import { NextResponse } from "next/server";
import { getCartRecovery } from "@/lib/cartRecoveryStore";
import { isRecoveryLinkAlive, toPublicRecoveryCart } from "@/lib/cartRecovery";
import { isSameOrigin, enforceRateLimit } from "@/lib/apiGuards";
import { OrderStoreError } from "@/lib/serverOrderStore";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, private" };
const NOT_FOUND = { found: false };

/**
 * يقرأ لقطة سلة متروكة بالتوكن السري ويرجّع المنتجات والملخص فقط.
 * مفيش أي بيانات عميل في الرد: اللينك بيرجّع محتويات السلة وبس.
 * POST زي track-order عشان المتصفح يبعت Origin ويعدّي فحص same-origin.
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
    return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
  }

  let recovery = null;
  try {
    recovery = await getCartRecovery(body?.token);
  } catch (error) {
    if (error instanceof OrderStoreError) {
      return NextResponse.json(
        { error: "تعذر فتح السلة حالياً. حاول مرة أخرى." },
        { status: error.status || 503, headers: HEADERS }
      );
    }
    recovery = null;
  }

  if (!recovery || !isRecoveryLinkAlive(recovery)) {
    return NextResponse.json(NOT_FOUND, { status: 404, headers: HEADERS });
  }

  return NextResponse.json(
    { found: true, ...toPublicRecoveryCart(recovery) },
    { headers: HEADERS }
  );
}
