import { beforeEach, describe, expect, it, vi } from "vitest";

const serverGetMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverOrderStore", () => ({
  OrderStoreError: class extends Error {},
  serverOrderStore: {
    get: (...a) => serverGetMock(...a),
    getData: async (...a) => {
      const record = await serverGetMock(...a);
      return record ? record.data : null;
    },
  },
}));
vi.mock("@/lib/apiGuards", async (orig) => ({ ...(await orig()), enforceRateLimit: vi.fn(async () => null) }));

import { POST } from "@/app/api/track-order/route";
import { normalizeOrderNumber, phoneTail } from "@/lib/orderTracking";

const order = {
  Name: "WIND-12345-AB",
  Phone: "01012345678",
  Email: "secret@example.com",
  "Billing Name": "Secret Name",
  "Shipping Address1": "Secret street 5",
  "Shipping City": "القاهرة",
  "Financial Status": "pending",
  "Payment Method": "cod",
  "Created at": "2026-11-20 10:00:00",
  Total: 550,
  Currency: "EGP",
  lineItems: [{ productTitle: "فستان", quantity: 2, selectedSize: "L", selectedColor: "أسود" }],
};

const call = (body, headers = { origin: "https://windeg.com" }) =>
  POST(new Request("https://windeg.com/api/track-order", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

const ordersReads = () => serverGetMock.mock.calls.filter(([collection]) => collection === "Orders");

beforeEach(() => { serverGetMock.mockReset(); });

describe("track-order", () => {
  it("normalizes input", () => {
    expect(normalizeOrderNumber(" #wind-12345-ab ")).toBe("WIND-12345-AB");
    expect(normalizeOrderNumber("../x")).toBe("");
    expect(phoneTail("+20 101 234 5678")).toBe("1012345678");
    expect(phoneTail("٠١٠١٢٣٤٥٦٧٨")).toBe("1012345678");
    expect(phoneTail("123")).toBe("");
  });

  const durableId = "WIND-D-a1b2c3d4-1234-4123-8123-123456789abc";
  it("accepts the full 43-character durable ID and restores canonical lowercase UUID", () => {
    expect(durableId.length).toBe(43);
    expect(normalizeOrderNumber(durableId)).toBe(durableId);
    expect(normalizeOrderNumber(` #${durableId.toUpperCase()} `)).toBe(durableId);
    expect(normalizeOrderNumber("A".repeat(40))).toBe("A".repeat(40));
  });
  it.each(["A".repeat(41), "A".repeat(43), "A".repeat(44),
    "WIND-D-a1b2c3d4-1234-1123-8123-123456789abc", "WIND-D-a1b2c3d4-1234-4123-7123-123456789abc",
    "WIND-D-a1b2c3d4-1234-4123-8123-123456789abg", `${durableId}/x`])("rejects invalid long IDs without reading Firestore: %s", async id => {
    expect(normalizeOrderNumber(id)).toBe("");
    expect((await call({ orderNumber: id, phone: "01012345678" })).status).toBe(404);
    expect(serverGetMock).not.toHaveBeenCalled();
  });
  it("looks up the actual case-sensitive durable document and still hides personal data", async () => {
    serverGetMock.mockResolvedValue({ data: { ...order, Name: durableId } });
    const response = await call({ orderNumber: durableId.toUpperCase(), phone: "01012345678" });
    expect(response.status).toBe(200);
    expect(serverGetMock).toHaveBeenCalledWith("Orders", durableId);
    const body = await response.json();
    expect(body.order.orderNumber).toBe(durableId);
    expect(JSON.stringify(body)).not.toContain("secret@example.com");
    expect(JSON.stringify(body)).not.toContain("Secret street");
  });
  it("does not loosen phone verification for a durable order", async () => {
    serverGetMock.mockResolvedValue({ data: { ...order, Name: durableId } });
    expect((await call({ orderNumber: durableId, phone: "01099999999" })).status).toBe(404);
  });

  it("rejects requests without a same-origin header", async () => {
    const res = await call({ orderNumber: "WIND-12345-AB", phone: "01012345678" }, {});
    expect(res.status).toBe(403);
    expect(serverGetMock).not.toHaveBeenCalled();
  });

  it("returns status and items for a matching pair, without personal data", async () => {
    serverGetMock.mockResolvedValue({ data: order });
    const res = await call({ orderNumber: "wind-12345-ab", phone: "+201012345678" });
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("فستان");
    for (const secret of ["secret@example.com", "Secret Name", "Secret street", "01012345678"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("gives the same 404 for a wrong phone and for a missing order", async () => {
    serverGetMock.mockResolvedValue({ data: order });
    const wrong = await call({ orderNumber: "WIND-12345-AB", phone: "01099999999" });
    serverGetMock.mockResolvedValue(null);
    const missing = await call({ orderNumber: "WIND-00000-ZZ", phone: "01012345678" });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it("treats abandoned drafts as not found and never queries on a bad id", async () => {
    serverGetMock.mockResolvedValue({ data: { ...order, "Financial Status": "abandoned" } });
    expect((await call({ orderNumber: "WIND-12345-AB", phone: "01012345678" })).status).toBe(404);
    serverGetMock.mockClear();
    expect((await call({ orderNumber: "a/b", phone: "01012345678" })).status).toBe(404);
    expect(serverGetMock).not.toHaveBeenCalled();
  });

  it("treats a record the store cannot return as a missing order", async () => {
    // serverOrderStore.getData maps an unreadable/invalid id to null, same as absent.
    serverGetMock.mockResolvedValue(null);
    expect((await call({ orderNumber: "WIND-12345-AB", phone: "01012345678" })).status).toBe(404);
  });
});

 describe("sequential display lookup", () => {
  const id = "WIND-D-a1b2c3d4-1234-4123-8123-123456789abc";
  const canonical = { orderId: id, orderNumber: 1001, status: "confirmed", paymentMethod: "cod",
    customer: { phone: "01012345678", email: "private@example.com" },
    financials: { total: 550, currency: "EGP", lineItems: order.lineItems } };
  const seedLookup = () => serverGetMock.mockImplementation(async (collection, key) =>
    key === "order_number_1001" ? { data: { orderNumber: 1001, orderId: id } } :
    collection === "WindCheckoutAttempts" ? { data: canonical } : null);
  it.each(["1001", "#1001", "#١٠٠١"])("resolves %s privately with matching canonical phone", async number => {
    seedLookup();
    const response = await call({ orderNumber: number, phone: "01012345678" });
    expect(response.status).toBe(200);
    const data = await response.json(); expect(data.order.orderNumber).toBe("#1001");
    expect(JSON.stringify(data)).not.toContain("private@example.com");
    expect(JSON.stringify(data)).not.toContain("01012345678");
    expect(serverGetMock).toHaveBeenCalledWith("WindCheckoutEffects", "order_number_1001");
  });
  it("adds the dashboard fulfilment status when the projection exists", async () => {
    seedLookup();
    const response = await call({ orderNumber: "#1001", phone: "01012345678" });
    expect(response.status).toBe(200);
    // The projection read goes through the same private store (no public read).
    expect(serverGetMock).toHaveBeenCalledWith("Orders", id);
  });
  it("gives a uniform not-found for absent number and wrong canonical phone", async () => {
    seedLookup();
    const wrong = await call({ orderNumber: "#1001", phone: "01099999999" });
    serverGetMock.mockResolvedValue(null);
    const absent = await call({ orderNumber: "#1001", phone: "01012345678" });
    expect(wrong.status).toBe(404); expect(absent.status).toBe(404);
    expect(await wrong.json()).toEqual(await absent.json());
    expect(ordersReads()).toEqual([]);
  });
  it("never trusts a projection phone for sequential authorization", async () => {
    seedLookup();
    expect((await call({ orderNumber: "#1001", phone: "01099999999" })).status).toBe(404);
    expect(ordersReads()).toEqual([]);
  });
  it("rejects a corrupt number mapping", async () => {
    serverGetMock.mockResolvedValue({ data: { orderNumber: 1002, orderId: id } });
    expect((await call({ orderNumber: "#1001", phone: "01012345678" })).status).toBe(404);
  });
 });

it("does no private lookup for a cross-origin sequential request", async () => {
  expect((await call({ orderNumber: "#1001", phone: "01012345678" }, { origin: "https://untrusted.invalid" })).status).toBe(403);
  expect(serverGetMock).not.toHaveBeenCalled();
});
it("does not expose sequential lookup data when canonical record is missing", async () => {
  serverGetMock.mockResolvedValueOnce({ data: { orderNumber: 1001, orderId: "WIND-D-a1b2c3d4-1234-4123-8123-123456789abc" } }).mockResolvedValueOnce(null);
  const response = await call({ orderNumber: "#1001", phone: "01012345678" });
  expect(response.status).toBe(404); expect(ordersReads()).toEqual([]);
  expect(JSON.stringify(await response.json())).not.toContain("WIND-D-");
});
