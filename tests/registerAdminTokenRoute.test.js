import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake Cloudflare KV with real TTL semantics so the rate-limit tests exercise the
// actual checkRateLimit() code instead of a stubbed allow/deny.
const mocks = vi.hoisted(() => ({
  firestoreAdminSet: vi.fn(async () => ({})),
  verifyAdminIdToken: vi.fn(),
  kv: { store: new Map(), mode: "ok" },
}));

vi.mock("@/lib/firestoreAdmin", () => ({ firestoreAdminSet: mocks.firestoreAdminSet }));

vi.mock("@/lib/verifyAdminIdToken", () => ({
  verifyAdminIdToken: mocks.verifyAdminIdToken,
}));

vi.mock("@/lib/kv-cache", () => ({
  getKV: vi.fn(async () => {
    if (mocks.kv.mode === "missing") return null;
    return {
      get: async (k) => {
        if (mocks.kv.mode === "throws") throw new Error("kv down");
        const entry = mocks.kv.store.get(k);
        if (!entry) return null;
        if (entry.expiresAt && Date.now() >= entry.expiresAt) {
          mocks.kv.store.delete(k);
          return null;
        }
        return entry.value;
      },
      put: async (k, v, opts) => {
        if (mocks.kv.mode === "throws") throw new Error("kv down");
        const ttlMs = opts?.expirationTtl ? opts.expirationTtl * 1000 : 0;
        mocks.kv.store.set(k, { value: v, expiresAt: ttlMs ? Date.now() + ttlMs : 0 });
      },
      delete: async (k) => {
        mocks.kv.store.delete(k);
      },
    };
  }),
}));

import { OPTIONS, POST } from "@/app/api/register-admin-token/route";

// The native app must sign in with Firebase Auth and send its ID token.
// Default caller here: an orders-role staff member.
const STAFF_AUTH = { ok: true, uid: "staff-orders-uid", role: "orders", status: 200 };

// Shaped like a real FCM token: ~190 chars, base64url-ish body plus the ":APA91b" segment.
const TOKEN = "dGhpcy1pcy1hLXJlYWwtbG9va2luZy1mbWNtLXRva2Vu" + ":APA91b" + "a".repeat(140);

const call = ({ token = TOKEN, platform = "android-native", ip = "203.0.113.7", headers = {}, body, auth = "Bearer test-id-token" } = {}) => {
  const h = { "content-type": "application/json", ...headers };
  if (auth !== null) h.authorization = auth;
  if (ip) h["cf-connecting-ip"] = ip;
  return POST(
    new Request("https://windeg.com/api/register-admin-token", {
      method: "POST",
      headers: h,
      body: JSON.stringify(body ?? { token, platform }),
    })
  );
};

