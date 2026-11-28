import { describe, expect, it } from "vitest";
import { buildAdminTokenDoc, isNotificationRecipient } from "@/lib/adminTokens";
import { ROLES } from "@/lib/rbac";

// Policy decided by the owner (2026-11-28, amended the same day to include
// viewer): new-order notifications go to owner + admin + orders + viewer.
// Products / content excluded.
describe("isNotificationRecipient — new-order notification policy", () => {
  it.each([
    [ROLES.OWNER, true],
    [ROLES.ADMIN, true],
    [ROLES.ORDERS, true],
    [ROLES.VIEWER, true],
    [ROLES.PRODUCTS, false],
    [ROLES.CONTENT, false],
  ])("role %s receives: %s", (role, expected) => {
    expect(isNotificationRecipient(role)).toBe(expected);
  });

  it("rejects unknown / missing roles", () => {
    expect(isNotificationRecipient("superadmin")).toBe(false);
    expect(isNotificationRecipient(undefined)).toBe(false);
    expect(isNotificationRecipient(null)).toBe(false);
  });
});

describe("buildAdminTokenDoc — token stored with the owner's real uid + role", () => {
  it("stores the staff member's real uid and role, never the owner UID", () => {
    const doc = buildAdminTokenDoc(
      { uid: "staff-orders-uid", role: "orders" },
      "some-fcm-token",
      "2026-11-28 12:00:00",
    );
    expect(doc).toEqual({
      token: "some-fcm-token",
      uid: "staff-orders-uid",
      role: "orders",
      createdAt: "2026-11-28 12:00:00",
      lastSeenAt: "2026-11-28 12:00:00",
    });
  });

  it("keeps the owner profile as-is for the owner", () => {
    const doc = buildAdminTokenDoc(
      { uid: "jGb9wBMHZfRIQgR9yfbb3rkvzRw2", role: "owner" },
      "owner-token",
      "2026-11-28 12:00:00",
    );
    expect(doc.uid).toBe("jGb9wBMHZfRIQgR9yfbb3rkvzRw2");
    expect(doc.role).toBe("owner");
  });

  it("merges caller extras (platform / userAgent) without touching uid/role", () => {
    const doc = buildAdminTokenDoc(
      { uid: "staff-admin-uid", role: "admin" },
      "native-token",
      "2026-11-28 12:00:00",
      { platform: "android-native" },
    );
    expect(doc.platform).toBe("android-native");
    expect(doc.uid).toBe("staff-admin-uid");
    expect(doc.role).toBe("admin");
  });
});
