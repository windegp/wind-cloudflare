import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/fcmAdmin", () => ({ sendNewOrderNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/checkoutCustomerEffects", () => ({ applyCheckoutCustomerEffects: vi.fn(async () => ({})) }));
import { checkoutDeliveryHandlers } from "@/lib/checkoutDeliveryHandlers";
import { sendNewOrderNotification } from "@/lib/fcmAdmin";
const order = { orderId: "WIND-test-12345", paymentMethod: "cod", customer: { email: "test@example.com", firstName: "<script>x</script>", phone: "01012345678" }, financials: { subtotal: 100, shipping: 0, total: 100, lineItems: [] } };
beforeEach(() => { process.env.RESEND_API_KEY = "test-only"; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "email-1" })))); });
it("uses canonical recipients and stable provider idempotency header", async () => {
  const handlers = checkoutDeliveryHandlers();
  expect(await handlers.customer_email({ order, idempotencyKey: "stable-key" })).toEqual({ providerId: "email-1" });
  const init = fetch.mock.calls[0][1]; expect(init.headers["Idempotency-Key"]).toBe("stable-key");
  const body = JSON.parse(init.body); expect(body.to).toBe(order.customer.email); expect(body.html).not.toContain("<script>");
  await handlers.admin_email({ order, idempotencyKey: "admin-key" }); expect(JSON.parse(fetch.mock.calls[1][1].body).to).toBe("windegp@gmail.com");
});
it("provider refusal or unverifiable acceptance throws for durable retry", async () => {
  fetch.mockResolvedValueOnce(new Response("{}", { status: 429 }));
  await expect(checkoutDeliveryHandlers().customer_email({ order })).rejects.toMatchObject({ code: "EMAIL_PROVIDER_REJECTED" });
  fetch.mockResolvedValueOnce(new Response("{}"));
  await expect(checkoutDeliveryHandlers().customer_email({ order })).rejects.toMatchObject({ code: "EMAIL_ACCEPTANCE_UNVERIFIABLE" });
});
it("requires strict push outcome rather than swallowed failure", async () => {
  await checkoutDeliveryHandlers().admin_push({ order }); expect(sendNewOrderNotification).toHaveBeenLastCalledWith(expect.objectContaining({ strict: true }));
});

it("uses the sequential label in email and push while keeping UUID notification routing", async () => {
  const numbered = { ...order, orderNumber: 1001 };
  await checkoutDeliveryHandlers().customer_email({ order: numbered, idempotencyKey: "same-internal-key" });
  const email = JSON.parse(fetch.mock.calls[0][1].body);
  expect(email.subject).toContain("#1001"); expect(email.html).toContain("1001");
  expect(email.subject).not.toContain(order.orderId);
  await checkoutDeliveryHandlers().admin_push({ order: numbered });
  expect(sendNewOrderNotification).toHaveBeenLastCalledWith(expect.objectContaining({ body: expect.stringContaining("#1001"), orderId: order.orderId }));
});
