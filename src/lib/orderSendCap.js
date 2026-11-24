import { getKV } from "@/lib/kv-cache";

// Max confirmation sends (admin email, customer email, push) per order ID.
// One normal send plus one retry after a lost response.
export const MAX_ORDER_SENDS = 2;
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Counts a send attempt for this order ID and says whether it may go ahead.
 * Fails open (allowed) when KV is unavailable or errors, like the IP limiter.
 * KV read-then-write is not atomic, so two simultaneous calls can both pass;
 * this stops repeat abuse of one signed quote, not a perfectly exact count.
 */
export async function claimOrderSend(orderId) {
  try {
    const kv = await getKV();
    if (!kv || typeof orderId !== "string" || !orderId) return true;
    const key = `create_order_sends_${orderId}`;
    const current = Number.parseInt((await kv.get(key)) ?? "0", 10) || 0;
    if (current >= MAX_ORDER_SENDS) return false;
    await kv.put(key, String(current + 1), { expirationTtl: TTL_SECONDS });
    return true;
  } catch (error) {
    console.error("[create-order] send cap check failed, allowing:", error);
    return true;
  }
}
