import { describe, expect, it } from "vitest";
import {
  buildTrustedCustomerChoiceGiftSelection,
  getCustomerChoiceGiftIdentityKeys,
  isCustomerChoiceGiftAllowed,
} from "@/lib/customerChoiceGiftPricing";

const offer = {
  type: "buy_x_get_y_select_gift",
  giftProductIds: ["gift-product-id", "gift-handle"],
};

describe("trusted customer-choice gift resolution helpers", () => {
  it("matches the gift allowlist by Firestore product ID", () => {
    expect(isCustomerChoiceGiftAllowed(
      { id: "gift-product-id" },
      { id: "gift-product-id", handle: "gift-shirt" },
      [offer]
    )).toBe(true);
  });

  it("matches the gift allowlist by product handle", () => {
    expect(isCustomerChoiceGiftAllowed(
      { id: "some-client-id", handle: "gift-handle" },
      { id: "gift-product-id", handle: "gift-handle" },
      [offer]
    )).toBe(true);
  });

  it("rejects products outside every active gift allowlist", () => {
    expect(isCustomerChoiceGiftAllowed(
      { id: "outside" },
      { id: "outside", handle: "outside-handle" },
      [offer]
    )).toBe(false);
  });

  it("uses Firestore identity and price instead of client-supplied values", () => {
    const result = buildTrustedCustomerChoiceGiftSelection(
      {
        selectionId: "selection-1",
        id: "gift-product-id",
        title: "Fake client title",
        price: 0.01,
        qty: 500,
        selectedColor: "نبيتي",
        selectedSize: "L",
      },
      {
        id: "gift-product-id",
        handle: "gift-shirt",
        title: "Gift Shirt",
        price: "250",
        images: ["https://example.com/gift.jpg"],
      },
      250
    );

    expect(result).toMatchObject({
      selectionId: "selection-1",
      id: "gift-product-id",
      productId: "gift-product-id",
      handle: "gift-shirt",
      title: "Gift Shirt",
      price: 250,
      qty: 1,
      selectedColor: "نبيتي",
      selectedSize: "L",
      image: "https://example.com/gift.jpg",
    });
  });

  it("preserves resolved aliases for allowlist matching", () => {
    expect(getCustomerChoiceGiftIdentityKeys(
      { id: "client-id", productHandle: "gift-handle" },
      { id: "firestore-id", handle: "gift-handle" }
    )).toEqual(["client-id", "gift-handle", "firestore-id"]);
  });

  it("preserves a requested ID alias when Firestore resolves a redirected product", () => {
    const result = buildTrustedCustomerChoiceGiftSelection(
      { selectionId: "redirected-1", id: "gift-old-id" },
      { id: "gift-new-id", handle: "gift-new-handle", title: "Gift", price: 180 },
      180
    );

    expect(result).toMatchObject({
      id: "gift-new-id",
      requestedProductId: "gift-old-id",
    });
    expect(isCustomerChoiceGiftAllowed(
      { id: "gift-old-id" },
      { id: result.id, handle: result.handle },
      [{ ...offer, giftProductIds: ["gift-old-id"] }]
    )).toBe(true);
  });

  it("rejects incomplete or invalid trusted product data", () => {
    expect(buildTrustedCustomerChoiceGiftSelection({}, null, 200)).toBeNull();
    expect(buildTrustedCustomerChoiceGiftSelection({ selectionId: "x" }, { id: "a" }, NaN)).toBeNull();
    expect(buildTrustedCustomerChoiceGiftSelection({ selectionId: "" }, { id: "a" }, 200)).toBeNull();
  });
});
