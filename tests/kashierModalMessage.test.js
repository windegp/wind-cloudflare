import { describe, it, expect } from "vitest";
import { isKashierCloseMessage, getKashierMessageName } from "@/lib/kashierModalMessage";

const O = "https://checkout.kashier.io";
const P = "https://payments.kashier.io";
describe("kashier modal close message", () => {
  it("closes on closeIframe and iframeHide from Kashier", () => {
    expect(isKashierCloseMessage({ origin: O, data: { message: "closeIframe" } })).toBe(true);
    expect(isKashierCloseMessage({ origin: O, data: { message: "iframeHide" } })).toBe(true);
    expect(isKashierCloseMessage({ origin: O, data: JSON.stringify({ message: "closeIframe" }) })).toBe(true);
  });
  it("closes on closeIframe from payments.kashier.io (where checkout.kashier.io redirects)", () => {
    expect(isKashierCloseMessage({ origin: P, data: { message: "closeIframe", params: {} } })).toBe(true);
  });
  it("ignores other origins", () => {
    expect(isKashierCloseMessage({ origin: "https://evil.example", data: { message: "closeIframe" } })).toBe(false);
    expect(getKashierMessageName({ origin: "https://payments.kashier.io.evil.example", data: { message: "closeIframe" } })).toBe(null);
  });
  it("ignores other messages and bad data", () => {
    expect(isKashierCloseMessage({ origin: O, data: { message: "paymentSuccess" } })).toBe(false);
    expect(isKashierCloseMessage({ origin: O, data: null })).toBe(false);
    expect(isKashierCloseMessage(null)).toBe(false);
  });
});
