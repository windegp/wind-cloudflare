import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiGuards", async (orig) => ({ ...(await orig()), enforceRateLimit: vi.fn(async () => null) }));
import { POST } from "@/app/api/contact/route";
import { validateContactForm, buildContactEmail } from "@/lib/contactForm";

const good = { name: "منى", phone: "٠١٠١٢٣٤٥٦٧٨", email: "Mona@Example.com", topic: "order", message: "عايزة أعرف طلبي وصل فين" };
const call = (body, headers = { origin: "https://windeg.com" }) =>
  POST(new Request("https://windeg.com/api/contact", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

let fetchMock;
beforeEach(() => {
  process.env.RESEND_API_KEY = "test-key";
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "x" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("contact form", () => {
  it("validates fields", () => {
    expect(validateContactForm(good).ok).toBe(true);
    expect(validateContactForm({ ...good, name: "" }).ok).toBe(false);
    expect(validateContactForm({ ...good, phone: "123" }).ok).toBe(false);
    expect(validateContactForm({ ...good, email: "a@b" }).ok).toBe(false);
    expect(validateContactForm({ ...good, email: "a@b.com\nbcc:x@y.com" }).ok).toBe(false);
    expect(validateContactForm({ ...good, message: "قصير" }).ok).toBe(false);
  });

  it("escapes every customer field in the email and keeps the subject on one line", () => {
    const { data } = validateContactForm({ ...good, name: "<script>alert(1)</script>\nX", message: "<img src=x onerror=alert(1)> hello there" });
    const { html, subject } = buildContactEmail(data);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("rejects cross-origin requests and sends nothing", async () => {
    expect((await call(good, {})).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only to the fixed owner address, ignoring any recipient in the body", async () => {
    const res = await call({ ...good, to: "victim@evil.com", recipient: "victim@evil.com", cc: "victim@evil.com" });
    expect(res.status).toBe(200);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.to).toBe("windegp@gmail.com");
    expect(payload.reply_to).toBe("mona@example.com");
    expect(payload.cc).toBeUndefined();
    expect(payload.bcc).toBeUndefined();
  });

  it("honeypot: fake success, no email", async () => {
    const res = await call({ ...good, website: "http://spam" });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an Arabic error when Resend fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await call(good);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/[\u0600-\u06FF]/);
  });

  it("subscription: subject says discount subscription, inquiry subject says inquiry", async () => {
    const sub = await call({ type: "subscribe", email: "New@Example.com", to: "x@evil.com" });
    expect(sub.status).toBe(200);
    const p1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(p1.subject).toContain("اشتراك خصم");
    expect(p1.to).toBe("windegp@gmail.com");
    expect(p1.html).toContain("new@example.com");
    await call(good);
    const p2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(p2.subject).toContain("استفسار");
  });

  it("subscription validation, same-origin and honeypot", async () => {
    expect((await call({ type: "subscribe", email: "bad" })).status).toBe(400);
    expect((await call({ type: "subscribe", email: "a@b.com\nbcc:x@y.com" })).status).toBe(400);
    expect((await call({ type: "subscribe", email: "a@b.com" }, {})).status).toBe(403);
    expect((await call({ type: "subscribe", email: "a@b.com", website: "spam" })).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
