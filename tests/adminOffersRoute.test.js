// Tests for /api/admin/offers (+ shipping-rule) — offer save/toggle/delete
// through the server. serverOrderStore + firestoreAdmin are mocked;
// permission checks go through verifyAdminPermission, mocked here.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAdminPermission: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  getData: vi.fn(),
  commit: vi.fn(),
  firestoreAdminDelete: vi.fn(),
}));

vi.mock("@/lib/verifyAdminIdToken", () => ({
  verifyAdminPermission: mocks.verifyAdminPermission,
}));
vi.mock("@/lib/serverOrderStore", () => ({
  serverOrderStore: {
    query: mocks.query,
    get: mocks.get,
    getData: mocks.getData,
    commit: mocks.commit,
  },
}));
vi.mock("@/lib/firestoreAdmin", () => ({
  firestoreAdminDelete: mocks.firestoreAdminDelete,
}));

import { POST, PATCH, DELETE } from "@/app/api/admin/offers/route";
import { POST as POST_SHIPPING_RULE } from "@/app/api/admin/offers/shipping-rule/route";

const OFFERS_AUTH = { ok: true, uid: "staff-1", role: "content", status: 200 };

const VALID_OFFER = {
  name: "اشتري 2 واحصل على 1",
  type: "buy_x_get_y",
  displayText: "",
  campaignLabel: "",
  description: "",
  config: { buyQty: 2, getQty: 1 },
  minCart: 0,
  maxDiscount: 0,
  priority: 100,
  startsAt: "",
  endsAt: "",
  active: true,
  productScope: "all",
  productIds: [],
  excludedProductIds: [],
  excludeDiscounted: false,
};

