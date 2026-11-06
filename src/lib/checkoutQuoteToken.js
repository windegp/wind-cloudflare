function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToText(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getQuoteSecret() {
  const secret =
    process.env.CHECKOUT_QUOTE_SECRET ||
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.KASHIER_API_KEY;

  if (!secret) throw new Error("A server secret is required to sign checkout quotes.");
  return secret.replace(/\\n/g, "\n");
}

async function signPayload(payloadPart) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getQuoteSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart)
  );
  let binary = "";
  const bytes = new Uint8Array(signature);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Signs a server-calculated quote and binds it to a single order ID.
 * The token lives for 24 hours so card payments can complete without
 * requiring a fresh product/offer read on the thank-you callback.
 */
export async function signCheckoutQuote(quote, orderId) {
  if (!quote || !orderId) throw new Error("Checkout quote and order ID are required.");

  const payload = {
    version: 1,
    orderId: String(orderId),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    quote,
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(payloadPart);
  return payloadPart + "." + signature;
}

export async function verifyCheckoutQuote(token, orderId) {
  if (typeof token !== "string" || !token.includes(".") || !orderId) return null;

  const [payloadPart, receivedSignature, extra] = token.split(".");
  if (!payloadPart || !receivedSignature || extra !== undefined) return null;

  const expectedSignature = await signPayload(payloadPart);
  if (receivedSignature.length !== expectedSignature.length) return null;

  let signatureDiff = 0;
  for (let i = 0; i < receivedSignature.length; i++) {
    signatureDiff |= receivedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  if (signatureDiff !== 0) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToText(payloadPart));
  } catch {
    return null;
  }

  if (payload?.version !== 1) return null;
  if (payload.orderId !== String(orderId)) return null;
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) return null;
  if (!payload.quote || !Number.isFinite(Number(payload.quote.total))) return null;

  return payload.quote;
}
