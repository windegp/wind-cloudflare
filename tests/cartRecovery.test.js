import { describe, expect, it } from "vitest";
import {
  RECOVERY_LINK_TTL_MS,
  RECOVERY_WINDOW_MS,
  cartMatchesRecoveryItems,
  giftSelectionsMatch,
  isRecoveryActive,
  isRecoveryLinkAlive,
  isValidRecoveryToken,
  sanitizeRecoveryContact,
  toPublicRecoveryCart,
} from "@/lib/cartRecovery";

const VALID_TOKEN = "123e4567-e89b-42d3-a456-426614174000";

describe("isValidRecoveryToken", () => {
  it("accepts a v4 uuid and rejects anything else", () => {
    expect(isValidRecoveryToken(VALID_TOKEN)).toBe(true);
    expect(isValidRecoveryToken(` ${VALID_TOKEN} `)).toBe(true);
    expect(isValidRecoveryToken("WIND-12345-AB")).toBe(false);
    expect(isValidRecoveryToken("123e4567-e89b-12d3-a456-426614174000")).toBe(false); // not v4
    expect(isValidRecoveryToken("")).toBe(false);
    expect(isValidRecoveryToken(null)).toBe(false);
    expect(isValidRecoveryToken(123)).toBe(false);
  });
});

describe("cartMatchesRecoveryItems", () => {
  const snapshot = [
    { id: "P1", selectedSize: "M", selectedColor: "black", qty: 2 },
    { id: "P2", selectedSize: "", selectedColor: "", qty: 1 },
  ];

  it("matches the same lines regardless of order", () => {
    const cart = [
      { id: "P2", selectedSize: "", selectedColor: "", qty: 1 },
      { id: "P1", selectedSize: "M", selectedColor: "black", qty: 2 },
    ];
    expect(cartMatchesRecoveryItems(cart, snapshot)).toBe(true);
  });

  it("rejects any quantity, variant, product or count change", () => {
    expect(
      cartMatchesRecoveryItems([{ id: "P1", selectedSize: "M", selectedColor: "black", qty: 1 },
        { id: "P2", selectedSize: "", selectedColor: "", qty: 1 }], snapshot)
    ).toBe(false);
    expect(
      cartMatchesRecoveryItems([{ id: "P1", selectedSize: "L", selectedColor: "black", qty: 2 },
        { id: "P2", selectedSize: "", selectedColor: "", qty: 1 }], snapshot)
    ).toBe(false);
    expect(cartMatchesRecoveryItems([snapshot[0]], snapshot)).toBe(false);
    expect(cartMatchesRecoveryItems([...snapshot, { id: "P3", qty: 1 }], snapshot)).toBe(false);
    expect(cartMatchesRecoveryItems([], snapshot)).toBe(false);
    expect(cartMatchesRecoveryItems(null, snapshot)).toBe(false);
  });

  it("accepts quantity under either key name", () => {
    const cart = [
      { id: "P1", selectedSize: "M", selectedColor: "black", quantity: 2 },
      { id: "P2", selectedSize: "", selectedColor: "", quantity: 1 },
    ];
    expect(cartMatchesRecoveryItems(cart, snapshot)).toBe(true);
  });
});

describe("giftSelectionsMatch", () => {
  const selection = { selectionId: "s1", productId: "G1", selectedColor: "red", selectedSize: "M" };

  it("treats missing selections on both sides as a match", () => {
    expect(giftSelectionsMatch(undefined, undefined)).toBe(true);
    expect(giftSelectionsMatch([], undefined)).toBe(true);
  });

  it("matches identical selections and rejects changes", () => {
    expect(giftSelectionsMatch([selection], [selection])).toBe(true);
    expect(giftSelectionsMatch([{ ...selection, selectedSize: "L" }], [selection])).toBe(false);
    expect(giftSelectionsMatch([], [selection])).toBe(false);
  });
});

