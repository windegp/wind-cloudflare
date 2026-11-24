import { describe, expect, it } from "vitest";
import { routeSignalsReady } from "@/lib/loaderRoutes";

describe("routeSignalsReady", () => {
  it("is true for pages that call signalPageReady", () => {
    for (const p of ["/", "/products/abc", "/collections/men", "/policies/refund", "/thank-you", "/failure"]) {
      expect(routeSignalsReady(p)).toBe(true);
    }
  });
  it("is false for pages that never signal, so they are ready immediately", () => {
    for (const p of ["/track-order", "/contact-us", "/policies", "/collections", "/anything-else"]) {
      expect(routeSignalsReady(p)).toBe(false);
    }
  });
});
