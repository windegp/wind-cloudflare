import { beforeEach, describe, expect, it } from "vitest";
import {
  LOOKUP_LIMIT,
  ROLE_CACHE_TTL_MS,
  allowStaffLookup,
  cacheStaffResolution,
  getCachedStaffResolution,
  resetAdminLookupGuard,
} from "@/lib/adminLookupGuard";

describe("admin lookup guard", () => {
  beforeEach(() => resetAdminLookupGuard());

  it("caches a resolution for 60s then expires", () => {
    cacheStaffResolution("u1", { ok: true, role: "viewer" }, 1000);
    expect(getCachedStaffResolution("u1", 1000 + ROLE_CACHE_TTL_MS - 1)).toEqual({ ok: true, role: "viewer" });
    expect(getCachedStaffResolution("u1", 1000 + ROLE_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("returns null for unknown uid", () => {
    expect(getCachedStaffResolution("nobody")).toBeNull();
  });

  it("blocks an IP after the lookup limit and recovers next window", () => {
    for (let i = 0; i < LOOKUP_LIMIT; i++) expect(allowStaffLookup("1.1.1.1", 5000)).toBe(true);
    expect(allowStaffLookup("1.1.1.1", 5000)).toBe(false);
    expect(allowStaffLookup("2.2.2.2", 5000)).toBe(true);
    expect(allowStaffLookup("1.1.1.1", 5000 + 61_000)).toBe(true);
  });
});