describe("recovery windows", () => {
  const anchor = Date.parse("2026-11-26T10:00:00.000Z");
  const recovery = { anchorMs: anchor, expiresAtMs: anchor + RECOVERY_WINDOW_MS };

  it("honors the snapshot for 72 hours from the anchor", () => {
    expect(isRecoveryActive(recovery, anchor + 1000)).toBe(true);
    expect(isRecoveryActive(recovery, anchor + RECOVERY_WINDOW_MS)).toBe(true);
    expect(isRecoveryActive(recovery, anchor + RECOVERY_WINDOW_MS + 1)).toBe(false);
  });

  it("keeps the link alive for 7 days, longer than the honoring window", () => {
    expect(RECOVERY_LINK_TTL_MS).toBeGreaterThan(RECOVERY_WINDOW_MS);
    expect(isRecoveryLinkAlive(recovery, anchor + RECOVERY_WINDOW_MS + 1000)).toBe(true);
    expect(isRecoveryLinkAlive(recovery, anchor + RECOVERY_LINK_TTL_MS + 1)).toBe(false);
  });
});

describe("sanitizeRecoveryContact", () => {
  it("keeps only known fields, trimmed and capped", () => {
    const contact = sanitizeRecoveryContact({
      firstName: "  إسلام  ",
      lastName: "",
      email: "a@b.com",
      phone: "01000000001",
      address: "ع".repeat(500),
      password: "secret", // حقل غير معروف يتشال
      cardNumber: "4111111111111111",
    });
    expect(contact).toEqual({
      firstName: "إسلام",
      email: "a@b.com",
      phone: "01000000001",
      address: "ع".repeat(200),
    });
    expect(JSON.stringify(contact)).not.toContain("4111111111111111");
    expect(JSON.stringify(contact)).not.toContain("secret");
  });

  it("returns null for empty or invalid input", () => {
    expect(sanitizeRecoveryContact(null)).toBeNull();
    expect(sanitizeRecoveryContact("x")).toBeNull();
    expect(sanitizeRecoveryContact({ firstName: "   ", hacker: "y" })).toBeNull();
  });
});

describe("toPublicRecoveryCart", () => {
  it("returns items, summary and sanitized prefill contact, never quote-internal identity", () => {
    const now = Date.now();
    const recovery = {
      anchorMs: now - 1000,
      expiresAtMs: now + RECOVERY_WINDOW_MS,
      quote: {
        total: 750,
        appliedOffer: { name: "عرض القطعتين" },
        appliedPromo: { code: "SAVE10" },
        cartItems: [
          {
            id: "P1",
            title: "تيشيرت",
            price: 250,
            compareAtPrice: 300,
            image: "https://example.com/p1.jpg",
            selectedColor: "black",
            selectedSize: "M",
            qty: 2,
          },
          { id: "", qty: 1 }, // سطر ناقص يتشال
        ],
        customerChoiceGiftSelections: [
          { selectionId: "s1", id: "G1", productId: "G1", handle: "gift", title: "هدية", price: 0, selectedColor: "", selectedSize: "One Size" },
        ],
        // بيانات عميل محتملة في اللقطة — ممنوع تسرب
        customerIdentity: { email: "x@example.com", phone: "01000000000" },
      },
    };

    const result = toPublicRecoveryCart(recovery, now);
    expect(result.honored).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "P1", name: "تيشيرت", price: 250, qty: 2 });
    expect(result.giftSelections).toHaveLength(1);
    expect(result.total).toBe(750);
    expect(result.offerName).toBe("عرض القطعتين");
    expect(result.promoCode).toBe("SAVE10");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("x@example.com");
    expect(serialized).not.toContain("01000000000");
    expect(result.contact).toBeNull();
  });

  it("exposes the stored contact for checkout prefill (behind the secret token)", () => {
    const now = Date.now();
    const recovery = {
      anchorMs: now - 1000,
      expiresAtMs: now + RECOVERY_WINDOW_MS,
      quote: { total: 100, cartItems: [{ id: "P1", qty: 1, price: 100 }] },
      contact: { firstName: "إسلام", phone: "01000000001", address: "١٢ ش التحرير", injected: "drop-me" },
    };

    const result = toPublicRecoveryCart(recovery, now);
    expect(result.contact).toEqual({ firstName: "إسلام", phone: "01000000001", address: "١٢ ش التحرير" });
    expect(JSON.stringify(result)).not.toContain("drop-me");
  });

  it("marks the snapshot as not honored after the window", () => {
    const now = Date.now();
    const recovery = {
      anchorMs: now - 4 * 24 * 60 * 60 * 1000,
      expiresAtMs: now - 1000,
      quote: { total: 100, cartItems: [] },
    };
    expect(toPublicRecoveryCart(recovery, now).honored).toBe(false);
  });
});
