import { describe, expect, it } from "vitest";
import { buildKashierCheckoutUrl, KASHIER_SERVER_WEBHOOK_URL } from "@/lib/kashierCheckoutUrl";

const data = { merchantId: "MID-1", orderId: "WIND-1-AB", amount: "450.00", currency: "EGP", hash: "abc123", merchantRedirect: "https://windeg.com/thank-you?x=1&y=2", failureRedirect: "https://windeg.com/checkout", allowedMethods: "card,wallet", display: "ar", brandColor: "#000000", mode: "live" };

describe("buildKashierCheckoutUrl", () => {
  const url = buildKashierCheckoutUrl(data);
  const q = new URL(url).searchParams;
  it("keeps every original parameter, including the hash, unchanged", () => {
    expect(url.startsWith("https://checkout.kashier.io?merchantId=MID-1&orderId=WIND-1-AB&amount=450.00&currency=EGP&hash=abc123&")).toBe(true);
    expect(q.get("hash")).toBe("abc123");
    expect(q.get("merchantRedirect")).toBe("https://windeg.com/thank-you?x=1&y=2");
    expect(q.get("redirectMethod")).toBe("get");
    expect(q.get("mode")).toBe("live");
    expect(q.get("metaData")).toBe("embedded");
  });
  it("adds serverWebhook, properly encoded", () => {
    expect(url).toContain("&serverWebhook=https%3A%2F%2Fwindeg.com%2Fapi%2Fwebhooks%2Fkashier&");
    expect(q.get("serverWebhook")).toBe("https://windeg.com/api/webhooks/kashier");
    expect(KASHIER_SERVER_WEBHOOK_URL).toBe("https://windeg.com/api/webhooks/kashier");
  });
  it("is the only difference from the previous URL", () => {
    const without = url.replace("&serverWebhook=" + encodeURIComponent(KASHIER_SERVER_WEBHOOK_URL), "");
    expect(without.endsWith("&mode=live&metaData=embedded")).toBe(true);
  });
});
