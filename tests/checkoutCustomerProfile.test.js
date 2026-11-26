import { describe, expect, it, vi } from "vitest";
import { applyCodCustomerProfileUpdate } from "@/lib/checkoutCustomerProfile";

const inc = n => ({ __increment: n });
const makeDeps = (overrides = {}) => ({
  db: {},
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}` })),
  setDoc: vi.fn(async () => {}),
  increment: vi.fn(inc),
  now: () => "2026-11-26 14:30:00",
  ...overrides,
});
const order = { customerId: "islam@example.com", phone: "01000000000", city: "Cairo", governorate: "Cairo", total: 1069 };

describe("applyCodCustomerProfileUpdate", () => {
  it("updates the profile with blind increments and never reads Customers", async () => {
    const deps = makeDeps();
    const result = await applyCodCustomerProfileUpdate(order, deps);
    expect(result).toBe(true);
    // لا توجد أي قراءة: الـ deps لا تحتوي getDoc أصلاً
    expect(deps.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = deps.setDoc.mock.calls[0];
    expect(ref.path).toBe("Customers/islam@example.com");
    expect(options).toEqual({ merge: true });
    expect(data["Total Orders"]).toEqual({ __increment: 1 });
    expect(data["Total Spent"]).toEqual({ __increment: 1069 });
    expect(data.Last_Order_Status).toBe("New");
    expect(data.hasAbandoned).toBe(false);
    expect(data.Phone).toBe("01000000000");
    expect(data.last_active).toBe("2026-11-26 14:30:00");
    // الحقول اللي محتاجة قراءة (الشرائح، الاسم، Created at) لا تُكتب
    expect(data).not.toHaveProperty("segments");
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("First Name");
  });

  it("returns false instead of throwing when the write fails, so checkout continues", async () => {
    const deps = makeDeps({ setDoc: vi.fn(async () => { const e = new Error("denied"); e.code = "permission-denied"; throw e; }) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await applyCodCustomerProfileUpdate(order, deps);
    expect(result).toBe(false);
    errorSpy.mockRestore();
  });

  it("does nothing when there is no customer id", async () => {
    const deps = makeDeps();
    const result = await applyCodCustomerProfileUpdate({ ...order, customerId: "" }, deps);
    expect(result).toBe(false);
    expect(deps.setDoc).not.toHaveBeenCalled();
  });
});
