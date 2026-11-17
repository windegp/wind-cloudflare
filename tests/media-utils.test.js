import { describe, expect, it } from "vitest";
import {
  normalizeImageKitPath,
  replaceImageKitUrlsDeep,
  sniffImageType,
} from "../src/lib/media-utils.js";

describe("ImageKit and R2 media helpers", () => {
  it("normalizes delivery URLs, including encoded path segments and transformations", () => {
    expect(normalizeImageKitPath("https://ik.imagekit.io/windeg/WIND_Shopping/Blue%20Shawl.jpg?tr=w-500"))
      .toBe("/WIND_Shopping/Blue Shawl.jpg");
    expect(normalizeImageKitPath("https://example.com/WIND_Shopping/image.jpg")).toBeNull();
  });

  it("rewrites nested fields and ImageKit URLs embedded in HTML without changing unrelated data", () => {
    const oldUrl = "https://ik.imagekit.io/windeg/WIND_Shopping/logo.jpg?updatedAt=10";
    const data = {
      images: [oldUrl],
      content: `<img src="${oldUrl}">`,
      unrelated: "https://example.com/keep.jpg",
      count: 3,
    };
    const rewritten = replaceImageKitUrlsDeep(data, new Map([
      ["/WIND_Shopping/logo.jpg", "https://media.windeg.com/legacy/logo.jpg"],
    ]));

    expect(rewritten.images[0]).toBe("https://media.windeg.com/legacy/logo.jpg");
    expect(rewritten.content).toBe('<img src="https://media.windeg.com/legacy/logo.jpg">');
    expect(rewritten.unrelated).toBe(data.unrelated);
    expect(rewritten.count).toBe(3);
  });

  it("accepts only recognized raster image signatures", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0])).mime).toBe("image/jpeg");
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime).toBe("image/png");
    expect(sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])).mime).toBe("image/webp");
    expect(sniffImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).mime).toBe("image/gif");
    expect(sniffImageType(Uint8Array.from([0, 1, 2, 3]))).toBeNull();
  });
});
