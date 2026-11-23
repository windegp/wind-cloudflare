import { describe, expect, it } from "vitest";
import { escapeHtml, isSameOrigin, safeHttpUrl } from "@/lib/apiGuards";

const req = (headers = {}, url = "https://windeg.com/api/fb-track") =>
  new Request(url, { method: "POST", headers });

describe("isSameOrigin", () => {
  it("accepts the site's own origin and referer", () => {
    expect(isSameOrigin(req({ origin: "https://windeg.com" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://www.windeg.com" }))).toBe(true);
    expect(isSameOrigin(req({ referer: "https://windeg.com/products/x" }))).toBe(true);
  });

  it("rejects other origins and requests with no origin or referer", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://windeg.com.evil.example" }))).toBe(false);
    expect(isSameOrigin(req({}))).toBe(false);
    expect(isSameOrigin(req({ origin: "null" }))).toBe(false);
  });
});

describe("escapeHtml / safeHttpUrl", () => {
  it("escapes markup in text and attributes", () => {
    expect(escapeHtml('<img src=x onerror="a()">&\'')).toBe(
      "&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;"
    );
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(12.5)).toBe("12.5");
  });

  it("allows only http(s) URLs", () => {
    expect(safeHttpUrl("https://media.windeg.com/a.jpg")).toBe("https://media.windeg.com/a.jpg");
    expect(safeHttpUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpUrl("not a url")).toBe("");
  });
});
