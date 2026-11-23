import { expect, it } from "vitest";
import { getBrowserCheckoutAttempt, finishBrowserCheckoutAttempt } from "@/lib/checkoutAttemptBrowser";
const storage = () => { const m = new Map(); return { getItem: k => m.get(k), setItem: (k,v) => m.set(k,v), removeItem: k => m.delete(k) }; };
it("uses a stable UUID for same-tab retries and refresh, rotates only after explicit completion", () => {
  const s = storage(); const id = getBrowserCheckoutAttempt(s);
  expect(id).toMatch(/^WIND-D-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(getBrowserCheckoutAttempt(s)).toBe(id); finishBrowserCheckoutAttempt(s); expect(getBrowserCheckoutAttempt(s)).not.toBe(id);
});
it("storage failures stop checkout rather than silently creating random IDs", () => {
  expect(() => getBrowserCheckoutAttempt({ getItem: () => null, setItem: () => {} })).toThrow("CHECKOUT_STORAGE_UNAVAILABLE");
});
