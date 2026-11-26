import { beforeEach, expect, it, vi } from "vitest";

const store = {};
const setDocMock = vi.fn(async (ref, data) => { Object.assign(store[ref.path] ||= {}, data); });
vi.mock("firebase/firestore/lite", () => ({
  doc: (_db, c, id) => ({ path: `${c}/${id}` }),
  getDoc: async (ref) => ({ exists: () => !!store[ref.path], data: () => store[ref.path] }),
  setDoc: (...a) => setDocMock(...a),
  updateDoc: vi.fn(async () => {}),
  increment: (n) => n,
}));
vi.mock("@/lib/firebase", () => ({ getDb: () => ({}) }));
// Reads moved to the service-account store; serve them from the same test store.
vi.mock("@/lib/serverOrderStore", () => ({
  OrderStoreError: class extends Error {},
  serverOrderStore: {
    getData: async (collection, id) => store[`${collection}/${id}`] ?? null,
  },
}));
vi.mock("@/lib/durablePaymentWebhook", () => ({ durablePaymentWebhook: vi.fn(async () => null) }));
vi.mock("@/lib/kashier", () => ({ verifyWebhookSignature: vi.fn(async (d, sig) => sig === "ok") }));
vi.mock("@/lib/checkoutQuoteToken", () => ({ verifyCheckoutQuote: vi.fn(async () => null) }));
const notify = vi.fn(async () => {});
vi.mock("@/lib/fcmAdmin", () => ({ sendNewOrderNotification: (...a) => notify(...a) }));

import { POST } from "@/app/api/webhooks/kashier/route";

let n = 0;
const call = (data, sig = "ok", event = "pay") =>
  POST(new Request("https://windeg.com/api/webhooks/kashier", { method: "POST",
    headers: { "x-kashier-signature": sig, "cf-connecting-ip": `1.1.1.${++n}` },
    body: JSON.stringify({ event, data }) }));
const pay = (id) => ({ merchantOrderId: id, status: "SUCCESS", amount: 100, currency: "EGP", transactionId: "tx1", signatureKeys: [] });

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  setDocMock.mockClear(); notify.mockReset(); notify.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

it("marks the order paid and clears the abandoned flag for an existing customer", async () => {
  store["Orders/A1"] = { "Financial Status": "pending_payment", Total: 100, Currency: "EGP", Email: "a@b.com" };
  store["Customers/a@b.com"] = { "Total Orders": 0, hasAbandoned: true, segments: ["Abandoned_Checkout"] };
  const res = await call(pay("A1"));
  expect(res.status).toBe(200);
  expect(store["Orders/A1"]["Financial Status"]).toBe("paid");
  expect(store["Customers/a@b.com"].hasAbandoned).toBe(false);
  expect(store["Customers/a@b.com"].segments).toEqual(["Purchased_Once"]);
});

it("a failing push notification does not stop the customer update", async () => {
  notify.mockRejectedValue(new Error("fcm down"));
  store["Orders/A2"] = { "Financial Status": "pending_payment", Total: 100, Currency: "EGP", Email: "c@d.com" };
  store["Customers/c@d.com"] = { "Total Orders": 0, hasAbandoned: true };
  expect((await call(pay("A2"))).status).toBe(200);
  expect(store["Customers/c@d.com"].hasAbandoned).toBe(false);
});

it("still rejects a bad signature and logs the reason without changing the order", async () => {
  store["Orders/A3"] = { "Financial Status": "pending_payment", Total: 100, Currency: "EGP" };
  const res = await call(pay("A3"), "bad");
  expect(res.status).toBe(401);
  expect(store["Orders/A3"]["Financial Status"]).toBe("pending_payment");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("INVALID_SIGNATURE"));
});

it("still ignores an amount mismatch (order stays unpaid) and a retry is not dropped", async () => {
  store["Orders/A4"] = { "Financial Status": "pending_payment", Total: 999, Currency: "EGP" };
  expect((await call(pay("A4"))).status).toBe(200);
  expect(store["Orders/A4"]["Financial Status"]).toBe("pending_payment");
  store["Orders/A4"].Total = 100;
  await call(pay("A4"));
  expect(store["Orders/A4"]["Financial Status"]).toBe("paid");
});

it("logs ORDER_NOT_FOUND for an unknown merchantOrderId", async () => {
  expect((await call(pay("NOPE"))).status).toBe(200);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ORDER_NOT_FOUND"));
});
