import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocMock = vi.fn();
vi.mock("firebase/firestore/lite", () => ({ doc: vi.fn((_d, c, id) => ({ c, id })), getDoc: (...a) => getDocMock(...a) }));
vi.mock("@/lib/firebase", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/apiGuards", async (orig) => ({ ...(await orig()), enforceRateLimit: vi.fn(async () => null) }));

import { POST } from "@/app/api/track-order/route";
import { normalizeOrderNumber, phoneTail } from "@/lib/orderTracking";

const order = {
  Name: "WIND-12345-AB",
  Phone: "01012345678",
  Email: "secret@example.com",
  "Billing Name": "Secret Name",
  "Shipping Address1": "Secret street 5",
  "Shipping City": "القاهرة",
  "Financial Status": "pending",
  "Payment Method": "cod",
  "Created at": "2026-11-20 10:00:00",
  Total: 550,
  Currency: "EGP",
  lineItems: [{ productTitle: "فستان", quantity: 2, selectedSize: "L", selectedColor: "أسود" }],
};

const call = (body, headers = { origin: "https://windeg.com" }) =>
  POST(new Request("https://windeg.com/api/track-order", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => getDocMock.mockReset());

describe("track-order", () => {
  it("normalizes input", () => {
    expect(normalizeOrderNumber(" #wind-12345-ab ")).toBe("WIND-12345-AB");
    expect(normalizeOrderNumber("../x")).toBe("");
    expect(phoneTail("+20 101 234 5678")).toBe("1012345678");
    expect(phoneTail("٠١٠١٢٣٤٥٦٧٨")).toBe("1012345678");
    expect(phoneTail("123")).toBe("");
  });

  it("rejects requests without a same-origin header", async () => {
    const res = await call({ orderNumber: "WIND-12345-AB", phone: "01012345678" }, {});
    expect(res.status).toBe(403);
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("returns status and items for a matching pair, without personal data", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => order });
    const res = await call({ orderNumber: "wind-12345-ab", phone: "+201012345678" });
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("فستان");
    for (const secret of ["secret@example.com", "Secret Name", "Secret street", "01012345678"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("gives the same 404 for a wrong phone and for a missing order", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => order });
    const wrong = await call({ orderNumber: "WIND-12345-AB", phone: "01099999999" });
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });
    const missing = await call({ orderNumber: "WIND-00000-ZZ", phone: "01012345678" });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it("treats abandoned drafts as not found and never queries on a bad id", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ ...order, "Financial Status": "abandoned" }) });
    expect((await call({ orderNumber: "WIND-12345-AB", phone: "01012345678" })).status).toBe(404);
    getDocMock.mockClear();
    expect((await call({ orderNumber: "a/b", phone: "01012345678" })).status).toBe(404);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
