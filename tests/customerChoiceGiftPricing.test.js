import { describe, expect, it } from "vitest";
import {
  buildTrustedCustomerChoiceGiftSelection,
  getCustomerChoiceGiftIdentityKeys,
  hasPotentiallyCompleteCustomerChoiceGiftOffer,
  isCustomerChoiceGiftAllowed,
} from "@/lib/customerChoiceGiftPricing";

const offer = {
  type: "buy_x_get_y_select_gift",
  giftProductIds: ["gift-product-id", "gift-handle"],
};

describe("trusted customer-choice gift resolution helpers", () => {
  it("skips Firestore gift resolution when the selected count is incomplete", () => {
    const offer = {
      type: "buy_x_get_y_select_gift",
      active: true,
      config: { buyQty: 2, getQty: 2 },
      purchaseProductIds: ["A", "B"],
      giftProductIds: ["G"],
    };
    const purchases = [
      { id: "A", price: 500, qty: 1 },
      { id: "B", price: 400, qty: 1 },
    ];
    expect(hasPotentiallyCompleteCustomerChoiceGiftOffer(
      purchases,
      [{ selectionId: "gift-1" }],
      [offer]
    )).toBe(false);
  });

  it("recognizes a redirected purchase product through its server-verified original ID", () => {
    const offer = {
      type: "buy_x_get_y_select_gift",
      active: true,
      config: { buyQty: 2, getQty: 1 },
      purchaseProductIds: ["old-product-id"],
      giftProductIds: ["G"],
    };
    const purchases = [
      { id: "new-product-id", handle: "new-handle", requestedProductId: "old-product-id", price: 500, qty: 2 },
    ];
    expect(hasPotentiallyCompleteCustomerChoiceGiftOffer(
      purchases,
      [{ selectionId: "gift-1" }],
      [offer]
    )).toBe(true);
  });

  it("preflights mixed purchase products and the exact required gift count", () => {
    const offer = {
      type: "buy_x_get_y_select_gift",
      active: true,
      config: { buyQty: 2, getQty: 1 },
      purchaseProductIds: ["A", "B"],
      giftProductIds: ["G"],
    };
    const purchases = [
      { id: "A", price: 500, qty: 1 },
      { id: "B", price: 400, qty: 1 },
      { id: "OUTSIDE", price: 900, qty: 4 },
    ];
    expect(hasPotentiallyCompleteCustomerChoiceGiftOffer(
      purchases,
      [{ selectionId: "gift-1" }],
      [offer]
    )).toBe(true);
    expect(hasPotentiallyCompleteCustomerChoiceGiftOffer(
      purchases,
      [{ selectionId: "gift-1" }, { selectionId: "gift-2" }],
      [offer]
    )).toBe(false);
  });

  it("matches the gift allowlist by Firestore product ID", () => {
    expect(isCustomerChoiceGiftAllowed(
      { id: "gift-product-id", handle: "gift-shirt" },
      [offer]
    )).toBe(true);
  });

  it("matches the gift allowlist by product handle", () => {
    expect(isCustomerChoiceGiftAllowed(
      { id: "gift-product-id", handle: "gift-handle" },
      [offer]
    )).toBe(true);
  });

  it("rejects products outside every active gift allowlist", () => {
    expect(isCustomerChoiceGiftAllowed(
      { id: "outside", handle: "outside-handle" },
      [offer]
    )).toBe(false);
  });

  it("does not accept a client alias when the resolved Firestore product is outside the allowlist", () => {
    expect(isCustomerChoiceGiftAllowed(
      {
        id: "outside-product-id",
        handle: "outside-product-handle",
        _resolvedIdentifiers: ["outside-product-id"],
      },
      [offer]
    )).toBe(false);
  });

  it("ignores productId aliases stored on the document when checking the allowlist", () => {
    expect(isCustomerChoiceGiftAllowed(
      {
        id: "outside-document-id",
        handle: "outside-document-handle",
        productId: "gift-product-id",
        productHandle: "gift-handle",
        _resolvedIdentifiers: ["outside-document-id"],
      },
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
      { id: "client-id", handle: "gift-handle" },
      { id: "firestore-id", handle: "gift-handle" }
    )).toEqual(["client-id", "gift-handle", "firestore-id"]);
  });

  it("preserves a requested ID alias when Firestore resolves a redirected product", () => {
    const result = buildTrustedCustomerChoiceGiftSelection(
      { selectionId: "redirected-1", id: "gift-old-id" },
      { id: "gift-new-id", handle: "gift-new-handle", title: "Gift", price: 180, _resolvedIdentifiers: ["gift-old-id"] },
      180
    );

    expect(result).toMatchObject({
      id: "gift-new-id",
      requestedProductId: "gift-old-id",
    });
    expect(isCustomerChoiceGiftAllowed(
      { id: result.id, handle: result.handle, _resolvedIdentifiers: ["gift-old-id"] },
      [{ ...offer, giftProductIds: ["gift-old-id"] }]
    )).toBe(true);
  });

  it("uses only a Firestore-resolved identifier for redirected product matching", () => {
    const result = buildTrustedCustomerChoiceGiftSelection(
      {
        selectionId: "spoof-check",
        id: "client-fake-id",
        handle: "client-fake-handle",
      },
      {
        id: "firestore-product-id",
        handle: "firestore-product-handle",
        _resolvedIdentifiers: ["firestore-product-id"],
      },
      220
    );
    expect(result.requestedProductId).toBe("firestore-product-id");
  });

  it("rejects incomplete or invalid trusted product data", () => {
    expect(buildTrustedCustomerChoiceGiftSelection({}, null, 200)).toBeNull();
    expect(buildTrustedCustomerChoiceGiftSelection({ selectionId: "x" }, { id: "a" }, NaN)).toBeNull();
    expect(buildTrustedCustomerChoiceGiftSelection({ selectionId: "" }, { id: "a" }, 200)).toBeNull();
  });
});
