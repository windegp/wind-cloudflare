import { beforeEach, describe, expect, it, vi } from "vitest";

const { putMock, deleteMock, verifyAdminMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  deleteMock: vi.fn(),
  verifyAdminMock: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { WIND_MEDIA: { put: putMock, delete: deleteMock } },
  })),
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIP: vi.fn(() => "203.0.113.8"),
}));
vi.mock("@/lib/verifyAdminIdToken", () => ({ verifyAdminIdToken: verifyAdminMock }));

import { POST as upload } from "../src/app/api/media/route.js";
import { POST as remove } from "../src/app/api/delete-image/route.js";

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function uploadRequest({ purpose = "review", bytes = pngBytes, origin = "https://windeg.com" } = {}) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.append("file", new Blob([bytes], { type: "image/png" }), "test.png");
  return new Request("https://windeg.com/api/media", {
    method: "POST",
    headers: { Origin: origin },
    body: form,
  });
}

describe("R2 media routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminMock.mockResolvedValue({ ok: false, reason: "admin_uid_mismatch" });
  });

  it("keeps public review uploads working and writes verified PNG bytes to the reviews prefix", async () => {
    const response = await upload(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/media\.windeg\.com\/uploads\/reviews\/[0-9a-f-]{36}\.png$/i);
    expect(body.mime).toBe("image/png");
    expect(putMock).toHaveBeenCalledOnce();
    expect(putMock.mock.calls[0][0]).toMatch(/^uploads\/reviews\//);
  });

  it("rejects cross-origin customer uploads and unsupported image bytes", async () => {
    const crossOrigin = await upload(uploadRequest({ origin: "https://attacker.example" }));
    expect(crossOrigin.status).toBe(403);

    const unsupported = await upload(uploadRequest({ bytes: Uint8Array.from([1, 2, 3, 4]) }));
    expect(unsupported.status).toBe(415);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("requires a verified admin for product uploads", async () => {
    const denied = await upload(uploadRequest({ purpose: "product" }));
    expect(denied.status).toBe(401);
    expect(putMock).not.toHaveBeenCalled();

    verifyAdminMock.mockResolvedValue({ ok: true });
    const accepted = await upload(uploadRequest({ purpose: "product" }));
    expect(accepted.status).toBe(200);
    expect(putMock.mock.calls.at(-1)[0]).toMatch(/^uploads\/products\//);
  });

  it("preserves ImageKit originals and only deletes managed product upload keys", async () => {
    const legacy = await remove(new Request("https://windeg.com/api/delete-image", {
      method: "POST",
      body: JSON.stringify({ url: "https://ik.imagekit.io/windeg/old.jpg" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect((await legacy.json()).skipped).toBe(true);
    expect(deleteMock).not.toHaveBeenCalled();

    verifyAdminMock.mockResolvedValue({ ok: true });
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const managed = await remove(new Request("https://windeg.com/api/delete-image", {
      method: "POST",
      body: JSON.stringify({ url: `https://media.windeg.com/uploads/products/${id}.png` }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    }));
    expect(managed.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(`uploads/products/${id}.png`);
  });
});
