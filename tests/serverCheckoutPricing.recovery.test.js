import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => {
  const state = { docs: new Map(), offers: [] };
  return {
    state,
    getDb: vi.fn(() => ({ testDatabase: true })),
    doc: vi.fn((_db, collectionName, id) => ({ kind: "document", collection: collectionName, id: String(id) })),
    collection: vi.fn((_db, collectionName) => ({ kind: "collection", collection: collectionName })),
    where: vi.fn((field, operator, value) => ({ field, operator, value })),
    limit: vi.fn((value) => ({ kind: "limit", value })),
    query: vi.fn((target, ...constraints) => ({ ...target, kind: "query", constraints })),
    getDoc: vi.fn(async (reference) => {
      const value = state.docs.get(`${reference.collection}/${reference.id}`);
      return { id: reference.id, exists: () => value !== undefined, data: () => value };
    }),
    getDocs: vi.fn(async (reference) => {
      if (reference.collection === "offers" && reference.kind === "collection") {
        const docs = state.offers.map(({ id, ...data }) => ({ id, data: () => data }));
        return { docs, empty: docs.length === 0 };
      }
      if (reference.kind === "query") {
        const handleFilter = (reference.constraints || []).find((c) => c.field === "handle");
        const docs = [...state.docs.entries()]
          .filter(([key]) => key.startsWith(`${reference.collection}/`))
          .map(([key, data]) => ({ id: key.slice(reference.collection.length + 1), data: () => data }))
          .filter((productDoc) => !handleFilter || productDoc.data().handle === handleFilter.value)
          .slice(0, 1);
        return { docs, empty: docs.length === 0 };
      }
      return { docs: [], empty: true };
    }),
  };
});

const recoveryStoreMocks = vi.hoisted(() => ({ getCartRecovery: vi.fn() }));

vi.mock("@/lib/firebase", () => ({ getDb: firestoreMocks.getDb }));
vi.mock("firebase/firestore/lite", () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  limit: firestoreMocks.limit,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
}));

// Reads that moved to the service-account store (Customers, promoCodes) are
// served from the same in-memory docs as the client-SDK mocks.
vi.mock("@/lib/serverOrderStore", () => ({
  OrderStoreError: class extends Error {},
  serverOrderStore: {
    getData: async (collectionName, id) => firestoreMocks.state.docs.get(`${collectionName}/${id}`) ?? null,
    query: async (collectionName, { filters = [] } = {}) =>
      [...firestoreMocks.state.docs.entries()]
        .filter(([key]) => key.startsWith(`${collectionName}/`))
        .map(([key, data]) => ({ id: key.slice(collectionName.length + 1), data, version: "v1" }))
        .filter((row) => filters.every((f) => {
          const value = row.data[f.field];
          if (f.op === "EQUAL") return value === f.value;
          if (f.op === "GREATER_THAN_OR_EQUAL") return value >= f.value;
          if (f.op === "LESS_THAN_OR_EQUAL") return value <= f.value;
          return false;
        })),
  },
}));

vi.mock("@/lib/cartRecoveryStore", () => ({
  getCartRecovery: recoveryStoreMocks.getCartRecovery,
}));

import { createServerCheckoutQuote } from "@/lib/serverCheckoutPricing";
import { RECOVERY_WINDOW_MS } from "@/lib/cartRecovery";

const TOKEN = "123e4567-e89b-42d3-a456-426614174000";

const snapshotQuote = {
  subtotal: 500,
  discount: 100,
  shipping: 0,
  total: 400,
  discountSource: "offer",
  appliedOffer: { id: "off1", name: "عرض قديم" },
  appliedPromo: null,
  discountLines: [{ label: "عرض قديم", amount: 100 }],
  lineItems: [],
  cartItems: [
    {
      id: "P1",
      productId: "P1",
      handle: "p1",
      productHandle: "p1",
      title: "تيشيرت",
      price: 250,
      compareAtPrice: null,
      qty: 2,
      selectedSize: "M",
      selectedColor: "black",
      image: "",
    },
  ],
  customerChoiceGiftSelections: [],
  freeShipping: true,
};

const matchingCart = [{ id: "P1", qty: 2, selectedSize: "M", selectedColor: "black", price: 9999 }];

function recoveryRecord(overrides = {}) {
  const now = Date.now();
  return {
    orderId: "WIND-12345-AB",
    quote: snapshotQuote,
    anchorMs: now - 60 * 60 * 1000,
    expiresAtMs: now - 60 * 60 * 1000 + RECOVERY_WINDOW_MS,
    ...overrides,
  };
}

