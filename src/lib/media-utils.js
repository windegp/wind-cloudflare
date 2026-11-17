export const IMAGEKIT_HOST = "ik.imagekit.io";
export const STORE_MEDIA_ORIGIN = "https://media.windeg.com";

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

export function normalizeImageKitPath(value) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== IMAGEKIT_HOST) return null;
    const decoded = decodeURIComponent(url.pathname);
    const parts = decoded.split("/").filter(Boolean);
    if (parts[0]?.toLowerCase() === "windeg") parts.shift();
    return parts.length ? `/${parts.join("/")}` : null;
  } catch {
    return null;
  }
}

export function sniffImageType(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { extension: "png", mime: "image/png" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { extension: "webp", mime: "image/webp" };
  }
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return { extension: "gif", mime: "image/gif" };
  }
  return null;
}


export function replaceImageKitUrlsDeep(value, pathToNewUrl) {
  if (typeof value === "string") {
    return value.replace(URL_PATTERN, (candidate) => {
      const path = normalizeImageKitPath(candidate);
      if (!path) return candidate;

      const replacement = pathToNewUrl instanceof Map
        ? pathToNewUrl.get(path)
        : null;

      return replacement || candidate;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceImageKitUrlsDeep(item, pathToNewUrl));
  }

  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      replaceImageKitUrlsDeep(item, pathToNewUrl),
    ]),
  );
}
