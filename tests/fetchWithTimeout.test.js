import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("returns the response when the request finishes in time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    const res = await fetchWithTimeout("/x", {}, 1000);
    expect(await res.text()).toBe("ok");
  });

  it("throws a TimeoutError with a user message when the request stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }))
    );
    const pending = fetchWithTimeout("/x", {}, 500, "بطيء");
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError", message: "بطيء" });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it("passes other errors through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    await expect(fetchWithTimeout("/x", {}, 1000)).rejects.toThrow("network");
  });
});
