import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/kashier", () => ({ verifyWebhookSignature: vi.fn() }));
import { durablePaymentWebhook } from "@/lib/durablePaymentWebhook";
let store, verify, receive;
const data = { merchantOrderId: "WIND-webhook-123", transactionId: "tx", amount: "100", currency: "EGP", status: "SUCCESS", transactionResponseCode: "APPROVED", signatureKeys: ["merchantOrderId", "transactionId", "amount", "currency", "status", "transactionResponseCode"] };
const run = (body = { event: "pay", data }) => durablePaymentWebhook(body, "a".repeat(64), { store, verify, receive });
beforeEach(() => { store = { get: vi.fn(async () => ({ data: {} })) }; verify = vi.fn(async () => true); receive = vi.fn(async () => ({ state: "applied" })); });
afterEach(() => delete process.env.CHECKOUT_DURABLE_ENABLED);
it("authenticates required signed payment fields before any private read", async () => {
  expect(await run({ data: { ...data, signatureKeys: ["amount"] } })).toMatchObject({ status: 401 }); expect(store.get).not.toHaveBeenCalled();
  verify.mockResolvedValue(false); expect(await run()).toMatchObject({ status: 401 }); expect(store.get).not.toHaveBeenCalled();
});
it("routes canonical orders to durable processing regardless of unsigned envelope event", async () => {
  expect(await run({ event: "idempotency", data })).toMatchObject({ status: 200, code: "applied" }); expect(receive).toHaveBeenCalledTimes(1);
});
it("keeps canonical payments processing after new order creation is paused", async () => {
  process.env.CHECKOUT_DURABLE_ENABLED = "false"; expect((await run()).code).toBe("applied");
});
it("unknown legacy IDs fall back, unknown durable UUIDs are retained", async () => {
  store.get.mockResolvedValue(null); expect(await run()).toBeNull();
  process.env.CHECKOUT_DURABLE_ENABLED = "true"; expect(await run()).toBeNull();
  expect((await run({ data: { ...data, merchantOrderId: "WIND-D-12345678-1234-4123-8123-123456789012" } })).status).toBe(200);
  expect(receive).toHaveBeenCalledTimes(1);
});
it("persistence failure throws for provider retry, never acknowledgement", async () => {
  receive.mockRejectedValue(new Error("unavailable")); await expect(run()).rejects.toThrow("unavailable");
});

it("passes signed SUCCESS/00 unchanged through the authenticated durable boundary", async () => {
  const approved = { ...data, transactionResponseCode: "00" };
  expect(await run({ data: approved })).toMatchObject({ status: 200, code: "applied" });
  expect(verify).toHaveBeenCalledWith(approved, "a".repeat(64));
  expect(receive).toHaveBeenCalledWith(approved, { store });
});
it("never passes a SUCCESS/00 event with invalid signature to processing", async () => {
  verify.mockResolvedValue(false);
  expect(await run({ data: { ...data, transactionResponseCode: "00" } })).toMatchObject({ status: 401 });
  expect(store.get).not.toHaveBeenCalled();
  expect(receive).not.toHaveBeenCalled();
});