beforeEach(() => {
  mocks.firestoreAdminSet.mockClear();
  mocks.verifyAdminIdToken.mockReset();
  // Like the real verifier: no Bearer header → 401; otherwise the
  // default caller is an orders-role staff member (tests override
  // this per case with mockResolvedValue).
  mocks.verifyAdminIdToken.mockImplementation(async (req) => {
    const header = req?.headers?.get?.("authorization") || "";
    if (!/^Bearer\s+\S+$/.test(header)) {
      return { ok: false, reason: "missing_bearer_token", status: 401 };
    }
    return { ...STAFF_AUTH };
  });
  mocks.kv.store.clear();
  mocks.kv.mode = "ok";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/register-admin-token — normal registration still works", () => {
  it("registers the real app request (token + android-native) exactly as before", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(1);
    expect(mocks.firestoreAdminSet).toHaveBeenCalledWith(
      "adminTokens",
      TOKEN,
      expect.objectContaining({
        token: TOKEN,
        // The caller's real uid + role — never the owner UID stamp.
        uid: "staff-orders-uid",
        role: "orders",
        platform: "android-native",
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("keeps the platform label, and stores 'unknown' when it is missing or absurd", async () => {
    await call({ ip: "203.0.113.11", body: { token: TOKEN } }); // platform key absent
    expect(mocks.firestoreAdminSet.mock.calls[0][2].platform).toBe("unknown");

    await call({ ip: "203.0.113.14", platform: null });
    expect(mocks.firestoreAdminSet.mock.calls[1][2].platform).toBe("unknown");

    await call({ ip: "203.0.113.12", platform: "x".repeat(41) });
    expect(mocks.firestoreAdminSet.mock.calls[2][2].platform).toBe("unknown");

    await call({ ip: "203.0.113.13", platform: "android-native" });
    expect(mocks.firestoreAdminSet.mock.calls[3][2].platform).toBe("android-native");
  });

  it("accepts a token exactly at the 1500-char ceiling", async () => {
    const maxToken = "a".repeat(1500);
    const res = await call({ token: maxToken, ip: "203.0.113.31" });
    expect(res.status).toBe(200);
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(1);
    expect(mocks.firestoreAdminSet.mock.calls[0][1]).toBe(maxToken);
  });

  it("does not block normal use when KV is unavailable (registration keeps working)", async () => {
    mocks.kv.mode = "missing";
    const res = await call({ ip: "203.0.113.21" });
    expect(res.status).toBe(200);
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/register-admin-token — authentication (fail closed)", () => {
  it("rejects a request with no Authorization header and writes nothing", async () => {
    const res = await call({ auth: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.firestoreAdminSet).not.toHaveBeenCalled();
  });

  it("rejects an invalid ID token and writes nothing", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({
      ok: false,
      reason: "firebase_lookup_failed_401_INVALID_ID_TOKEN",
      status: 401,
    });
    const res = await call();
    expect(res.status).toBe(401);
    expect(mocks.firestoreAdminSet).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-staff caller (403) and writes nothing", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({
      ok: false,
      reason: "not_staff",
      status: 403,
    });
    const res = await call();
    expect(res.status).toBe(403);
    expect(mocks.firestoreAdminSet).not.toHaveBeenCalled();
  });

  it("stores the owner's uid + role when the caller is the owner", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({
      ok: true,
      uid: "jGb9wBMHZfRIQgR9yfbb3rkvzRw2",
      role: "owner",
      status: 200,
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.firestoreAdminSet).toHaveBeenCalledWith(
      "adminTokens",
      TOKEN,
      expect.objectContaining({
        uid: "jGb9wBMHZfRIQgR9yfbb3rkvzRw2",
        role: "owner",
      }),
    );
  });

  it("lets any active staff member register (send-time filter decides delivery)", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({
      ok: true,
      uid: "staff-viewer-uid",
      role: "viewer",
      status: 200,
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.firestoreAdminSet).toHaveBeenCalledWith(
      "adminTokens",
      TOKEN,
      expect.objectContaining({ uid: "staff-viewer-uid", role: "viewer" }),
    );
  });
});

describe("POST /api/register-admin-token — token shape", () => {
  it("rejects tokens that can never be valid, without writing", async () => {
    const bad = [
      { body: {} }, // token key absent
      { token: null },
      { token: "" },
      { token: "short-token" },
      { token: 12345 },
      { token: { value: TOKEN } },
      { token: TOKEN.slice(0, 63) }, // one char under the floor
      { token: `${TOKEN}/extra` }, // '/' would break the Firestore doc path
      { token: `${TOKEN.slice(0, 80)} with space` },
      { token: `${TOKEN.slice(0, 80)}\nrest` },
      { token: `${TOKEN.slice(0, 80)}توكن` }, // non-ASCII (Arabic)
      { token: `${TOKEN.slice(0, 80)}🔥` }, // non-ASCII (emoji)
      { token: "a".repeat(1501) }, // one char over the ceiling
    ];

    let i = 0;
    for (const payload of bad) {
      const res = await call({ ...payload, ip: `198.51.100.${++i}` });
      expect(res.status, `token case ${i}`).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: "Missing or invalid token" });
    }
    expect(mocks.firestoreAdminSet).not.toHaveBeenCalled();
  });
});

describe("POST /api/register-admin-token — rate limit", () => {
  it("allows 10 requests per window, then blocks with 429 and no write", async () => {
    const ip = "192.0.2.10";
    for (let i = 0; i < 10; i++) {
      const res = await call({ ip });
      expect(res.status).toBe(200);
    }
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(10);

    const blocked = await call({ ip });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ success: false, error: "Too many requests" });
    expect(blocked.headers.get("access-control-allow-origin")).toBe("*");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(10); // the blocked request wrote nothing
  });

  it("lets the IP register again after the block expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T06:00:00Z"));
    const ip = "192.0.2.20";

    for (let i = 0; i < 11; i++) await call({ ip });
    expect((await call({ ip })).status).toBe(429);

    // Block is 15 minutes, the counter window 10 minutes: after 15 minutes both are gone.
    vi.setSystemTime(new Date("2026-11-27T06:16:00Z"));
    const res = await call({ ip });
    expect(res.status).toBe(200);
  });

  it("counts each IP separately", async () => {
    const blockedIp = "192.0.2.30";
    for (let i = 0; i < 11; i++) await call({ ip: blockedIp });
    expect((await call({ ip: blockedIp })).status).toBe(429);

    const otherIp = "192.0.2.31";
    expect((await call({ ip: otherIp })).status).toBe(200);
  });

  it("ignores client-supplied forwarding headers (cf-connecting-ip decides the bucket)", async () => {
    const ip = "192.0.2.40";
    for (let i = 0; i < 11; i++) await call({ ip });
    expect((await call({ ip })).status).toBe(429);

    // A client rotating X-Forwarded-For / X-Real-IP must not get a fresh bucket.
    const spoofed = await call({
      ip,
      headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" },
    });
    expect(spoofed.status).toBe(429);
  });

  it("falls back to the in-memory counter when KV throws, and still enforces the limit", async () => {
    mocks.kv.mode = "throws"; // getKV resolves, but every get/put throws
    const ip = "192.0.2.50";

    for (let i = 0; i < 10; i++) {
      const res = await call({ ip });
      expect(res.status, `request ${i + 1} inside the limit`).toBe(200);
    }
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(10);

    const blocked = await call({ ip });
    expect(blocked.status).toBe(429); // the memory fallback still rejects the 11th
    expect(mocks.firestoreAdminSet).toHaveBeenCalledTimes(10);

    // A different IP in the same isolate keeps its own counter.
    expect((await call({ ip: "192.0.2.51" })).status).toBe(200);
  });

  it("buckets requests with no cf-connecting-ip together instead of trusting other headers", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call({ ip: null, headers: { "x-forwarded-for": `10.0.0.${i}` } })).status).toBe(200);
    }
    const res = await call({ ip: null, headers: { "x-forwarded-for": "10.9.9.9" } });
    expect(res.status).toBe(429);
  });
});

describe("OPTIONS /api/register-admin-token", () => {
  it("keeps the CORS preflight exactly as it was", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    // Authorization must be allowed: the app sends its Firebase ID token.
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
  });
});
