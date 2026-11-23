import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/googleServiceAccount", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token") }));
import { serverOrderStore, encodeOrderFields, decodeOrderFields } from "@/lib/serverOrderStore";
beforeEach(() => {
  process.env.FIREBASE_PROJECT_ID = "wind-reviews";
  process.env.FIREBASE_CLIENT_EMAIL = "service@example.com";
  process.env.FIREBASE_PRIVATE_KEY = "test-only";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ writeResults: [] }))));
});
describe("private server order REST store", () => {
  it("round-trips nested fields, arrays, null and money", () => {
    const v = { items: [{ price: 12.5, qty: 1, empty: null }], enabled: true, nested: { status: "pending" } };
    expect(decodeOrderFields(encodeOrderFields(v))).toEqual(v);
  });
  it("all writes use an atomic commit with create preconditions", async () => {
    await serverOrderStore.commit([{ collection: "WindCheckoutAttempts", id: "WIND-12345678", data: { a: 1 }, create: true }]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("documents:commit");
    expect(JSON.parse(init.body).writes[0].currentDocument).toEqual({ exists: false });
  });
  it("CAS updates require the observed document version", async () => {
    await serverOrderStore.commit([{ collection: "Jobs", id: "a", data: { state: "sent" }, version: "2026-11-23T00:00:00Z", merge: true }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body).writes[0].currentDocument).toEqual({ updateTime: "2026-11-23T00:00:00Z" });
    await expect(serverOrderStore.commit([{ collection: "Jobs", id: "a", data: {} }])).rejects.toMatchObject({ code: "ORDER_PRECONDITION_REQUIRED" });
  });
  it("missing configuration fails before network access", async () => {
    delete process.env.FIREBASE_PRIVATE_KEY;
    await expect(serverOrderStore.get("Jobs", "a")).rejects.toMatchObject({ code: "ORDER_STORAGE_NOT_CONFIGURED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("conflict is classified; provider body is never surfaced", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { status: "ALREADY_EXISTS", message: "private provider detail" } }), { status: 409 }));
    await expect(serverOrderStore.commit([{ collection: "Jobs", id: "a", data: {}, create: true }])).rejects.toMatchObject({ code: "ORDER_WRITE_CONFLICT" });
  });
  it("invalid paths and unsupported values fail closed", async () => {
    await expect(serverOrderStore.get("Jobs", "../secret")).rejects.toMatchObject({ code: "INVALID_ORDER_DOCUMENT_ID" });
    expect(() => encodeOrderFields({ amount: Infinity })).toThrow();
  });
});
