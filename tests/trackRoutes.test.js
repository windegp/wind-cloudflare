import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiGuards", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceRateLimit: vi.fn(async () => null),
}));

import { POST as fbPost } from "@/app/api/fb-track/route";
import { POST as ttPost } from "@/app/api/tt-track/route";

const call = (handler, path, body, headers = {}) =>
  handler(
    new Request(`https://windeg.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

describe("tracking relays", () => {
  it("fb-track rejects cross-origin and origin-less calls", async () => {
    expect((await call(fbPost, "/api/fb-track", { event_name: "PageView" })).status).toBe(403);
    expect((await call(fbPost, "/api/fb-track", { event_name: "PageView" }, { origin: "https://evil.example" })).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fb-track rejects unknown event names", async () => {
    const res = await call(fbPost, "/api/fb-track", { event_name: "MadeUpEvent" }, { origin: "https://windeg.com" });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tt-track rejects cross-origin calls and unknown events", async () => {
    expect((await call(ttPost, "/api/tt-track", { event: "ViewContent" })).status).toBe(403);
    const res = await call(ttPost, "/api/tt-track", { event: "Nope" }, { origin: "https://windeg.com" });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
