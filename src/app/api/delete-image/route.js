import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { STORE_MEDIA_ORIGIN } from "@/lib/media-utils";
import { verifyAdminIdToken } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

const PRODUCT_UPLOAD_KEY = /^(?:uploads\/)?products\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i;

export async function POST(request) {
  try {
    const { url } = await request.json();
    if (typeof url !== "string" || !url) {
      return NextResponse.json({ error: "invalid_url" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "invalid_url" }, { status: 400 });
    }

    // Keep ImageKit originals, migrated archive objects, review uploads, and external links.
    if (parsed.origin !== STORE_MEDIA_ORIGIN) {
      return NextResponse.json({ success: true, skipped: true, reason: "not_managed_r2_media" });
    }

    let key;
    try {
      key = decodeURIComponent(parsed.pathname.slice(1));
    } catch {
      return NextResponse.json({ error: "invalid_url_path" }, { status: 400 });
    }

    if (!PRODUCT_UPLOAD_KEY.test(key)) {
      return NextResponse.json({ success: true, skipped: true, reason: "not_a_product_upload" });
    }
    if (!(await verifyAdminIdToken(request))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { env } = await getCloudflareContext({ async: true });
    if (!env.WIND_MEDIA) throw new Error("WIND_MEDIA binding is unavailable");
    await env.WIND_MEDIA.delete(key);

    return NextResponse.json({ success: true, deleted: key });
  } catch (error) {
    console.error("R2 media deletion failed:", error?.message || error);
    return NextResponse.json({ error: "media_delete_failed" }, { status: 500 });
  }
}
