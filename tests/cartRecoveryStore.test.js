import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/serverOrderStore", () => ({
  serverOrderStore: storeMocks,
  OrderStoreError: class OrderStoreError extends Error {
    constructor(code, status = 503) {
      super(code);
      this.code = code;
      this.status = status;
    }
  },
}));

import { getCartRecovery, saveCartRecovery } from "@/lib/cartRecoveryStore";
import { RECOVERY_WINDOW_MS } from "@/lib/cartRecovery";

const QUOTE = { total: 500, cartItems: [{ id: "P1", qty: 1 }] };

describe("saveCartRecovery", () => {
  beforeEach(() => {
    storeMocks.get.mockReset();
    storeMocks.commit.mockReset();
    storeMocks.commit.mockResolvedValue({});
  });

  it("creates a fresh uuid token for a new order and stores the quote", async () => {
    storeMocks.get.mockResolvedValue(null);

    const token = await saveCartRecovery({
      orderId: "WIND-12345-AB",
      quote: QUOTE,
      now: () => new Date("2026-11-26T10:00:00.000Z"),
    });

    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(storeMocks.commit).toHaveBeenCalledTimes(1);
    const writes = storeMocks.commit.mock.calls[0][0];
    expect(writes).toHaveLength(2);
    const byToken = writes.find((write) => write.collection === "WindCartRecovery");
    expect(byToken.id).toBe(token);
    expect(byToken.data.quote).toEqual(QUOTE);
    expect(byToken.data.anchor).toBe("2026-11-26T10:00:00.000Z");
  });

  // commit في serverOrderStore يرفض أي كتابة بدون create أو version
  // (ORDER_PRECONDITION_REQUIRED). ده السبب الحقيقي لفشل الحفظ في الإنتاج.
  it("always sends a create or version precondition with every write", async () => {
    storeMocks.get.mockResolvedValue(null);
    await saveCartRecovery({ orderId: "WIND-12345-AB", quote: QUOTE });
    for (const write of storeMocks.commit.mock.calls[0][0]) {
      expect(Boolean(write.create) || Boolean(write.version)).toBe(true);
    }

    storeMocks.commit.mockClear();
    storeMocks.get
      .mockResolvedValueOnce({ data: { token: "123e4567-e89b-42d3-a456-426614174000" }, version: "v1" })
      .mockResolvedValueOnce({ data: { orderId: "WIND-12345-AB", quote: QUOTE }, version: "v2" });
    await saveCartRecovery({ orderId: "WIND-12345-AB", quote: QUOTE });
    const writes = storeMocks.commit.mock.calls[0][0];
    expect(writes[0].version).toBe("v1");
    expect(writes[1].version).toBe("v2");
    expect(writes.every((write) => !write.create)).toBe(true);
  });

  it("reuses the existing token for the same order so sent links stay valid", async () => {
    const existingToken = "123e4567-e89b-42d3-a456-426614174000";
    storeMocks.get
      .mockResolvedValueOnce({ data: { token: existingToken }, version: "v1" })
      .mockResolvedValueOnce({ data: { orderId: "WIND-12345-AB", quote: QUOTE }, version: "v2" });

    const token = await saveCartRecovery({ orderId: "WIND-12345-AB", quote: QUOTE });

    expect(token).toBe(existingToken);
    const writes = storeMocks.commit.mock.calls[0][0];
    const byToken = writes.find((write) => write.collection === "WindCartRecovery");
    expect(byToken.id).toBe(existingToken);
  });

  it("replaces a malformed stored token", async () => {
    storeMocks.get.mockResolvedValue({ data: { token: "not-a-token" } });
    const token = await saveCartRecovery({ orderId: "WIND-12345-AB", quote: QUOTE });
    expect(token).not.toBe("not-a-token");
  });
});

describe("getCartRecovery", () => {
  beforeEach(() => {
    storeMocks.get.mockReset();
  });

  it("rejects malformed tokens without hitting the store", async () => {
    expect(await getCartRecovery("WIND-12345-AB")).toBeNull();
    expect(storeMocks.get).not.toHaveBeenCalled();
  });

  it("returns the recovery with its honoring window", async () => {
    storeMocks.get.mockResolvedValue({
      data: { orderId: "WIND-12345-AB", quote: QUOTE, anchor: "2026-11-26T10:00:00.000Z" },
    });

    const recovery = await getCartRecovery("123e4567-e89b-42d3-a456-426614174000");

    expect(recovery.orderId).toBe("WIND-12345-AB");
    expect(recovery.anchorMs).toBe(Date.parse("2026-11-26T10:00:00.000Z"));
    expect(recovery.expiresAtMs).toBe(Date.parse("2026-11-26T10:00:00.000Z") + RECOVERY_WINDOW_MS);
  });

  it("returns null for missing or incomplete records", async () => {
    storeMocks.get.mockResolvedValue(null);
    expect(await getCartRecovery("123e4567-e89b-42d3-a456-426614174000")).toBeNull();

    storeMocks.get.mockResolvedValue({ data: { orderId: "WIND-1" } });
    expect(await getCartRecovery("123e4567-e89b-42d3-a456-426614174000")).toBeNull();
  });
});
