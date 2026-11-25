import { expect, it } from "vitest";
import { createRequire } from "module";
const { normalizeLastActive } = createRequire(import.meta.url)("../scripts/normalizeLastActive.cjs");
it("converts the old format", () => {
  expect(normalizeLastActive("7/16/2026, 12:21:07 PM")).toBe("2026-07-16 12:21:07");
  expect(normalizeLastActive("6/24/2026, 10:33:27 AM")).toBe("2026-06-24 10:33:27");
  expect(normalizeLastActive("1/2/2026, 12:05:00 AM")).toBe("2026-01-02 00:05:00");
});
it("leaves the normal format and junk alone", () => {
  expect(normalizeLastActive("2026-11-25 08:42:12")).toBeNull();
  expect(normalizeLastActive(undefined)).toBeNull();
});
