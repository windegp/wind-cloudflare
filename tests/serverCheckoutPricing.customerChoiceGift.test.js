import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => {
  const state = {
    docs: new Map(),
    offers: [],
  };

  const mocks = {
    getDb: vi.fn(() => ({ testDatabase: true })),
    doc: vi.fn((_db, collectionName, id) => ({
      kind: "document",
      collection: collectionName,
      id: String(id),
    })),
    collection: vi.fn((_db, collectionName) => ({
      kind: "collection",
      collection: collectionName,
    })),
    where: vi.fn((field, operator, value) => ({ field, operator, value })),
    limit: vi.fn((value) => ({ kind: "limit", value })),
    query: vi.fn((target, ...constraints) => ({
      ...target,
      kind: "query",
      constraints,
    })),
    getDoc: vi.fn(async (reference) => {
      const value = state.docs.get(`${reference.collection}/${reference.id}`);
      return {
        id: reference.id,
        exists: () => value !== undefined,
        data: () => value,
      };
    }),
    getDocs: vi.fn(async (reference) => {
      if (reference.collection === "offers" && reference.kind === "collection") {
        const docs = state.offers.map(({ id, ...data }) => ({
          id,
          data: () => data,
        }));
        return { docs, empty: docs.length === 0 };
      }

      if (reference.collection === "products" && reference.kind === "query") {
        const handleFilter = (reference.constraints || []).find(
          (constraint) => constraint.field === "handle"
        );
        const docs = [...state.docs.entries()]
          .filter(([key]) => key.startsWith("products/"))
          .map(([key, data]) => ({
            id: key.slice("products/".length),
            data: () => data,
          }))
          .filter((productDoc) =>
            !handleFilter || productDoc.data().handle === handleFilter.value
          )
          .slice(0, 1);
        return { docs, empty: docs.length === 0 };
      }

      return { docs: [], empty: true };
    }),
    state,
  };

  return mocks;
});

vi.mock("@/lib/firebase", () => ({
  getDb: firestoreMocks.getDb,
}));

vi.mock("firebase/firestore/lite", () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  limit: firestoreMocks.limit,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
}));

import { createServerCheckoutQuote } from "@/lib/serverCheckoutPricing";

const choiceOffer = {
  id: "choice-offer",
  name: "اشترِ 2 واختر هدية",
  active: true,
  environment: "production",
  type: "buy_x_get_y_select_gift",
  config: { buyQty: 2, getQty: 1 },
  purchaseProductIds: ["A", "B"],
  giftProductIds: ["G"],
  priority: 1,
};

const cartItems = [
  { id: "A", qty: 1, price: 9999, title: "عنوان مزيف من المتصفح" },
  { id: "B", qty: 1, price: 9999, title: "عنوان مزيف من المتصفح" },
];

const selectedGift = {
  selectionId: "gift-selection-1",
  id: "G",
  productId: "G",
  price: 0.01,
  title: "هدية مزيفة من المتصفح",
  image: "https://untrusted.example/fake.jpg",
  selectedColor: "أحمر",
  selectedSize: "L",
};

function installFixture(offers = [choiceOffer]) {
  const { state } = firestoreMocks;
  state.docs.clear();
  state.offers = offers;

  state.docs.set("products/A", {
    handle: "purchase-a",
    title: "منتج الشراء A",
    price: 100,
    images: ["https://cdn.example/purchase-a.jpg"],
    variants: [],
  });
  state.docs.set("products/B", {
    handle: "purchase-b",
    title: "منتج الشراء B",
    price: 300,
    images: ["https://cdn.example/purchase-b.jpg"],
    variants: [],
  });
  state.docs.set("products/G", {
    handle: "gift-g",
    title: "الهدية G",
    price: 500,
    compareAtPrice: 600,
    folderName: "gift-g",
    mainImage: "gift-main.webp",
    variants: [],
  });
  state.docs.set("settings/siteSettings", {
    promotions: {
      shippingCost: 0,
      freeShippingThreshold: 50000,
    },
  });
}

function quoteInput(overrides = {}) {
  return {
    offersEnvironment: "production",
    governorate: "Cairo",
    cartItems,
    customerChoiceGiftSelections: [selectedGift],
    ...overrides,
  };
}

