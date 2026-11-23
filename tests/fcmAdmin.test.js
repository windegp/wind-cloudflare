import { beforeEach, expect, it, vi } from "vitest";
vi.mock("firebase/firestore/lite", () => ({ collection: vi.fn(), getDocs: vi.fn(async () => ({ docs: [{ id: "private-device-token", data: () => ({ platform: "android-native" }) }] })) }));
vi.mock("@/lib/firebase", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token") }));
vi.mock("@/lib/firestoreAdmin", () => ({ firestoreAdminDelete: vi.fn(async () => {}) }));
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
it("strict provider failure throws for outbox retry", async () => {
  fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
  await expect(sendNewOrderNotification({ ...input, strict: true })).rejects.toThrow("FCM_DISPATCH_FAILED");
});
