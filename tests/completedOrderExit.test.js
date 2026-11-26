import { describe, expect, it } from "vitest";
import {
  COMPLETED_ORDER_EXIT_KEY,
  COMPLETED_ORDER_EXIT_MAX_AGE_MS,
  consumeCompletedOrderExit,
  markCompletedOrderExit,
} from "@/lib/completedOrderExit";

function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

describe("completedOrderExit flag", () => {
  it("marks and consumes a fresh completed order exactly once", () => {
    const storage = makeStorage();
    const now = Date.now();
    markCompletedOrderExit(storage, "WIND-12345-AB", now);

    expect(consumeCompletedOrderExit(storage, now + 1000)).toBe(true);
    // بتتستهلك مرة واحدة بس
    expect(consumeCompletedOrderExit(storage, now + 2000)).toBe(false);
  });

  it("returns false when no order was completed", () => {
    expect(consumeCompletedOrderExit(makeStorage())).toBe(false);
  });

  it("expires after the max age so later empty-cart visits stay put", () => {
    const storage = makeStorage();
    const now = Date.now();
    markCompletedOrderExit(storage, "WIND-12345-AB", now);
    expect(
      consumeCompletedOrderExit(storage, now + COMPLETED_ORDER_EXIT_MAX_AGE_MS + 1)
    ).toBe(false);
  });

  it("clears a stale or corrupted flag instead of acting on it", () => {
    const storage = makeStorage();
    storage.setItem(COMPLETED_ORDER_EXIT_KEY, "not-json");
    expect(consumeCompletedOrderExit(storage)).toBe(false);
    expect(storage.getItem(COMPLETED_ORDER_EXIT_KEY)).toBeNull();
  });

  it("ignores flags from the future or without an order id", () => {
    const storage = makeStorage();
    const now = Date.now();
    storage.setItem(COMPLETED_ORDER_EXIT_KEY, JSON.stringify({ orderId: "W", at: now + 60000 }));
    expect(consumeCompletedOrderExit(storage, now)).toBe(false);

    markCompletedOrderExit(storage, "", now);
    expect(consumeCompletedOrderExit(storage, now)).toBe(false);
  });

  it("does not throw when storage is unavailable", () => {
    expect(() => markCompletedOrderExit(null, "WIND-1")).not.toThrow();
    expect(consumeCompletedOrderExit(null)).toBe(false);
  });
});
