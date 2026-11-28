// Tests for /api/admin/promotions — promoCodes list/create/update/delete
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

import { GET, POST, DELETE } from "@/app/api/admin/promotions/route";

const PROMO_AUTH = { ok: true, uid: "staff-1", role: "content", status: 200 };

const VALID_DATA = {
  type: "percent",
  value: 15,
  scope: "all",
  usageType: "unlimited",
  maxUses: 1,
  firstOrderOnly: false,
  active: true,
  expiresAt: null,
};

const get = () => GET(new Request("https://windeg.com/api/admin/promotions", { method: "GET" }));
const post = (body) =>
  POST(new Request("https://windeg.com/api/admin/promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
const del = (code) =>
  DELETE(new Request(`https://windeg.com/api/admin/promotions?code=${encodeURIComponent(code)}`, { method: "DELETE" }));

describe("/api/admin/promotions", () => {
  beforeEach(() => {
    mocks.verifyAdminPermission.mockReset();
    mocks.query.mockReset();
    mocks.get.mockReset();
    mocks.getData.mockReset();
    mocks.commit.mockReset();
    mocks.firestoreAdminDelete.mockReset();
    mocks.verifyAdminPermission.mockResolvedValue(PROMO_AUTH);
    mocks.query.mockResolvedValue([]);
    mocks.getData.mockResolvedValue(null);
    mocks.get.mockResolvedValue(null);
    mocks.commit.mockResolvedValue({});
    mocks.firestoreAdminDelete.mockResolvedValue({});
  });

  it("GET rejects unauthenticated requests (401) without querying", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "missing_bearer_token", status: 401,
    });
    expect((await get()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("GET rejects a role without promotions.edit (403)", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "forbidden_missing_permission", status: 403,
    });
    expect((await get()).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("GET lists promo codes through the server store", async () => {
    mocks.query.mockResolvedValue([
      { id: "SUMMER20", data: { type: "percent", value: 20, expiresAt: "2026-12-31" } },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.codes).toEqual([
      { id: "SUMMER20", type: "percent", value: 20, expiresAt: "2026-12-31" },
    ]);
    expect(mocks.query).toHaveBeenCalledWith("promoCodes", { limit: 1000 });
  });

  it("POST rejects an invalid code without writing", async () => {
    const res = await post({ code: "bad code!", data: VALID_DATA, create: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_code");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST rejects an invalid percent value without writing", async () => {
    const res = await post({
      code: "X20", data: { ...VALID_DATA, value: 150 }, create: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_value");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST creates a new code with usedCount 0 and usedBy []", async () => {
    const res = await post({ code: "summer20", data: VALID_DATA, create: true });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "promoCodes",
      id: "SUMMER20",
      create: true,
    })]);
    const written = mocks.commit.mock.calls[0][0][0].data;
    expect(written.usedCount).toBe(0);
    expect(written.usedBy).toEqual([]);
    expect(written.type).toBe("percent");
    expect(written.value).toBe(15);
  });

  it("POST refuses to create a code that already exists (409 via 400 code_exists)", async () => {
    mocks.getData.mockResolvedValue({ type: "percent" });
    const res = await post({ code: "SUMMER20", data: VALID_DATA, create: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("code_exists");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("POST updates an existing code with a merge + version precondition", async () => {
    mocks.getData.mockResolvedValue({ type: "percent" });
    mocks.get.mockResolvedValue({ data: { type: "percent" }, version: "v9" });
    const res = await post({ code: "SUMMER20", data: { ...VALID_DATA, value: 25 }, create: false });
    expect(res.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({
      collection: "promoCodes",
      id: "SUMMER20",
      version: "v9",
      merge: true,
    })]);
    expect(mocks.commit.mock.calls[0][0][0].data.value).toBe(25);
    expect(mocks.commit.mock.calls[0][0][0].data.usedCount).toBeUndefined();
  });

  it("POST returns 404 when updating a missing code", async () => {
    const res = await post({ code: "NOPE", data: VALID_DATA, create: false });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("code_not_found");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("DELETE deletes the code through the admin delete", async () => {
    const res = await del("summer20");
    expect(res.status).toBe(200);
    expect(mocks.firestoreAdminDelete).toHaveBeenCalledWith("promoCodes", "SUMMER20");
  });

  it("DELETE rejects an invalid code", async () => {
    const res = await del("bad code!");
    expect(res.status).toBe(400);
    expect(mocks.firestoreAdminDelete).not.toHaveBeenCalled();
  });
});
