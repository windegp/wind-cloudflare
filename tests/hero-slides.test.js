import { describe, expect, it } from "vitest";
import { HERO_MOBILE_MEDIA, getHeroMobileImage, pickHeroImage } from "../src/lib/heroSlides";
import { MAX_STORE_IMAGE_BYTES, STORE_IMAGE_MIME_TYPES, sniffImageType } from "../src/lib/media-utils";

describe("hero slide image selection", () => {
  const legacy = { image: "https://media.windeg.com/a.webp", title: "x" };
  const modern = { ...legacy, mobileImage: "https://media.windeg.com/m.webp" };

  it("treats legacy slides (no mobileImage field) as having no mobile image", () => {
    expect(getHeroMobileImage(legacy)).toBe("");
    expect(getHeroMobileImage({ ...legacy, mobileImage: "" })).toBe("");
    expect(getHeroMobileImage({ ...legacy, mobileImage: "   " })).toBe("");
    expect(getHeroMobileImage({ ...legacy, mobileImage: null })).toBe("");
    expect(getHeroMobileImage(undefined)).toBe("");
  });

  it("falls back to the main image when there is no mobile image", () => {
    expect(pickHeroImage(legacy, true)).toBe(legacy.image);
    expect(pickHeroImage(legacy, false)).toBe(legacy.image);
  });

  it("uses the mobile image only on mobile viewports", () => {
    expect(pickHeroImage(modern, true)).toBe(modern.mobileImage);
    expect(pickHeroImage(modern, false)).toBe(modern.image);
  });

  it("keeps the mobile breakpoint in sync with the CSS (767px)", () => {
    expect(HERO_MOBILE_MEDIA).toBe("(max-width: 767px)");
  });
});

describe("shared store image limits", () => {
  it("matches the limits enforced by /api/media", () => {
    expect(MAX_STORE_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(STORE_IMAGE_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    // every client-allowed MIME type must be one the server can actually accept
    const accepted = new Set([
      sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))?.mime,
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime,
      sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.mime,
      sniffImageType(new TextEncoder().encode("GIF89a"))?.mime,
    ]);
    STORE_IMAGE_MIME_TYPES.forEach((mime) => expect(accepted.has(mime)).toBe(true));
  });
});
