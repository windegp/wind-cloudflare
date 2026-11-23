import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAdminIdToken: vi.fn(),
  kvDeleteMany: vi.fn(async () => {}),
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/verifyAdminIdToken", () => ({ verifyAdminIdToken: mocks.verifyAdminIdToken }));
vi.mock("@/lib/kv-cache", () => ({ getKV: vi.fn(async () => null), kvDeleteMany: mocks.kvDeleteMany }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/apiGuards", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceRateLimit: mocks.enforceRateLimit,
}));

import { POST } from "@/app/api/revalidate/route";

const call = (body, headers = {}) =>
  POST(
    new Request("https://windeg.com/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    mocks.verifyAdminIdToken.mockReset();
    mocks.verifyAdminIdToken.mockResolvedValue({ ok: false, reason: "missing_bearer_token" });
    mocks.kvDeleteMany.mockClear();
    mocks.enforceRateLimit.mockClear();
  });

  it("rejects anonymous admin-level requests", async () => {
    for (const body of [{ type: "all" }, { type: "homepage" }, { keys: ["homepage_data_v1"] }, { type: "product", id: "1" }]) {
      const res = await call(body, { origin: "https://windeg.com" });
      expect(res.status).toBe(401);
    }
    expect(mocks.kvDeleteMany).not.toHaveBeenCalled();
  });

  it("lets customer pages refresh one product after a like", async () => {
    const res = await call({ type: "likes", id: "123", handle: "my-product" }, { origin: "https://windeg.com" });
    expect(res.status).toBe(200);
    expect(mocks.kvDeleteMany).toHaveBeenCalledWith(["product_123", "homepage_data_v1", "product_stats_my-product"]);
  });

  it("rejects a public likes request from another origin or without one", async () => {
    expect((await call({ type: "likes", id: "1" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call({ type: "likes", id: "1" })).status).toBe(403);
  });

  it("does not let the public type carry raw keys", async () => {
    const res = await call({ type: "likes", id: "1", keys: ["ratelimit_x"] }, { origin: "https://windeg.com" });
    expect(res.status).toBe(401);
  });

  it("lets an admin delete whitelisted keys only", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({ ok: true });
    const ok = await call({ keys: ["homepage_data_v1"] }, { authorization: "Bearer t" });
    expect(ok.status).toBe(200);
    const bad = await call({ keys: ["ratelimit_AUTH_1.2.3.4_blocked"] }, { authorization: "Bearer t" });
    expect(bad.status).toBe(400);
  });
});
