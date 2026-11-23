import { describe, expect, it } from "vitest";
import { DEFAULT_NEWSLETTER_SUBTITLE, DEFAULT_NEWSLETTER_TITLE } from "@/lib/subscriberDiscount";

describe("footer newsletter text defaults", () => {
  it("keeps the current text as the default", () => {
    expect(DEFAULT_NEWSLETTER_TITLE).toBe("اشترك واحصل على خصم 10%");
    expect(DEFAULT_NEWSLETTER_SUBTITLE).toBe("على أول طلب");
  });
});
