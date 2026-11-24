import { describe, expect, it } from "vitest";
import { shouldRefreshSettingsOnPath } from "@/lib/settingsRefreshPolicy";

describe("settings refresh on navigation", () => {
  it("refreshes only on checkout paths", () => {
    expect(shouldRefreshSettingsOnPath("/checkout")).toBe(true);
    expect(shouldRefreshSettingsOnPath("/checkout/")).toBe(true);
  });
  it("does not refresh elsewhere", () => {
    for (const p of ["/", "/products/x", "/cart", "/thank-you", "/checkoutx", "/admin", null, undefined]) {
      expect(shouldRefreshSettingsOnPath(p)).toBe(false);
    }
  });
});
