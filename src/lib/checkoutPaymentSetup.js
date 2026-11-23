import { KASHIER_CONFIG, CURRENCY, BRAND_COLOR } from "@/lib/constants";
import { OrderStoreError } from "@/lib/serverOrderStore";

export function assertCheckoutPaymentConfiguration(paymentMethod) {
  if (paymentMethod !== "card") return;
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!process.env.KASHIER_MERCHANT_ID || !process.env.KASHIER_API_KEY || !base) throw new OrderStoreError("PAYMENT_NOT_CONFIGURED");
  let url; try { url = new URL(base); } catch (_) { throw new OrderStoreError("PAYMENT_BASE_URL_INVALID"); }
  if (url.protocol !== "https:" || !["windeg.com", "www.windeg.com"].includes(url.hostname) || url.username || url.password) throw new OrderStoreError("PAYMENT_BASE_URL_INVALID");
}
export async function checkoutIframeData(orderId, total) {
  assertCheckoutPaymentConfiguration("card");
  const merchantId = process.env.KASHIER_MERCHANT_ID;
  const amount = Number(total).toFixed(2);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.KASHIER_API_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`/?payment=${merchantId}.${orderId}.${amount}.${CURRENCY}`));
  const hash = [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return { merchantId, hash, orderId, amount, currency: CURRENCY, mode: KASHIER_CONFIG.MODE,
    merchantRedirect: `${process.env.NEXT_PUBLIC_BASE_URL}/thank-you`, failureRedirect: `${process.env.NEXT_PUBLIC_BASE_URL}/failed`,
    allowedMethods: KASHIER_CONFIG.ALLOWED_METHODS, display: KASHIER_CONFIG.DISPLAY_LANGUAGE, brandColor: BRAND_COLOR };
}
