
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkRateLimit, getClientIP } from "@/lib/rateLimit";
import { sniffImageType } from "@/lib/media-utils";
import { verifyAdminIdToken } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);

    if (contentLength > MAX_IMAGE_BYTES + 64 * 1024) {
      return NextResponse.json(
        { error: "image_size_limit_exceeded" },
        { status: 413 },
      );
    }

    const form = await request.formData();
    const purpose = form.get("purpose");

    if (purpose !== "review" && purpose !== "product") {
      return NextResponse.json(
        { error: "invalid_purpose" },
        { status: 400 },
      );
    }

    if (purpose === "product") {
      const authResult = await verifyAdminIdToken(request);

      if (!authResult.ok) {
        return NextResponse.json(
          { error: "unauthorized" },
          { status: 401 },
        );
      }
    }

    if (purpose === "review") {
      const origin = request.headers.get("origin");

      if (origin && origin !== new URL(request.url).origin) {
        return NextResponse.json(
          { error: "invalid_origin" },
          { status: 403 },
        );
      }

      const limit = await checkRateLimit(
        getClientIP(request),
        "REVIEW_UPLOAD",
      );

      if (!limit.allowed) {
        return NextResponse.json(
          { error: "upload_rate_limited" },
          { status: 429 },
        );
      }
    }

    const files = form.getAll("file");

    if (
      files.length !== 1 ||
      typeof files[0]?.arrayBuffer !== "function"
    ) {
      return NextResponse.json(
        { error: "expected_one_image" },
        { status: 400 },
      );
    }

    const file = files[0];

    if (!file.size || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "image_size_limit_exceeded" },
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniffImageType(bytes);

    if (!detected) {
      return NextResponse.json(
        { error: "unsupported_image_type" },
        { status: 415 },
      );
    }

    const { env } = await getCloudflareContext({ async: true });

    if (!env.WIND_MEDIA) {
      throw new Error("WIND_MEDIA binding is unavailable");
    }

    const mediaFolder = purpose === "product" ? "products" : "reviews";
    const key = `uploads/${mediaFolder}/${crypto.randomUUID()}.${detected.extension}`;

    await env.WIND_MEDIA.put(key, bytes, {
      httpMetadata: {
        contentType: detected.mime,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    const encodedKey = key
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    return NextResponse.json({
      success: true,
      url: `https://media.windeg.com/${encodedKey}`,
      size: bytes.byteLength,
      mime: detected.mime,
    });
  } catch (error) {
    console.error("R2 media upload failed:", error?.message || error);

    return NextResponse.json(
      { error: "media_upload_failed" },
      { status: 500 },
    );
  }
}