beforeEach(() => {
  firestoreMocks.state.docs.clear();
  firestoreMocks.state.offers = [];
  firestoreMocks.state.docs.set("products/P1", {
    handle: "p1",
    title: "تيشيرت",
    price: 250,
    images: [],
    variants: [{ option1Value: "black", option2Value: "M" }],
  });
  recoveryStoreMocks.getCartRecovery.mockReset();
});

describe("createServerCheckoutQuote with a recovery token", () => {
  it("replays the signed snapshot when the cart matches and the window is open", async () => {
    recoveryStoreMocks.getCartRecovery.mockResolvedValue(recoveryRecord());

    const quote = await createServerCheckoutQuote({
      orderId: "WIND-99999-ZZ",
      cartItems: matchingCart,
      recoveryToken: TOKEN,
      customerEmail: "a@b.com",
      customerPhone: "01000000000",
    });

    expect(quote.recoveredFromCart).toBe(true);
    expect(quote.total).toBe(400);
    expect(quote.appliedOffer).toMatchObject({ name: "عرض قديم" });
  });

  it("prices normally when the cart no longer matches the snapshot", async () => {
    recoveryStoreMocks.getCartRecovery.mockResolvedValue(recoveryRecord());

    const quote = await createServerCheckoutQuote({
      orderId: "WIND-99999-ZZ",
      cartItems: [{ id: "P1", qty: 1, selectedSize: "M", selectedColor: "black" }],
      recoveryToken: TOKEN,
    });

    expect(quote.recoveredFromCart).toBeUndefined();
    expect(quote.total).not.toBe(400);
  });

  it("prices normally after the 72 hour window", async () => {
    const now = Date.now();
    recoveryStoreMocks.getCartRecovery.mockResolvedValue(
      recoveryRecord({
        anchorMs: now - 4 * 24 * 60 * 60 * 1000,
        expiresAtMs: now - 1000,
      })
    );

    const quote = await createServerCheckoutQuote({
      orderId: "WIND-99999-ZZ",
      cartItems: matchingCart,
      recoveryToken: TOKEN,
    });

    expect(quote.recoveredFromCart).toBeUndefined();
  });

  it("prices normally when a different promo code is typed", async () => {
    recoveryStoreMocks.getCartRecovery.mockResolvedValue(recoveryRecord());

    // اللقطة مرفوضة، والمسار العادي بيتعامل مع الكود الجديد (هنا كود غير موجود
    // فيرفضه بنفس خطأ التسعير العادي، مش بسعر اللقطة).
    await expect(
      createServerCheckoutQuote({
        orderId: "WIND-99999-ZZ",
        cartItems: matchingCart,
        recoveryToken: TOKEN,
        promoCode: "NEWCODE",
      })
    ).rejects.toThrow("كود الخصم غير صالح");
    expect(recoveryStoreMocks.getCartRecovery).toHaveBeenCalledWith(TOKEN);
  });

  it("does not replay when a snapshot product is gone; the normal path reports it", async () => {
    firestoreMocks.state.docs.delete("products/P1");
    recoveryStoreMocks.getCartRecovery.mockResolvedValue(recoveryRecord());

    // اللقطة مرفوضة، والمسار العادي بيرمي خطأ المنتج المعتاد بدل ما يكرّم سعر منتج محذوف.
    await expect(
      createServerCheckoutQuote({
        orderId: "WIND-99999-ZZ",
        cartItems: matchingCart,
        recoveryToken: TOKEN,
      })
    ).rejects.toThrow();
  });

  it("fails open to normal pricing when the recovery store is unavailable", async () => {
    recoveryStoreMocks.getCartRecovery.mockRejectedValue(new Error("store down"));

    const quote = await createServerCheckoutQuote({
      orderId: "WIND-99999-ZZ",
      cartItems: matchingCart,
      recoveryToken: TOKEN,
    });

    expect(quote.recoveredFromCart).toBeUndefined();
    expect(quote.total).toBeGreaterThan(0);
  });

  it("ignores the token entirely when none is passed", async () => {
    const quote = await createServerCheckoutQuote({
      orderId: "WIND-99999-ZZ",
      cartItems: matchingCart,
    });

    expect(quote.recoveredFromCart).toBeUndefined();
    expect(recoveryStoreMocks.getCartRecovery).not.toHaveBeenCalled();
  });
});
