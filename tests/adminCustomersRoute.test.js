// Tests for GET /api/admin/customers — staff customer list through the
// server. serverOrderStore is mocked; permission checks go through
// verifyAdminPermission, mocked here.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAdminPermission: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/verifyAdminIdToken", () => ({
  verifyAdminPermission: mocks.verifyAdminPermission,
}));
vi.mock("@/lib/serverOrderStore", () => ({
  serverOrderStore: { query: mocks.query },
}));

import { GET } from "@/app/api/admin/customers/route";

const CUSTOMERS_AUTH = { ok: true, uid: "staff-1", role: "orders", status: 200 };

const call = (qs = "") =>
  GET(new Request(`https://windeg.com/api/admin/customers${qs}`, { method: "GET" }));

describe("GET /api/admin/customers", () => {
  beforeEach(() => {
    mocks.verifyAdminPermission.mockReset();
    mocks.query.mockReset();
    mocks.verifyAdminPermission.mockResolvedValue(CUSTOMERS_AUTH);
    mocks.query.mockResolvedValue([
      { id: "c1", data: { Email: "a@example.com", last_active: "2026-11-28 10:00:00" } },
    ]);
  });

  it("rejects unauthenticated requests (401) without querying", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "missing_bearer_token", status: 401,
    });
    const res = await call("?tab=wind");
    expect(res.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a role without customers.view (403) without querying", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "forbidden_missing_permission", status: 403,
    });
    const res = await call("?tab=wind");
    expect(res.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lists wind customers ordered by last_active desc with limit+offset", async () => {
    const res = await call("?tab=wind&limit=20&offset=0");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.customers).toEqual([
      { id: "c1", Email: "a@example.com", last_active: "2026-11-28 10:00:00" },
    ]);
    expect(body.hasMore).toBe(false);
    expect(body.nextOffset).toBe(1);
    expect(mocks.query).toHaveBeenCalledWith("Customers", {
      filters: [{ field: "data_source", op: "EQUAL", value: "WIND_Web" }],
      orderBy: { field: "last_active", direction: "DESCENDING" },
      limit: 20,
      offset: 0,
    });
  });

  it("omits the data_source filter for the all tab", async () => {
    await call("?tab=all&limit=500&offset=500");
    expect(mocks.query).toHaveBeenCalledWith("Customers", expect.objectContaining({
      limit: 500,
      offset: 500,
    }));
    expect(mocks.query.mock.calls[0][1].filters).toBeUndefined();
  });

  it("returns 500 customers_list_failed when the store fails", async () => {
    mocks.query.mockRejectedValue(new Error("boom"));
    const res = await call("?tab=wind");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("customers_list_failed");
  });
});
