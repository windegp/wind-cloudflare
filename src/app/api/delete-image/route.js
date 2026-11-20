import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { STORE_MEDIA_ORIGIN, classifyManagedMediaKey } from "@/lib/media-utils";
import { findMediaReferences } from "@/lib/mediaReferences";
import { verifyAdminIdToken } from "@/lib/verifyAdminIdToken";

export const dynamic = "force-dynamic";

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

    // Only random-UUID product uploads are ever deletable; migrated files keep their original names.
    const classification = classifyManagedMediaKey(key);
    if (!classification.deletable) {
      return NextResponse.json({ success: true, skipped: true, reason: classification.reason });
    }

    const auth = await verifyAdminIdToken(request);
    if (!auth?.ok) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Never delete an image that another document still uses, and never delete when that cannot be checked.
    let references;
    try {
      references = await findMediaReferences(key);
    } catch (error) {
      console.error("R2 media reference check failed:", error?.message || error);
      return NextResponse.json({ success: true, skipped: true, reason: "reference_check_unavailable" });
    }
    if (references.referenced) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "media_still_referenced",
        referencedBy: [...new Set(references.locations.map(({ collection }) => collection))],
      });
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
