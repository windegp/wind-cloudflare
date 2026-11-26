import { beforeEach, describe, expect, it, vi } from "vitest";

// checkFirstOrder must read Customers only through the private service-account
// store, never through the public client SDK.
const storeMocks = vi.hoisted(() => ({ getData: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/serverOrderStore", () => ({
  OrderStoreError: class extends Error {},
  serverOrderStore: { getData: storeMocks.getData, query: storeMocks.query },
}));
const liteMocks = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }));
vi.mock("firebase/firestore/lite", async (orig) => {
  const actual = await orig().catch(() => ({}));
  return { ...actual, getDoc: liteMocks.getDoc, getDocs: liteMocks.getDocs };
});
vi.mock("@/lib/firebase", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token") }));

import { checkFirstOrder } from "@/lib/serverCheckoutPricing";

const email = "new@example.com";
const phone = "01012345678";

beforeEach(() => {
  storeMocks.getData.mockReset().mockResolvedValue(null);
  storeMocks.query.mockReset().mockResolvedValue([]);
  liteMocks.getDoc.mockReset();
  liteMocks.getDocs.mockReset();
});

describe("checkFirstOrder (service-account reads)", () => {
  it("is true for a genuinely new email + phone pair", async () => {
    expect(await checkFirstOrder(email, phone)).toBe(true);
    expect(storeMocks.getData).toHaveBeenCalledWith("Customers", email);
    expect(storeMocks.getData).toHaveBeenCalledWith("Customers", phone);
    expect(storeMocks.query).toHaveBeenCalledWith("Customers", {
      filters: [{ field: "Phone", op: "EQUAL", value: phone }],
      limit: 1,
    });
    expect(liteMocks.getDoc).not.toHaveBeenCalled();
    expect(liteMocks.getDocs).not.toHaveBeenCalled();
  });

  it("is false when the email document has orders", async () => {
    storeMocks.getData.mockImplementation(async (collection, id) =>
      collection === "Customers" && id === email ? { "Total Orders": 2 } : null);
    expect(await checkFirstOrder(email, phone)).toBe(false);
  });

  it("is false when the phone document has orders", async () => {
    storeMocks.getData.mockImplementation(async (collection, id) =>
      collection === "Customers" && id === phone ? { "Total Orders": 1 } : null);
    expect(await checkFirstOrder(email, phone)).toBe(false);
  });

  it("is false when another document with the same Phone field has orders", async () => {
    storeMocks.query.mockResolvedValue([{ id: "someone@else.com", data: { "Total Orders": 4 }, version: "v1" }]);
    expect(await checkFirstOrder(email, phone)).toBe(false);
  });

  it("is true when a same-phone document exists but never completed an order", async () => {
    storeMocks.query.mockResolvedValue([{ id: "someone@else.com", data: { "Total Orders": 0 }, version: "v1" }]);
    expect(await checkFirstOrder(email, phone)).toBe(true);
  });

  it.each([
    ["", phone],
    ["not-an-email", phone],
    [email, "010"],
    ["", ""],
  ])("is false without a usable email and phone: %s / %s", async (e, p) => {
    expect(await checkFirstOrder(e, p)).toBe(false);
    expect(storeMocks.getData).not.toHaveBeenCalled();
  });
});
