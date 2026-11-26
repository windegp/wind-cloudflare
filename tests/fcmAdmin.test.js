import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token") }));
vi.mock("@/lib/firestoreAdmin", () => ({
  firestoreAdminDelete: vi.fn(async () => {}),
  firestoreAdminList: vi.fn(async () => [{ name: "projects/p/databases/(default)/documents/adminTokens/private-device-token", fields: { platform: { stringValue: "android-native" } } }]),
}));
import { sendNewOrderNotification } from "@/lib/fcmAdmin";
const input = { title: "New order", body: "Order", orderId: "WIND-92581-R7" };
beforeEach(() => { process.env.FIREBASE_PROJECT_ID = "wind-reviews"; vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); vi.spyOn(console, "log").mockImplementation(() => {}); });
it("preserves legacy dispatch without new timeout and reports provider acceptance", async () => {
  await sendNewOrderNotification(input);
  expect(fetch.mock.calls[0][1].signal).toBeUndefined();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":1'));
});
it("strict durable delivery uses bounded timeout", async () => {
  await sendNewOrderNotification({ ...input, strict: true }); expect(fetch.mock.calls[0][1].signal).toBeDefined();
});
it("legacy provider failures stay non-blocking but are never logged as successful dispatch", async () => {
  fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
  await expect(sendNewOrderNotification(input)).resolves.toBeUndefined();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":0'));
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"failed":1'));
});
it("reads admin device tokens via the service-account admin list (rules-safe)", async () => {
  const { firestoreAdminList } = await import("@/lib/firestoreAdmin");
  await sendNewOrderNotification(input);
  expect(firestoreAdminList).toHaveBeenCalledWith("adminTokens");
});
it("strict provider failure throws for outbox retry", async () => {
  fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
  await expect(sendNewOrderNotification({ ...input, strict: true })).rejects.toThrow("FCM_DISPATCH_FAILED");
});
