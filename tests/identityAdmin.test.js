// Unit tests for src/lib/identityAdmin.js — Identity Toolkit REST
// calls are mocked (no Firebase needed).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(async () => "test-access-token"),
  fetch: vi.fn(),
}));

vi.mock("@/lib/googleServiceAccount", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken,
}));

import {
  createAuthUser,
  getAuthUserByEmail,
  preprovisionAuthUser,
} from "@/lib/identityAdmin";

beforeEach(() => {
  process.env.FIREBASE_PROJECT_ID = "wind-reviews";
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const CREATE_URL =
  "https://identitytoolkit.googleapis.com/v1/projects/wind-reviews/accounts";

function jsonResponse(ok, body, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

describe("getAuthUserByEmail", () => {
  it("returns the user when lookup finds one", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(true, {
        users: [{ localId: "uid-1", email: "a@example.com", disabled: false }],
      }),
    );
    const user = await getAuthUserByEmail("a@example.com");
    expect(user).toEqual({ uid: "uid-1", email: "a@example.com", disabled: false });
    expect(mocks.fetch).toHaveBeenCalledWith(
      LOOKUP_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: ["a@example.com"] }),
      }),
    );
    const headers = mocks.fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-access-token");
  });

  it("returns null when no user matches the email", async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse(true, { users: [] }));
    await expect(getAuthUserByEmail("nobody@example.com")).resolves.toBeNull();
  });

  it("throws on a lookup failure without leaking details", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(false, { error: { message: "PERMISSION_DENIED" } }, 403),
    );
    await expect(getAuthUserByEmail("a@example.com")).rejects.toThrow(
      /lookup failed \(403\): PERMISSION_DENIED/,
    );
  });
});

describe("createAuthUser", () => {
  it("creates a passwordless user with email only", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(true, { localId: "uid-2", email: "b@example.com" }),
    );
    const user = await createAuthUser("b@example.com");
    expect(user).toEqual({ uid: "uid-2", email: "b@example.com" });
    expect(mocks.fetch).toHaveBeenCalledWith(
      CREATE_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "b@example.com", emailVerified: false }),
      }),
    );
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("password");
  });

  it("returns null on EMAIL_EXISTS (race — caller must re-lookup)", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(false, { error: { message: "EMAIL_EXISTS" } }, 400),
    );
    await expect(createAuthUser("b@example.com")).resolves.toBeNull();
  });

  it("throws on other create failures", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(false, { error: { message: "INVALID_EMAIL" } }, 400),
    );
    await expect(createAuthUser("b@example.com")).rejects.toThrow(
      /create failed \(400\): INVALID_EMAIL/,
    );
  });

  it("throws when the project id env var is missing", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    await expect(createAuthUser("b@example.com")).rejects.toThrow(
      /FIREBASE_PROJECT_ID env var missing/,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("preprovisionAuthUser", () => {
  it("reuses an existing user without creating one", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(true, { users: [{ localId: "uid-9", email: "c@example.com" }] }),
    );
    const result = await preprovisionAuthUser("c@example.com");
    expect(result).toEqual({ uid: "uid-9", created: false });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("creates a new user when none exists", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(true, { users: [] }))
      .mockResolvedValueOnce(
        jsonResponse(true, { localId: "uid-10", email: "d@example.com" }),
      );
    const result = await preprovisionAuthUser("d@example.com");
    expect(result).toEqual({ uid: "uid-10", created: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("recovers from a create race by re-looking up", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(true, { users: [] }))
      .mockResolvedValueOnce(
        jsonResponse(false, { error: { message: "EMAIL_EXISTS" } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse(true, { users: [{ localId: "uid-11", email: "e@example.com" }] }),
      );
    const result = await preprovisionAuthUser("e@example.com");
    expect(result).toEqual({ uid: "uid-11", created: false });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });
});