describe("server checkout quote: customer-choice gifts", () => {
  beforeEach(() => {
    installFixture();
    firestoreMocks.getDb.mockClear();
    firestoreMocks.doc.mockClear();
    firestoreMocks.collection.mockClear();
    firestoreMocks.where.mockClear();
    firestoreMocks.limit.mockClear();
    firestoreMocks.query.mockClear();
    firestoreMocks.getDoc.mockClear();
    firestoreMocks.getDocs.mockClear();
  });

  it("prices gifts from Firestore and makes the cheapest unit free across purchases and gifts", async () => {
    const quote = await createServerCheckoutQuote(quoteInput());

    expect(quote.appliedOffer).toMatchObject({
      id: "choice-offer",
      type: "buy_x_get_y_select_gift",
    });
    expect(quote.subtotal).toBe(900);
    expect(quote.discount).toBe(100);
    expect(quote.total).toBe(800);

    const purchaseA = quote.lineItems.find((line) => line.productId === "A");
    const purchaseB = quote.lineItems.find((line) => line.productId === "B");
    const gift = quote.lineItems.find((line) => line.productId === "G");

    expect(purchaseA).toMatchObject({
      productTitle: "منتج الشراء A",
      price: 0,
      quantity: 1,
      isOfferBenefit: true,
      isFree: true,
    });
    expect(purchaseB).toMatchObject({
      productTitle: "منتج الشراء B",
      price: 300,
      quantity: 1,
    });
    expect(gift).toMatchObject({
      productTitle: "الهدية G",
      price: 500,
      quantity: 1,
      isCustomerChoiceGiftSelection: true,
    });
    expect(gift.image).toBe("/images/products/gift-g/gift-main.webp");

    const quotedLineTotal = quote.lineItems.reduce(
      (sum, line) => sum + Number(line.price || 0) * Number(line.quantity || 0),
      0
    );
    expect(quotedLineTotal).toBe(quote.total);
    expect(quote.customerChoiceGiftSelections).toMatchObject([
      {
        id: "G",
        title: "الهدية G",
        price: 500,
        image: "/images/products/gift-g/gift-main.webp",
        selectedColor: "أحمر",
        selectedSize: "L",
      },
    ]);
  });

  it("keeps checkout payable when the customer has not selected the required gift", async () => {
    const quote = await createServerCheckoutQuote(quoteInput({
      cartItems: [{ id: "A", qty: 2 }],
      customerChoiceGiftSelections: [],
    }));

    expect(quote.appliedOffer).toBeNull();
    expect(quote.discount).toBe(0);
    expect(quote.subtotal).toBe(200);
    expect(quote.total).toBe(200);
    expect(quote.customerChoiceGiftStatus).toMatchObject({
      requiredGiftQty: 1,
      selectedGiftQty: 0,
      complete: false,
    });
    expect(quote.lineItems).toHaveLength(1);
    expect(
      firestoreMocks.getDoc.mock.calls.some(
        ([reference]) => reference.collection === "products" && reference.id === "G"
      )
    ).toBe(false);
  });

  it("ignores a selected product outside the Firestore-verified gift allowlist without blocking checkout", async () => {
    firestoreMocks.state.docs.set("products/OUTSIDE", {
      handle: "outside-gift",
      title: "منتج غير مسموح",
      price: 50,
      images: ["https://cdn.example/outside.jpg"],
      variants: [],
    });

    const quote = await createServerCheckoutQuote(quoteInput({
      customerChoiceGiftSelections: [{
        ...selectedGift,
        id: "OUTSIDE",
        productId: "OUTSIDE",
      }],
    }));

    expect(quote.appliedOffer).toBeNull();
    expect(quote.subtotal).toBe(400);
    expect(quote.total).toBe(400);
    expect(quote.customerChoiceGiftSelections).toEqual([]);
    expect(quote.lineItems.some((line) => line.productId === "OUTSIDE")).toBe(false);
    expect(quote.customerChoiceGiftStatus).toMatchObject({
      selectedGiftQty: 0,
      complete: false,
    });
  });

  it("does not add or charge selected gifts when a stronger cart offer wins", async () => {
    const strongerOffer = {
      id: "stronger-cart-offer",
      name: "خصم 50%",
      active: true,
      environment: "production",
      type: "cart_percent",
      productScope: "all",
      config: { percent: 50 },
      priority: 2,
    };

    installFixture([choiceOffer, strongerOffer]);
    const strongerQuote = await createServerCheckoutQuote(quoteInput());

    expect(strongerQuote.appliedOffer).toMatchObject({
      id: "stronger-cart-offer",
      type: "cart_percent",
    });
    expect(strongerQuote.subtotal).toBe(400);
    expect(strongerQuote.discount).toBe(200);
    expect(strongerQuote.total).toBe(200);
    expect(strongerQuote.customerChoiceGiftSelections).toEqual([]);
    expect(strongerQuote.lineItems.some((line) => line.productId === "G")).toBe(false);
    expect(strongerQuote.customerChoiceGiftStatus).toMatchObject({
      selectedGiftQty: 1,
      complete: true,
    });
  });

  it("rejects a fixed coupon when a cart-percent offer qualifies", async () => {
    const cartOffer = {
      id: "cart-percent",
      name: "خصم السلة",
      active: true,
      environment: "production",
      type: "cart_percent",
      productScope: "all",
      config: { percent: 25 },
      priority: 1,
    };
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([cartOffer, coupon]);

    await expect(createServerCheckoutQuote(quoteInput({ promoCode: "SAVE50" })))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining("قسيمة الخصم") });
  });

  it("rejects a fixed coupon when a buy-X-get-Y benefit qualifies", async () => {
    const buyGetOffer = {
      id: "buy-get",
      name: "اشتر 2 واحصل على 1",
      active: true,
      environment: "production",
      type: "buy_x_get_y",
      productScope: "all",
      config: { buyQty: 2, getQty: 1 },
      priority: 1,
    };
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([buyGetOffer, coupon]);

    await expect(createServerCheckoutQuote(quoteInput({
      promoCode: "SAVE50",
      cartItems: [{ id: "A", qty: 2 }],
      customerChoiceGiftSelections: [],
    }))).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a fixed coupon when a customer-choice gift benefit is complete", async () => {
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([choiceOffer, coupon]);

    await expect(createServerCheckoutQuote(quoteInput({ promoCode: "SAVE50" })))
      .rejects.toMatchObject({ status: 409 });
  });

  it("rejects a fixed coupon when the customer qualifies for the first-order discount", async () => {
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([coupon]);
    firestoreMocks.state.docs.set("settings/siteSettings", {
      promotions: {
        shippingCost: 0,
        freeShippingThreshold: 50000,
        firstOrderEnabled: true,
        firstOrderDiscount: 10,
      },
    });

    await expect(createServerCheckoutQuote(quoteInput({
      promoCode: "SAVE50",
      customerEmail: "first@example.com",
      customerPhone: "201234567890",
    }))).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a fixed coupon when a verified bundle discount is applied", async () => {
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([coupon]);
    const parent = firestoreMocks.state.docs.get("products/A");
    firestoreMocks.state.docs.set("products/A", {
      ...parent,
      metafields: {
        bundleProducts: "purchase-b",
        bundleDiscount: 20,
        bundleFreeShipping: 50000,
      },
    });

    await expect(createServerCheckoutQuote(quoteInput({
      promoCode: "SAVE50",
      customerChoiceGiftSelections: [],
      cartItems: [
        { id: "A", qty: 1, bundleGroupId: "bundle-1", bundleParentId: "A", bundleRole: "parent" },
        { id: "B", qty: 1, bundleGroupId: "bundle-1", bundleParentId: "A", bundleRole: "child" },
      ],
    }))).rejects.toMatchObject({ status: 409 });
  });

  it("allows a fixed coupon with a bundle that grants free shipping but no cash discount", async () => {
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([coupon]);
    firestoreMocks.state.docs.set("settings/siteSettings", {
      promotions: { shippingCost: 75, freeShippingThreshold: 50000 },
    });
    const parent = firestoreMocks.state.docs.get("products/A");
    firestoreMocks.state.docs.set("products/A", {
      ...parent,
      metafields: {
        bundleProducts: "purchase-b",
        bundleDiscount: 0,
        bundleFreeShipping: 100,
      },
    });

    const quote = await createServerCheckoutQuote(quoteInput({
      promoCode: "SAVE50",
      customerChoiceGiftSelections: [],
      cartItems: [
        { id: "A", qty: 1, bundleGroupId: "bundle-1", bundleParentId: "A", bundleRole: "parent" },
        { id: "B", qty: 1, bundleGroupId: "bundle-1", bundleParentId: "A", bundleRole: "child" },
      ],
    }));

    expect(quote.appliedPromo).toMatchObject({ code: "SAVE50", discountAmount: 50 });
    expect(quote.freeShippingByBundle).toBe(true);
    expect(quote.shipping).toBe(0);
  });

  it("allows a fixed coupon with an ordinary compare-at markdown", async () => {
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([coupon]);
    const product = firestoreMocks.state.docs.get("products/A");
    firestoreMocks.state.docs.set("products/A", { ...product, compareAtPrice: 150 });

    const quote = await createServerCheckoutQuote(quoteInput({ promoCode: "SAVE50" }));

    expect(quote.appliedPromo).toMatchObject({ code: "SAVE50", discountAmount: 50 });
    expect(quote.discount).toBe(50);
  });

  it("allows a fixed coupon when an active offer does not qualify for the cart", async () => {
    const ineligibleOffer = {
      id: "not-yet-eligible",
      name: "خصم يبدأ من 1000 جنيه",
      active: true,
      environment: "production",
      type: "cart_percent",
      productScope: "all",
      minCart: 1000,
      config: { percent: 25 },
    };
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([ineligibleOffer, coupon]);

    const quote = await createServerCheckoutQuote(quoteInput({ promoCode: "SAVE50" }));

    expect(quote.appliedPromo).toMatchObject({ code: "SAVE50", discountAmount: 50 });
    expect(quote.discount).toBe(50);
  });

  it("allows a fixed coupon with a free-shipping rule and no other cash discount", async () => {
    const coupon = {
      id: "fixed-coupon",
      name: "قسيمة خصم",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SAVE50",
      productScope: "all",
      config: { amount: 50 },
    };
    installFixture([coupon]);
    firestoreMocks.state.docs.set("settings/offerShippingRules_production", {
      enabled: true,
      scope: "selected",
      productIds: ["A"],
      condition: "quantity",
      minQuantity: 1,
    });

    const quote = await createServerCheckoutQuote(quoteInput({ promoCode: "SAVE50" }));

    expect(quote.appliedPromo).toMatchObject({ code: "SAVE50", discountAmount: 50 });
    expect(quote.freeShippingByRule).toBe(true);
    expect(quote.shipping).toBe(0);

  });

  it("returns coupon scope metadata for local recalculation", async () => {
    const coupon = {
      id: "scoped-coupon",
      name: "قسيمة محددة المنتجات",
      active: true,
      environment: "production",
      type: "coupon_fixed",
      couponCode: "SCOPED40",
      productScope: "selected",
      productIds: ["A"],
      excludedProductIds: ["B"],
      excludeDiscounted: true,
      minCart: 75,
      maxDiscount: 40,
      config: { amount: 90 },
    };
    installFixture([coupon]);

    const quote = await createServerCheckoutQuote(quoteInput({
      promoCode: "SCOPED40",
      customerChoiceGiftSelections: [],
    }));

    expect(quote.appliedPromo).toMatchObject({
      code: "SCOPED40",
      discountAmount: 40,
      scope: ["A"],
      excludedProductIds: ["B"],
      excludeDiscounted: true,
      minCart: 75,
      maxDiscount: 40,
    });
  });

  it("rejects a legacy cash promo code when another cash offer qualifies", async () => {
    const cartOffer = {
      id: "cart-percent",
      name: "خصم السلة",
      active: true,
      environment: "production",
      type: "cart_percent",
      productScope: "all",
      config: { percent: 25 },
      priority: 1,
    };
    installFixture([cartOffer]);
    firestoreMocks.state.docs.set("promoCodes/LEGACY50", {
      active: true,
      type: "fixed",
      value: 50,
      scope: "all",
      usageType: "unlimited",
    });

    await expect(createServerCheckoutQuote(quoteInput({
      promoCode: "LEGACY50",
      customerChoiceGiftSelections: [],
    }))).rejects.toMatchObject({ status: 409 });
  });

  it("allows a free-shipping promo code alongside a qualifying cash offer", async () => {
    const cartOffer = {
      id: "cart-percent",
      name: "خصم السلة",
      active: true,
      environment: "production",
      type: "cart_percent",
      productScope: "all",
      config: { percent: 25 },
      priority: 1,
    };
    installFixture([cartOffer]);
    firestoreMocks.state.docs.set("promoCodes/FREESHIP", {
      active: true,
      type: "free_shipping",
      value: 0,
      scope: "all",
      usageType: "unlimited",
    });

    const quote = await createServerCheckoutQuote(quoteInput({
      promoCode: "FREESHIP",
      customerChoiceGiftSelections: [],
    }));

    expect(quote.appliedPromo).toMatchObject({ code: "FREESHIP", freeShipping: true });
    expect(quote.appliedOffer).toMatchObject({ id: "cart-percent", type: "cart_percent" });
    expect(quote.discount).toBe(100);
    expect(quote.shipping).toBe(0);
  });

  it("preserves the server-validated scope for legacy promo codes", async () => {
    installFixture([]);
    firestoreMocks.state.docs.set("promoCodes/LEGACY50", {
      active: true,
      type: "fixed",
      value: 50,
      scope: ["A"],
      usageType: "unlimited",
    });

    const quote = await createServerCheckoutQuote(quoteInput({
      promoCode: "LEGACY50",
      customerChoiceGiftSelections: [],
      cartItems: [
        { id: "A", qty: 1 },
        { id: "B", qty: 1 },
      ],
    }));

    expect(quote.appliedPromo).toMatchObject({
      code: "LEGACY50",
      type: "fixed",
      scope: ["A"],
      discountAmount: 50,
    });
  });});