const save = (body) =>
  POST(new Request("https://windeg.com/api/admin/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
const toggle = (body) =>
  PATCH(new Request("https://windeg.com/api/admin/offers", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
const remove = (id) =>
  DELETE(new Request(`https://windeg.com/api/admin/offers?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
const saveRule = (body) =>
  POST_SHIPPING_RULE(new Request("https://windeg.com/api/admin/offers/shipping-rule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

describe("/api/admin/offers", () => {
  beforeEach(() => {
    mocks.verifyAdminPermission.mockReset();
    mocks.query.mockReset();
    mocks.get.mockReset();
    mocks.getData.mockReset();
    mocks.commit.mockReset();
    mocks.firestoreAdminDelete.mockReset();
    mocks.verifyAdminPermission.mockResolvedValue(OFFERS_AUTH);
    mocks.query.mockResolvedValue([]);
    mocks.getData.mockResolvedValue(null);
    mocks.get.mockResolvedValue(null);
    mocks.commit.mockResolvedValue({});
    mocks.firestoreAdminDelete.mockResolvedValue({});
  });

  it("POST rejects unauthenticated requests (401) without writing", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "missing_bearer_token", status: 401,
    });
    expect((await save({ offer: VALID_OFFER })).status).toBe(401);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST rejects a role without offers.edit (403) without writing", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "forbidden_missing_permission", status: 403,
    });
    expect((await save({ offer: VALID_OFFER })).status).toBe(403);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST rejects an invalid offer type without writing", async () => {
    const res = await save({ offer: { ...VALID_OFFER, type: "mystery" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_type");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST rejects a buy_x_get_y offer with buyQty 0 without writing", async () => {
    const res = await save({
      offer: { ...VALID_OFFER, config: { buyQty: 0, getQty: 1 } },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_config");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST creates an offer with a generated id and createdAt", async () => {
    const res = await save({ offer: VALID_OFFER, environment: "production" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toMatch(/^offer_/);
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "offers",
      id: body.id,
      create: true,
    })]);
    const written = mocks.commit.mock.calls[0][0][0].data;
    expect(written.name).toBe("اشتري 2 واحصل على 1");
    expect(written.config).toEqual({ buyQty: 2, getQty: 1 });
    expect(written.environment).toBe("production");
    expect(written.stackWithOfferIds).toEqual([]);
    expect(written.freeShipping).toBe(false);
    expect(typeof written.createdAt).toBe("string");
  });

  it("POST updates an existing offer with a merge + version precondition", async () => {
    mocks.get.mockResolvedValue({ data: { name: "old" }, version: "v3" });
    const res = await save({
      offer: { ...VALID_OFFER, name: "new name" },
      editingId: "offer_abc",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("offer_abc");
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "offers",
      id: "offer_abc",
      version: "v3",
      merge: true,
    })]);
  });

  it("POST returns 404 when updating a missing offer", async () => {
    const res = await save({ offer: VALID_OFFER, editingId: "offer_nope" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("offer_not_found");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST refuses a coupon code already used by another offer in the same environment", async () => {
    mocks.query.mockResolvedValue([{
      id: "offer_other",
      data: { type: "coupon_fixed", couponCode: "WWF", environment: "production" },
    }]);
    const res = await save({
      offer: {
        ...VALID_OFFER,
        type: "coupon_fixed",
        couponCode: "wwf",
        config: { amount: 50 },
      },
      environment: "production",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("coupon_in_use");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST allows the same coupon code for the offer being edited", async () => {
    mocks.query.mockResolvedValue([{
      id: "offer_mine",
      data: { type: "coupon_fixed", couponCode: "WWF", environment: "production" },
    }]);
    mocks.get.mockResolvedValue({ data: {}, version: "v1" });
    const res = await save({
      offer: {
        ...VALID_OFFER,
        type: "coupon_fixed",
        couponCode: "WWF",
        config: { amount: 50 },
      },
      editingId: "offer_mine",
      environment: "production",
    });
    expect(res.status).toBe(200);
  });

  it("POST refuses a coupon code that exists in legacy promoCodes", async () => {
    mocks.getData.mockResolvedValue({ type: "percent" });
    const res = await save({
      offer: {
        ...VALID_OFFER,
        type: "coupon_fixed",
        couponCode: "SUMMER20",
        config: { amount: 50 },
      },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("code_in_legacy_promo_codes");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("PATCH toggles an offer active flag with a merge + version precondition", async () => {
    mocks.get.mockResolvedValue({ data: { active: true }, version: "v5" });
    const res = await toggle({ id: "offer_abc", active: false });
    expect(res.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "offers",
      id: "offer_abc",
      version: "v5",
      merge: true,
    })]);
    expect(mocks.commit.mock.calls[0][0][0].data.active).toBe(false);
  });

  it("PATCH returns 404 for a missing offer", async () => {
    const res = await toggle({ id: "offer_nope", active: false });
    expect(res.status).toBe(404);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("DELETE deletes the offer through the admin delete", async () => {
    const res = await remove("offer_abc");
    expect(res.status).toBe(200);
    expect(mocks.firestoreAdminDelete).toHaveBeenCalledWith("offers", "offer_abc");
  });

  it("shipping-rule POST creates the rule doc when missing", async () => {
    const res = await saveRule({
      rule: {
        enabled: true, productIds: ["p1"], condition: "quantity",
        minQuantity: 2, minSubtotal: 500,
      },
      environment: "production",
    });
    expect(res.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "settings",
      id: "offerShippingRules_production",
      create: true,
    })]);
    const written = mocks.commit.mock.calls[0][0][0].data;
    expect(written.scope).toBe("selected");
    expect(written.productIds).toEqual(["p1"]);
  });

  it("shipping-rule POST merges when the rule doc already exists", async () => {
    mocks.get.mockResolvedValue({ data: {}, version: "v2" });
    const res = await saveRule({
      rule: {
        enabled: false, productIds: [], condition: "quantity",
        minQuantity: 2, minSubtotal: 500,
      },
      environment: "preview",
    });
    expect(res.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "settings",
      id: "offerShippingRules_preview",
      version: "v2",
      merge: true,
    })]);
  });

  it("shipping-rule POST rejects an enabled rule with no products", async () => {
    const res = await saveRule({
      rule: {
        enabled: true, productIds: [], condition: "quantity",
        minQuantity: 2, minSubtotal: 500,
      },
      environment: "production",
    });
    expect(res.status).toBe(400);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
