// Tests for POST /api/admin/members/invite — owner-only staff
// pre-provisioning by email. Identity Toolkit + Firestore are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_UID } from "@/lib/constants";

const mocks = vi.hoisted(() => ({
  verifyAdminPermission: vi.fn(),
  preprovisionAuthUser: vi.fn(),
  firestoreAdminGet: vi.fn(),
  firestoreAdminSet: vi.fn(),
}));

vi.mock("@/lib/verifyAdminIdToken", () => ({
  verifyAdminPermission: mocks.verifyAdminPermission,
}));
vi.mock("@/lib/identityAdmin", () => ({
  preprovisionAuthUser: mocks.preprovisionAuthUser,
}));
vi.mock("@/lib/firestoreAdmin", async (importOriginal) => ({
  ...(await importOriginal()),
  firestoreAdminGet: mocks.firestoreAdminGet,
  firestoreAdminSet: mocks.firestoreAdminSet,
}));

import { POST } from "@/app/api/admin/members/invite/route";

const OWNER_AUTH = { ok: true, uid: ADMIN_UID, role: "owner", status: 200 };

const call = (body) =>
  POST(
    new Request("https://windeg.com/api/admin/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/admin/members/invite", () => {
  beforeEach(() => {
    mocks.verifyAdminPermission.mockReset();
    mocks.preprovisionAuthUser.mockReset();
    mocks.firestoreAdminGet.mockReset();
    mocks.firestoreAdminSet.mockReset();
    mocks.verifyAdminPermission.mockResolvedValue(OWNER_AUTH);
    mocks.firestoreAdminGet.mockResolvedValue(null);
    mocks.firestoreAdminSet.mockResolvedValue({});
  });

  it("rejects unauthenticated requests (401) without provisioning", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false,
      reason: "missing_bearer_token",
      status: 401,
    });
    const res = await call({ email: "a@example.com", role: "viewer" });
    expect(res.status).toBe(401);
    expect(mocks.preprovisionAuthUser).not.toHaveBeenCalled();
  });

  it("rejects a signed-in user without members.manage (403)", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false,
      reason: "forbidden_missing_permission",
      status: 403,
    });
    const res = await call({ email: "a@example.com", role: "viewer" });
    expect(res.status).toBe(403);
    expect(mocks.preprovisionAuthUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await call({ email: "not-an-email", role: "viewer" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_email");
    expect(mocks.preprovisionAuthUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid role", async () => {
    const res = await call({ email: "a@example.com", role: "superuser" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_role");
    expect(mocks.preprovisionAuthUser).not.toHaveBeenCalled();
  });

  it("rejects the owner role — it is never assignable through the API", async () => {
    const res = await call({ email: "a@example.com", role: "owner" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_role");
    expect(mocks.preprovisionAuthUser).not.toHaveBeenCalled();
  });

  it("rejects the owner's own email", async () => {
    const res = await call({ email: "windegp@gmail.com", role: "viewer" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("cannot_invite_owner");
    expect(mocks.preprovisionAuthUser).not.toHaveBeenCalled();
  });

  it("pre-provisions a brand-new user and writes the staff doc", async () => {
    mocks.preprovisionAuthUser.mockResolvedValue({ uid: "uid-new", created: true });
    const res = await call({ email: "New@Example.com", role: "orders", name: "سارة" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.authUserCreated).toBe(true);
    expect(body.member).toMatchObject({
      uid: "uid-new",
      email: "new@example.com",
      name: "سارة",
      role: "orders",
      active: true,
      isOwner: false,
    });
    expect(mocks.firestoreAdminSet).toHaveBeenCalledWith(
      "admins",
      "uid-new",
      expect.objectContaining({
        uid: "uid-new",
        email: "new@example.com",
        role: "orders",
        active: true,
      }),
    );
  });

  it("reuses an existing Auth user and reports it was not newly created", async () => {
    mocks.preprovisionAuthUser.mockResolvedValue({ uid: "uid-old", created: false });
    mocks.firestoreAdminGet.mockResolvedValue({
      name: "projects/wind-reviews/databases/(default)/documents/admins/uid-old",
      fields: {
        uid: { stringValue: "uid-old" },
        email: { stringValue: "old@example.com" },
        role: { stringValue: "viewer" },
        createdAt: { stringValue: "2026-01-01T00:00:00.000Z" },
        createdBy: { stringValue: ADMIN_UID },
      },
    });
    const res = await call({ email: "old@example.com", role: "products" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.authUserCreated).toBe(false);
    expect(body.member.role).toBe("products");
    // Existing createdAt/createdBy are preserved, not overwritten.
    expect(body.member.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.member.createdBy).toBe(ADMIN_UID);
  });

  it("refuses to write a staff doc on the owner's UID", async () => {
    mocks.preprovisionAuthUser.mockResolvedValue({ uid: ADMIN_UID, created: false });
    const res = await call({ email: "someone@example.com", role: "viewer" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("cannot_modify_owner");
    expect(mocks.firestoreAdminSet).not.toHaveBeenCalled();
  });

  it("returns 500 invite_failed when pre-provisioning fails", async () => {
    mocks.preprovisionAuthUser.mockRejectedValue(new Error("boom"));
    const res = await call({ email: "a@example.com", role: "viewer" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("invite_failed");
    expect(mocks.firestoreAdminSet).not.toHaveBeenCalled();
  });

  it("returns 500 members_save_failed when the staff doc write fails", async () => {
    mocks.preprovisionAuthUser.mockResolvedValue({ uid: "uid-new", created: true });
    mocks.firestoreAdminSet.mockRejectedValue(new Error("boom"));
    const res = await call({ email: "a@example.com", role: "viewer" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("members_save_failed");
  });
});
