import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/googleServiceAccount.js", () => ({ getGoogleAccessToken: vi.fn(async () => "token") }));

import { findMediaReferences } from "../src/lib/mediaReferences.js";

const key = "products/123e4567-e89b-42d3-a456-426614174000.png";
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

function fakeFirestore({ queryRows = [{ readTime: "t" }], collections = {} } = {}) {
  return vi.fn(async (url) => {
    if (String(url).endsWith(":runQuery")) return ok(queryRows);
    const name = String(url).split("/documents/")[1].split("?")[0];
    return ok(collections[name] || {});
  });
}
const options = (fetchImpl) => ({ projectId: "demo", getToken: async () => "token", fetchImpl });

describe("findMediaReferences", () => {
  it("reports nothing when no document uses the image", async () => {
    const result = await findMediaReferences(key, options(fakeFirestore()));
    expect(result).toEqual({ referenced: false, locations: [] });
  });

  it("finds an image shared through a product images array", async () => {
    const fetchImpl = fakeFirestore({ queryRows: [{ document: { name: "projects/demo/databases/(default)/documents/products/other" } }] });
    const result = await findMediaReferences(key, options(fetchImpl));
    expect(result.referenced).toBe(true);
    expect(result.locations[0]).toEqual({ collection: "products", document: "other" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.structuredQuery.where.fieldFilter).toMatchObject({ op: "ARRAY_CONTAINS", field: { fieldPath: "images" } });
  });

  it("finds the file name inside small collections, including nested maps and policy HTML", async () => {
    const fetchImpl = fakeFirestore({
      collections: {
        homepage: { documents: [{ name: "x/homepage/hero", fields: { slides: { arrayValue: { values: [{ mapValue: { fields: { src: { stringValue: `https://media.windeg.com/${key}` } } } }] } } } }] },
        Policies: { documents: [{ name: "x/Policies/returns", fields: { html: { stringValue: `<img src="/${key}">` } } }] },
      },
    });
    const result = await findMediaReferences(key, options(fetchImpl));
    expect(result.locations.map((l) => `${l.collection}/${l.document}`).sort()).toEqual(["Policies/returns", "homepage/hero"]);
  });

  it("follows page tokens when scanning a collection", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith(":runQuery")) return ok([]);
      calls.push(String(url));
      if (String(url).includes("/collections?") && !String(url).includes("pageToken")) return ok({ documents: [], nextPageToken: "p2" });
      if (String(url).includes("/collections?")) return ok({ documents: [{ name: "x/collections/c1", fields: { image: { stringValue: key } } }] });
      return ok({});
    });
    const result = await findMediaReferences(key, options(fetchImpl));
    expect(result.referenced).toBe(true);
    expect(calls.some((url) => url.includes("pageToken=p2"))).toBe(true);
  });

  it("throws instead of reporting 'unused' when a lookup fails", async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(findMediaReferences(key, options(failing))).rejects.toThrow(/failed \(503\)/);
    await expect(findMediaReferences(key, { projectId: "", getToken: async () => "t", fetchImpl: failing })).rejects.toThrow(/FIREBASE_PROJECT_ID/);
  });
});
