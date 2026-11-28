// Tests for GET /api/admin/orders — staff order list through the server.
// serverOrderStore is mocked; permission checks go through
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

import { GET } from "@/app/api/admin/orders/route";

const ORDERS_AUTH = { ok: true, uid: "staff-1", role: "orders", status: 200 };

const call = (qs = "") =>
  GET(new Request(`https://windeg.com/api/admin/orders${qs}`, { method: "GET" }));

describe("GET /api/admin/orders", () => {
  beforeEach(() => {
    mocks.verifyAdminPermission.mockReset();
    mocks.query.mockReset();
    mocks.verifyAdminPermission.mockResolvedValue(ORDERS_AUTH);
    mocks.query.mockResolvedValue([
      { id: "o1", data: { Name: "#1001", "Created at": "2026-11-28 10:00:00", data_source: "WIND_Web" } },
      { id: "o2", data: { Name: "#1002", "Created at": "2026-11-27 09:00:00", data_source: "WIND_Web" } },
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

  it("rejects a role without orders.view (403) without querying", async () => {
    mocks.verifyAdminPermission.mockResolvedValue({
      ok: false, reason: "forbidden_missing_permission", status: 403,
    });
    const res = await call("?tab=wind");
    expect(res.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lists wind orders ordered by Created at desc with limit+offset", async () => {
    const res = await call("?tab=wind&limit=20&offset=0");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orders).toHaveLength(2);
    expect(body.orders[0]).toMatchObject({ id: "o1", Name: "#1001" });
    expect(body.hasMore).toBe(false);
    expect(body.nextOffset).toBe(2);
    expect(mocks.query).toHaveBeenCalledWith("Orders", {
      filters: [{ field: "data_source", op: "EQUAL", value: "WIND_Web" }],
      orderBy: { field: "Created at", direction: "DESCENDING" },
      limit: 20,
      offset: 0,
    });
  });

  it("passes through offset for load-more paging", async () => {
    await call("?tab=shopify&limit=20&offset=20");
    expect(mocks.query).toHaveBeenCalledWith("Orders", expect.objectContaining({
      filters: [{ field: "data_source", op: "EQUAL", value: "Shopify_Import" }],
      offset: 20,
    }));
  });

  it("omits the data_source filter for the all/abandoned tabs", async () => {
    await call("?tab=all&limit=20&offset=0");
    expect(mocks.query).toHaveBeenCalledWith("Orders", expect.objectContaining({
      orderBy: { field: "Created at", direction: "DESCENDING" },
    }));
    expect(mocks.query.mock.calls[0][1].filters).toBeUndefined();
  });

  it("reports hasMore when a full page comes back", async () => {
    mocks.query.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, data: {} })),
    );
    const body = await (await call("?tab=wind&limit=20&offset=0")).json();
    expect(body.hasMore).toBe(true);
    expect(body.nextOffset).toBe(20);
  });

  it("looks up a customer's orders by email with limit 1", async () => {
    mocks.query.mockResolvedValue([{ id: "o9", data: { Email: "a@example.com" } }]);
    const res = await call("?email= A@Example.com ");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toEqual([{ id: "o9", Email: "a@example.com" }]);
    expect(mocks.query).toHaveBeenCalledWith("Orders", {
      filters: [{ field: "Email", op: "EQUAL", value: "a@example.com" }],
      limit: 1,
    });
  });

  it("returns 500 orders_list_failed when the store fails", async () => {
    mocks.query.mockRejectedValue(new Error("boom"));
    const res = await call("?tab=wind");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("orders_list_failed");
  });
});
