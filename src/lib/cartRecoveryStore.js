// تخزين لقطات السلة المتروكة على السيرفر فقط (خدمة حساب جوجل، مش قابلة للكتابة
// من المتصفح). التوكن مفتاح عشوائي غير قابل للتخمين، واللقطة هي تسعير موقّع
// من السيرفر نفسه وقت التخلي، فمفيش أي ثقة في بيانات جاية من المتصفح.

import { serverOrderStore } from "@/lib/serverOrderStore";
import {
  CART_RECOVERY_COLLECTION,
  CART_RECOVERY_ORDER_COLLECTION,
  RECOVERY_WINDOW_MS,
  isValidRecoveryToken,
} from "@/lib/cartRecovery";

function generateToken() {
  return crypto.randomUUID();
}

// يحفظ (أو يحدّث) لقطة السلة لنفس رقم الطلب ويرجّع التوكن الثابت ليها.
// كل حفظ بيحدّث اللقطة والتوقيت، فشباك الـ ٧٢ ساعة يبدأ من آخر نشاط للعميل.
export async function saveCartRecovery({ orderId, quote, now = () => new Date() }) {
  const existing = await serverOrderStore.get(CART_RECOVERY_ORDER_COLLECTION, orderId);
  const existingToken = existing?.data?.token;
  const token = isValidRecoveryToken(existingToken) ? existingToken.trim() : generateToken();
  const timestamp = now().toISOString();

  await serverOrderStore.commit([
    {
      collection: CART_RECOVERY_ORDER_COLLECTION,
      id: orderId,
      data: { token, updatedAt: timestamp },
    },
    {
      collection: CART_RECOVERY_COLLECTION,
      id: token,
      data: { orderId, quote, anchor: timestamp, updatedAt: timestamp },
    },
  ]);

  return token;
}

// يقرأ اللقطة بالتوكن. يرجّع null لو التوكن مشكوك أو اللقطة ناقصة.
export async function getCartRecovery(token) {
  if (!isValidRecoveryToken(token)) return null;
  const record = await serverOrderStore.get(CART_RECOVERY_COLLECTION, token.trim());
  const quote = record?.data?.quote;
  if (!quote || !Number.isFinite(Number(quote.total))) return null;
  const anchorMs = Date.parse(record.data.anchor || record.data.updatedAt || "");
  if (!Number.isFinite(anchorMs)) return null;
  return {
    orderId: typeof record.data.orderId === "string" ? record.data.orderId : "",
    quote,
    anchorMs,
    expiresAtMs: anchorMs + RECOVERY_WINDOW_MS,
  };
}
