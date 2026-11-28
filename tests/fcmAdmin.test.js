import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_UID } from "@/lib/constants";

const mocks = vi.hoisted(() => ({
  firestoreAdminList: vi.fn(),
  firestoreAdminDelete: vi.fn(async () => {}),
  firestoreAdminGet: vi.fn(async () => null),
}));

vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token") }));
vi.mock("@/lib/firestoreAdmin", async (importOriginal) => ({
  ...(await importOriginal()),
  firestoreAdminDelete: mocks.firestoreAdminDelete,
  firestoreAdminList: mocks.firestoreAdminList,
  firestoreAdminGet: mocks.firestoreAdminGet,
}));

import { sendNewOrderNotification } from "@/lib/fcmAdmin";

const input = { title: "New order", body: "Order", orderId: "WIND-92581-R7" };

// REST-shaped adminTokens doc. Pass uid/role explicitly; omitting them
// means the field is absent on the doc (legacy/malformed token).
const tokenDoc = (token, { uid, role, platform = "android-native" } = {}) => ({
  name: `projects/p/databases/(default)/documents/adminTokens/${token}`,
  fields: {
    platform: { stringValue: platform },
    ...(uid === undefined ? {} : { uid: { stringValue: uid } }),
    ...(role === undefined ? {} : { role: { stringValue: role } }),
  },
});

// REST-shaped admins/{uid} doc for the role lookup.
const staffDoc = (uid, role, active = true) => ({
  name: `projects/p/databases/(default)/documents/admins/${uid}`,
  fields: {
    role: { stringValue: role },
    active: { booleanValue: active },
  },
});

beforeEach(() => {
  process.env.FIREBASE_PROJECT_ID = "wind-reviews";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.firestoreAdminList.mockReset();
  mocks.firestoreAdminGet.mockReset();
  mocks.firestoreAdminDelete.mockClear();
  // Default: one legacy owner token, as before this change.
  mocks.firestoreAdminList.mockResolvedValue([
    tokenDoc("private-device-token", { uid: ADMIN_UID, role: "owner" }),
  ]);
  mocks.firestoreAdminGet.mockResolvedValue(null);
});

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

describe("sendNewOrderNotification — role filtering (owner + admin + orders + viewer)", () => {
  it("sends to an orders-role staff token (current role resolved from admins doc)", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("orders-device-token", { uid: "staff-orders-uid", role: "orders", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockResolvedValue(staffDoc("staff-orders-uid", "orders"));
    await sendNewOrderNotification(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":1'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":0'));
  });

  it("sends to an admin-role staff token", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("admin-device-token", { uid: "staff-admin-uid", role: "admin", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockResolvedValue(staffDoc("staff-admin-uid", "admin"));
    await sendNewOrderNotification(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":1'));
  });

  it("sends to a viewer-role staff token", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("viewer-device-token", { uid: "staff-viewer-uid", role: "viewer", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockResolvedValue(staffDoc("staff-viewer-uid", "viewer"));
    await sendNewOrderNotification(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":1'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":0'));
  });

  it("skips products/content tokens the same way", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("products-token", { uid: "staff-products-uid", role: "products", platform: "web" }),
      tokenDoc("content-token", { uid: "staff-content-uid", role: "content", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockImplementation(async (_collection, uid) =>
      staffDoc(uid, uid === "staff-products-uid" ? "products" : "content"),
    );
    await sendNewOrderNotification(input);
    expect(fetch).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":2'));
  });

  it("sends to recipients and skips non-recipients in the same batch", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("owner-token", { uid: ADMIN_UID, role: "owner" }),
      tokenDoc("products-token", { uid: "staff-products-uid", role: "products", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockResolvedValue(staffDoc("staff-products-uid", "products"));
    await sendNewOrderNotification(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":1'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":1'));
  });

  it("skips a token whose owner cannot be resolved (no admins doc)", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("orphan-token", { uid: "deleted-staff-uid", role: "orders", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockResolvedValue(null);
    await sendNewOrderNotification(input);
    expect(fetch).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":1'));
  });

  it("skips a token with no uid at all instead of sending to everyone", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("no-uid-token", { uid: undefined, role: undefined, platform: "web" }),
    ]);
    await sendNewOrderNotification(input);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.firestoreAdminGet).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":1'));
  });

  it("uses the CURRENT role, not the role stored on the token doc", async () => {
    // Token was stored when the member was products; the role changed to viewer since.
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("stale-role-token", { uid: "staff-changed-uid", role: "products", platform: "web" }),
    ]);
    mocks.firestoreAdminGet.mockResolvedValue(staffDoc("staff-changed-uid", "viewer"));
    await sendNewOrderNotification(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"accepted":1'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"skipped":0'));
  });

  it("does not look up the admins doc for the owner UID", async () => {
    mocks.firestoreAdminList.mockResolvedValue([
      tokenDoc("owner-token", { uid: ADMIN_UID, role: "owner" }),
    ]);
    await sendNewOrderNotification(input);
    expect(mocks.firestoreAdminGet).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
