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
  it("queries due states in bounded order and decodes documents", async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify([{ document: { name: "projects/wind-reviews/databases/(default)/documents/Jobs/job1", fields: { state: { stringValue: "pending" } }, updateTime: "v1" } }])));
    expect(await serverOrderStore.listDue("Jobs", { states: ["pending", "retry"], before: "2026-11-23T14:00:00Z", limit: 10 })).toEqual([{ id: "job1", data: { state: "pending" }, version: "v1" }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body).structuredQuery.limit).toBe(10);
  });
  it("invalid paths and unsupported values fail closed", async () => {
    await expect(serverOrderStore.get("Jobs", "../secret")).rejects.toMatchObject({ code: "INVALID_ORDER_DOCUMENT_ID" });
    expect(() => encodeOrderFields({ amount: Infinity })).toThrow();
  });
  it("getData returns decoded fields or null for missing and invalid ids", async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ fields: { Total: { integerValue: "42" } }, updateTime: "v1" })));
    expect(await serverOrderStore.getData("Orders", "A1")).toEqual({ Total: 42 });
    fetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    expect(await serverOrderStore.getData("Orders", "missing")).toBeNull();
    // An id the client SDK would report as simply absent is null here too.
    expect(await serverOrderStore.getData("Orders", "../secret")).toBeNull();
  });
  it("query ANDs field filters and decodes matching documents", async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify([
      { document: { name: "projects/wind-reviews/databases/(default)/documents/Customers/a%40b.com", fields: { Phone: { stringValue: "0100" }, "Total Orders": { integerValue: "3" } }, updateTime: "v1" } },
      {},
    ])));
    const rows = await serverOrderStore.query("Customers", { filters: [
      { field: "Phone", op: "EQUAL", value: "0100" },
      { field: "last_active", op: "GREATER_THAN_OR_EQUAL", value: "2026-01-01 00:00:00" },
    ], limit: 5 });
    expect(rows).toEqual([{ id: "a%40b.com", data: { Phone: "0100", "Total Orders": 3 }, version: "v1" }]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.structuredQuery.where.compositeFilter.op).toBe("AND");
    expect(body.structuredQuery.where.compositeFilter.filters).toHaveLength(2);
    expect(body.structuredQuery.limit).toBe(5);
  });
  it("backtick-quotes field paths with spaces (e.g. \"Created at\") for the REST API", async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify([])));
    await serverOrderStore.query("Orders", { filters: [
      { field: "Created at", op: "GREATER_THAN_OR_EQUAL", value: "2026-11-01 00:00:00" },
    ] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.structuredQuery.where.fieldFilter.field.fieldPath).toBe("`Created at`");
  });
  it("leaves simple field paths unquoted", async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify([])));
    await serverOrderStore.query("Customers", { filters: [{ field: "Phone", op: "EQUAL", value: "0100" }] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.structuredQuery.where.fieldFilter.field.fieldPath).toBe("Phone");
  });
  it("query validates collection, fields, ops and limit before any network call", async () => {
    await expect(serverOrderStore.query("Bad Collection!", { filters: [{ field: "a", op: "EQUAL", value: "x" }] })).rejects.toMatchObject({ code: "INVALID_ORDER_DOCUMENT_ID" });
    await expect(serverOrderStore.query("Customers", { filters: [{ field: "drop; table", op: "EQUAL", value: "x" }] })).rejects.toMatchObject({ code: "INVALID_ORDER_QUERY" });
    await expect(serverOrderStore.query("Customers", { filters: [{ field: "a", op: "NOT_EQUAL", value: "x" }] })).rejects.toMatchObject({ code: "INVALID_ORDER_QUERY" });
    await expect(serverOrderStore.query("Customers", { filters: [{ field: "a", op: "EQUAL", value: { nested: true } }] })).rejects.toMatchObject({ code: "INVALID_ORDER_QUERY" });
    await expect(serverOrderStore.query("Customers", { filters: [{ field: "a", op: "EQUAL", value: "x" }], limit: 0 })).rejects.toMatchObject({ code: "INVALID_ORDER_QUERY" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
