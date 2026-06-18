// app/api/fb-catalog/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore/lite";
import { kvGet, kvSet } from "@/lib/kv-cache";

const SITE_URL = "https://windeg.com";
const BRAND = "WIND";
const CURRENCY = "EGP";
const KV_KEY = "fb_catalog_xml";

// -------- helpers --------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const colorLabels: Record<string, string> = {
  burgundy: "بوردو",
  "jeans-blue": "أزرق جينز",
  brown: "بني",
  clear: "كريم",
  turquoise: "تيفاني",
  beige: "بيج",
  black: "أسود",
  white: "أبيض",
  navy: "نيفي",
  grey: "رمادي",
  camel: "كاميل",
  pink: "وردي",
  green: "أخضر",
  red: "أحمر",
  yellow: "أصفر",
  orange: "برتقالي",
  purple: "بنفسجي",
};

function buildXml(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>WIND Shopping</title>
    <link>${SITE_URL}</link>
    <description>WIND Egyptian Fashion Brand</description>
    ${items.join("\n    ")}
  </channel>
</rss>`;
}

// -------- main --------

export const runtime = "edge";

export async function GET() {
  try {
    // 1. حاول تجيب من KV الأول — kvGet بيرجع JSON.parse عادةً
    //    بس إحنا بنخزن XML string مش JSON، فهنستخدم getKV مباشرة
    const { getKV } = await import("@/lib/kv-cache");
    const kv = await getKV();

    if (kv) {
      const cached = await kv.get(KV_KEY);
      if (cached) {
        return new NextResponse(cached, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Cache": "HIT",
          },
        });
      }
    }

    // 2. اجيب المنتجات من Firestore
    const db = getDb();
    const q = query(collection(db, "products"), where("status", "==", "Active"));
    const snapshot = await getDocs(q);

    const items: string[] = [];

    snapshot.forEach((doc) => {
      const p = doc.data();
      const handle: string = doc.id;
      const productUrl = `${SITE_URL}/products/${handle}`;
      const baseTitle: string = (p.title as string) ?? "";
      const rawDescription: string =
        (p.description as string) ?? (p.seo?.description as string) ?? "";
      const cleanDescription = escapeXml(stripHtml(rawDescription));
      const basePrice: string = (p.price as string) ?? "0";
      const compareAtPrice: string = (p.compareAtPrice as string) ?? "";

      const images: string[] = Array.isArray(p.images) ? (p.images as string[]) : [];
      const colorSwatches: Record<string, string> =
        (p.colorSwatches as Record<string, string>) ?? {};

      const googleCategory: string =
        (p.selectedCollections as string[] | undefined)?.find((c) => c.includes(">")) ??
        "Apparel & Accessories > Clothing";

      const variants: Array<Record<string, unknown>> = Array.isArray(p.variants)
        ? (p.variants as Array<Record<string, unknown>>)
        : [];

      // ---- منتج بدون variants ----
      if (variants.length === 0) {
        const mainImage = images[0] ?? "";
        if (!mainImage) return;

        const availability =
          Number(p.quantity ?? 0) > 0 || p.sellOutOfStock === "Yes"
            ? "in stock"
            : "out of stock";

        const hasSale =
          compareAtPrice && parseFloat(compareAtPrice) > parseFloat(basePrice);

        items.push(`<item>
      <g:id>${escapeXml(handle)}</g:id>
      <g:title>${escapeXml(baseTitle)}</g:title>
      <g:description>${cleanDescription}</g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${escapeXml(mainImage)}</g:image_link>
      ${images
        .slice(1, 10)
        .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
        .join("\n      ")}
      <g:availability>${availability}</g:availability>
      ${hasSale
        ? `<g:price>${compareAtPrice}.00 ${CURRENCY}</g:price>\n      <g:sale_price>${basePrice}.00 ${CURRENCY}</g:sale_price>`
        : `<g:price>${basePrice}.00 ${CURRENCY}</g:price>`}
      <g:brand>${BRAND}</g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
    </item>`);
        return;
      }

      // ---- منتج بـ variants (colors) ----
      const seenColors = new Set<string>();

      variants.forEach((v) => {
        const colorValue: string =
          (v.option1Value as string) || (v.option2Value as string) || "";
        const colorKey = colorValue.toLowerCase().replace(/\s+/g, "-");

        if (seenColors.has(colorKey)) return;
        seenColors.add(colorKey);

        const variantImage =
          colorSwatches[colorKey] ?? colorSwatches[colorValue] ?? images[0] ?? "";
        if (!variantImage) return;

        const variantPrice: string = (v.price as string) ?? basePrice;
        const variantCompare: string = (v.compareAtPrice as string) ?? compareAtPrice;
        const qty = Number(v.quantity ?? 0);
        const availability =
          qty > 0 || p.sellOutOfStock === "Yes" ? "in stock" : "out of stock";

        const colorLabel = colorLabels[colorKey] ?? colorLabels[colorValue] ?? colorValue;
        const itemId = `${handle}-${colorKey}`;
        const itemTitle = colorValue ? `${baseTitle} - ${colorLabel}` : baseTitle;
        const extraImages = images.filter((img) => img !== variantImage).slice(0, 9);
        const hasSale =
          variantCompare && parseFloat(variantCompare) > parseFloat(variantPrice);

        items.push(`<item>
      <g:id>${escapeXml(itemId)}</g:id>
      <g:item_group_id>${escapeXml(handle)}</g:item_group_id>
      <g:title>${escapeXml(itemTitle)}</g:title>
      <g:description>${cleanDescription}</g:description>
      <g:link>${productUrl}?color=${encodeURIComponent(colorValue)}</g:link>
      <g:image_link>${escapeXml(variantImage)}</g:image_link>
      ${extraImages
        .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
        .join("\n      ")}
      <g:availability>${availability}</g:availability>
      ${hasSale
        ? `<g:price>${variantCompare}.00 ${CURRENCY}</g:price>\n      <g:sale_price>${variantPrice}.00 ${CURRENCY}</g:sale_price>`
        : `<g:price>${variantPrice}.00 ${CURRENCY}</g:price>`}
      <g:brand>${BRAND}</g:brand>
      <g:condition>new</g:condition>
      <g:color>${escapeXml(colorLabel)}</g:color>
      <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
    </item>`);
      });
    });

    const xml = buildXml(items);

    // 3. خزّن في KV كـ raw string (مش JSON)
    if (kv) {
      await kv.put(KV_KEY, xml);
    }

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
        "X-Items-Count": String(items.length),
      },
    });
  } catch (err) {
    console.error("[fb-catalog] error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}