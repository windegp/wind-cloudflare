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
  const q = (over = {}) => ({ discountSource: "subscriber", subtotal: 1000, discount: 150, shipping: 0, total: 850, subscriberDiscount: { name: "خصم الأصدقاء" }, ...over });
  it("shows the admin name, discount and updated total", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: q() })).toMatchObject({ applies: true, discount: 150, total: 850, lines: [{ label: "خصم الأصدقاء", amount: 150 }] });
  });
  it("shows nothing extra without a live quote or for other sources", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: null }).applies).toBe(false);
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: q({ discountSource: "offer" }) }).applies).toBe(true);
  });
  it("ignores a stale quote for a different subtotal", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, liveQuote: q({ subtotal: 900 }) }).applies).toBe(false);
  });
  it("adopts a current server quote even when it removes a stale client discount", () => {
    expect(resolveLiveSubscriberDisplay({ ...base, discount: 200, liveQuote: q() })).toMatchObject({ applies: true, discount: 150 });
  });
});

describe("live display with a stacked code", () => {
  it("shows the code and the subscriber discount as two separate lines", () => {
    const r = resolveLiveSubscriberDisplay({
      liveQuote: { discountSource: "promo", subtotal: 1000, discount: 200, shipping: 70, total: 870, promoDiscountAmount: 100, stackedDiscount: { source: "subscriber", amount: 100, label: "خصم الأصدقاء" } },
      subtotal: 1000, discount: 100, discountLabel: "خصم الكود", total: 970, promoLabel: "خصم الكود",
    });
    expect(r.applies).toBe(true);
    expect(r.lines).toEqual([{ label: "خصم الكود", amount: 100 }, { label: "خصم الأصدقاء", amount: 100 }]);
    expect(r.total).toBe(870);
  });
});

import { resolveNewsletterText, GENERIC_NEWSLETTER_TITLE } from "@/lib/subscriberDiscount";

describe("footer newsletter text follows the subscriber discount toggle", () => {
  const on = { subscriberDiscount: { enabled: true, type: "percent", value: 10 } };
  it("enabled: shows the default text, or the admin override", () => {
    expect(resolveNewsletterText(on)).toMatchObject({ title: DEFAULT_NEWSLETTER_TITLE, subtitle: DEFAULT_NEWSLETTER_SUBTITLE, discountOn: true });
    expect(resolveNewsletterText({ ...on, newsletterTitle: "خصم 20%", newsletterSubtitle: "على أول طلب" }).title).toBe("خصم 20%");
  });
  it("disabled or missing: generic line, discount text hidden even if an override is saved", () => {
    const off = { subscriberDiscount: { enabled: false, type: "percent", value: 10 }, newsletterTitle: "خصم 20%" };
    expect(resolveNewsletterText(off)).toMatchObject({ title: GENERIC_NEWSLETTER_TITLE, subtitle: "", discountOn: false });
    expect(resolveNewsletterText(undefined).title).toBe(GENERIC_NEWSLETTER_TITLE);
  });
});

describe("live quote shipping in a stacked checkout", () => {
  it("uses the quote shipping and total along with both cash lines", () => {
    const result = resolveLiveSubscriberDisplay({
      liveQuote: { subtotal: 1000, discountSource: "promo", discount: 250, shipping: 0, total: 750,
        promoDiscountAmount: 100, stackedDiscount: { source: "subscriber", label: "خصم المشتركين", amount: 150 } },
      subtotal: 1000, discount: 100, discountLabel: "خصم الكود", shipping: 70, total: 970,
    });
    expect(result).toMatchObject({ applies: true, shipping: 0, total: 750, discount: 250 });
    expect(result.lines.map(line => line.amount)).toEqual([100, 150]);
  });
  it("keeps client shipping when no live discount applies", () => {
    expect(resolveLiveSubscriberDisplay({ liveQuote: null, subtotal: 1000, discount: 0, shipping: 70, total: 1070 }).shipping).toBe(70);
  });
});
