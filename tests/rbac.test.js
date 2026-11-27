// RBAC unit tests — pure logic in src/lib/rbac.js (no Firebase needed).
import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLES,
  hasAnyPermission,
  hasPermission,
  isAssignableRole,
  isOwnerUid,
  isValidRole,
  permissionForAdminPath,
  permissionsForRole,
  resolveRole,
} from "@/lib/rbac";
import { ADMIN_UID } from "@/lib/constants";

describe("roles and permissions", () => {
  it("owner has every permission including members.manage", () => {
    for (const p of Object.values(PERMISSIONS)) {
      expect(hasPermission(ROLES.OWNER, p)).toBe(true);
    }
  });

  it("admin has everything except members.manage", () => {
    expect(hasPermission(ROLES.ADMIN, PERMISSIONS.MEMBERS_MANAGE)).toBe(false);
    expect(hasPermission(ROLES.ADMIN, PERMISSIONS.PRODUCTS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.ADMIN, PERMISSIONS.ORDERS_EDIT)).toBe(true);
  });

  it("viewer is read-only", () => {
    expect(hasPermission(ROLES.VIEWER, PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
    expect(hasPermission(ROLES.VIEWER, PERMISSIONS.ORDERS_VIEW)).toBe(true);
    expect(hasPermission(ROLES.VIEWER, PERMISSIONS.ORDERS_EDIT)).toBe(false);
    expect(hasPermission(ROLES.VIEWER, PERMISSIONS.PRODUCTS_EDIT)).toBe(false);
    expect(hasPermission(ROLES.VIEWER, PERMISSIONS.MEMBERS_MANAGE)).toBe(false);
  });

  it("orders role cannot touch products or content", () => {
    expect(hasPermission(ROLES.ORDERS, PERMISSIONS.ORDERS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.ORDERS, PERMISSIONS.CUSTOMERS_VIEW)).toBe(true);
    expect(hasPermission(ROLES.ORDERS, PERMISSIONS.PRODUCTS_VIEW)).toBe(false);
    expect(hasPermission(ROLES.ORDERS, PERMISSIONS.CONTENT_EDIT)).toBe(false);
  });

  it("products role can edit products/collections/inventory and upload media", () => {
    expect(hasPermission(ROLES.PRODUCTS, PERMISSIONS.PRODUCTS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.PRODUCTS, PERMISSIONS.COLLECTIONS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.PRODUCTS, PERMISSIONS.INVENTORY_EDIT)).toBe(true);
    expect(hasPermission(ROLES.PRODUCTS, PERMISSIONS.MEDIA_UPLOAD)).toBe(true);
    expect(hasPermission(ROLES.PRODUCTS, PERMISSIONS.ORDERS_EDIT)).toBe(false);
  });

  it("content role can edit content/reviews/offers/promotions only", () => {
    expect(hasPermission(ROLES.CONTENT, PERMISSIONS.CONTENT_EDIT)).toBe(true);
    expect(hasPermission(ROLES.CONTENT, PERMISSIONS.REVIEWS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.CONTENT, PERMISSIONS.OFFERS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.CONTENT, PERMISSIONS.PROMOTIONS_EDIT)).toBe(true);
    expect(hasPermission(ROLES.CONTENT, PERMISSIONS.PRODUCTS_EDIT)).toBe(false);
    expect(hasPermission(ROLES.CONTENT, PERMISSIONS.MEMBERS_MANAGE)).toBe(false);
  });

  it("hasAnyPermission accepts a list (any match wins)", () => {
    expect(
      hasAnyPermission(ROLES.CONTENT, [PERMISSIONS.CONTENT_EDIT, PERMISSIONS.PRODUCTS_EDIT]),
    ).toBe(true);
    expect(
      hasAnyPermission(ROLES.VIEWER, [PERMISSIONS.CONTENT_EDIT, PERMISSIONS.PRODUCTS_EDIT]),
    ).toBe(false);
  });

  it("owner role cannot be assigned through the members UI/API", () => {
    expect(isAssignableRole(ROLES.OWNER)).toBe(false);
    expect(ASSIGNABLE_ROLES).not.toContain(ROLES.OWNER);
    expect(isValidRole(ROLES.OWNER)).toBe(true);
  });
});

describe("resolveRole / owner fallback", () => {
  it("owner UID resolves to owner even with no staff doc", () => {
    expect(isOwnerUid(ADMIN_UID)).toBe(true);
    expect(resolveRole(ADMIN_UID, null)).toBe(ROLES.OWNER);
    expect(resolveRole(ADMIN_UID, { role: "viewer", active: false })).toBe(ROLES.OWNER);
  });

  it("staff doc resolves to its role when active", () => {
    expect(resolveRole("some-uid", { role: "orders", active: true })).toBe("orders");
  });

  it("missing doc, inactive account, or invalid role resolve to null", () => {
    expect(resolveRole("some-uid", null)).toBeNull();
    expect(resolveRole("some-uid", { role: "orders", active: false })).toBeNull();
    expect(resolveRole("some-uid", { role: "superuser", active: true })).toBeNull();
    expect(resolveRole("some-uid", { role: "owner", active: true })).toBeNull();
  });

  it("permissionsForRole returns a copy", () => {
    const perms = permissionsForRole(ROLES.VIEWER);
    perms.push("bogus");
    expect(hasPermission(ROLES.VIEWER, "bogus")).toBe(false);
  });
});

describe("permissionForAdminPath", () => {
  it("maps sections to their required permission", () => {
    expect(permissionForAdminPath("/admin")).toBe(PERMISSIONS.DASHBOARD_VIEW);
    expect(permissionForAdminPath("/admin/orders")).toBe(PERMISSIONS.ORDERS_VIEW);
    expect(permissionForAdminPath("/admin/products/create")).toBe(PERMISSIONS.PRODUCTS_EDIT);
    expect(permissionForAdminPath("/admin/products")).toBe(PERMISSIONS.PRODUCTS_VIEW);
    expect(permissionForAdminPath("/admin/settings/members")).toBe(PERMISSIONS.MEMBERS_MANAGE);
    expect(permissionForAdminPath("/admin/settings")).toBe(PERMISSIONS.CONTENT_EDIT);
    expect(permissionForAdminPath("/admin/settings/shipping")).toBe(PERMISSIONS.CONTENT_EDIT);
    expect(permissionForAdminPath("/admin/inventory")).toBe(PERMISSIONS.INVENTORY_VIEW);
  });

  it("returns null for the login page and unknown paths", () => {
    expect(permissionForAdminPath("/admin/login")).toBeNull();
    expect(permissionForAdminPath("/products/abc")).toBeNull();
    expect(permissionForAdminPath(null)).toBeNull();
  });
});
