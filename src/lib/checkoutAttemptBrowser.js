// Same-tab stable identity. Storage failure is an explicit stop, never a random retry ID.
const KEY = "wind_durable_checkout_attempt_v1";
export function durableCheckoutEnabled() { return process.env.NEXT_PUBLIC_DURABLE_CHECKOUT_ENABLED === "true"; }
export function getBrowserCheckoutAttempt(storage, cryptoProvider = crypto) {
  const existing = storage.getItem(KEY);
  if (existing && /^WIND-D-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  const id = `WIND-D-${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  storage.setItem(KEY, id);
  if (storage.getItem(KEY) !== id) throw new Error("CHECKOUT_STORAGE_UNAVAILABLE");
  return id;
}
export function finishBrowserCheckoutAttempt(storage) { storage.removeItem(KEY); }
