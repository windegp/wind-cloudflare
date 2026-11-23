import { describe, expect, it } from "vitest";
import { DEFAULT_NEWSLETTER_SUBTITLE, DEFAULT_NEWSLETTER_TITLE } from "@/lib/subscriberDiscount";

describe("footer newsletter text defaults", () => {
  it("keeps the current text as the default", () => {
    expect(DEFAULT_NEWSLETTER_TITLE).toBe("اشترك واحصل على خصم 10%");
    expect(DEFAULT_NEWSLETTER_SUBTITLE).toBe("على أول طلب");
  });
});

import { resolveLiveSubscriberDisplay } from "@/lib/subscriberDiscount";

describe("live subscriber display (display only)", () => {
  const base = { subtotal: 1000, discount: 0, discountLabel: "x", total: 1000 };
  const q = (over = {}) => ({ discountSource: "subscriber", subtotal: 1000, discount: 150, total: 850, subscriberDiscount: { name: "خصم الأصدقاء" }, ...over });
  it("shows the admin name, discount and updated total", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: q() })).toEqual({ applies: true, discount: 150, label: "خصم الأصدقاء", total: 850 });
  });
  it("shows nothing extra without a live quote or for other sources", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: null }).applies).toBe(false);
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: q({ discountSource: "offer" }) }).applies).toBe(false);
  });
  it("ignores a stale quote for a different subtotal", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: q({ subtotal: 900 }) }).applies).toBe(false);
  });
  it("does not override a larger client discount", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, discount: 200, liveQuote: q() }).applies).toBe(false);
  });
});
