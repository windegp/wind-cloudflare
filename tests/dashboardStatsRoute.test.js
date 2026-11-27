import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAdminIdToken: vi.fn(),
  storeGetData: vi.fn(async () => null),
  storeQuery: vi.fn(async () => []),
}));

vi.mock("@/lib/verifyAdminIdToken", () => ({ verifyAdminIdToken: mocks.verifyAdminIdToken }));
vi.mock("@/lib/serverOrderStore", () => ({
  serverOrderStore: { getData: mocks.storeGetData, query: mocks.storeQuery },
}));

import { GET } from "@/app/api/admin/dashboard-stats/route";

const call = (headers = {}) =>
  GET(new Request("https://windeg.com/api/admin/dashboard-stats?period=today", { headers }));

describe("GET /api/admin/dashboard-stats", () => {
  beforeEach(() => {
    mocks.verifyAdminIdToken.mockReset();
    mocks.storeGetData.mockClear();
    mocks.storeQuery.mockClear();
  });

  it("rejects requests with no token (401, no data read)", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({ ok: false, reason: "missing_bearer_token" });
    const res = await call();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mocks.storeGetData).not.toHaveBeenCalled();
    expect(mocks.storeQuery).not.toHaveBeenCalled();
  });

  it("rejects an invalid token (401, no data read)", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({ ok: false, reason: "firebase_lookup_failed_400_INVALID_ID_TOKEN" });
    const res = await call({ authorization: "Bearer garbage" });
    expect(res.status).toBe(401);
    expect(mocks.storeGetData).not.toHaveBeenCalled();
  });

  it("rejects a signed-in user who is not the admin (401, no data read)", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({ ok: false, reason: "admin_uid_mismatch" });
    const res = await call({ authorization: "Bearer some-user-token" });
    expect(res.status).toBe(401);
    expect(mocks.storeGetData).not.toHaveBeenCalled();
  });

  it("serves stats to the real admin (200)", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({ ok: true });
    const res = await call({ authorization: "Bearer admin-token" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.period).toBe("today");
  });
});
