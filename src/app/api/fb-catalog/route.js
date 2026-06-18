// app/api/fb-catalog/route.js
import { NextResponse } from "next/server";
import { getKV } from "@/lib/kv-cache"; // 👈 استيراد الدالة بناءً على ملف الـ KV الجديد الخاص بك


const SITE_URL = "https://windeg.com";
const BRAND = "WIND Shopping";
const CURRENCY = "EGP";
const KV_KEY = "fb_catalog_xml";

// -------- helpers --------

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const colorLabels = {
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

function buildXml(items) {
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

export async function GET() {
  try {
    // 1. جلب الـ KV binding الخاص بـ Cloudflare بأمان
    const kv = await getKV();

    if (kv) {
      // قراءة النص مباشرة بدون JSON.parse لأن الـ catalog هو XML خام
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

    // 2. جلب المنتجات من Firestore REST API
    const PROJECT_ID = "wind-reviews";
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

    const firestoreRes = await fetch(firestoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "products" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "status" },
              op: "EQUAL",
              value: { stringValue: "Active" },
            },
          },
        },
      }),
    });

    if (!firestoreRes.ok) {
      throw new Error(`Firestore API error: ${firestoreRes.statusText}`);
    }

    const firestoreData = await firestoreRes.json();
    const items = [];

    if (Array.isArray(firestoreData)) {
      for (const row of firestoreData) {
        if (!row.document || !row.document.fields) continue;
        const rawFields = row.document.fields;
        const handle = row.document.name.split("/").pop() ?? "";

        const f = (field) => rawFields[field]?.stringValue ?? "";
        const fArr = (field) =>
          rawFields[field]?.arrayValue?.values?.map((v) => v.stringValue ?? "").filter(Boolean) ?? [];
        const fMap = (field) => {
          const fields = rawFields[field]?.mapValue?.fields;
          if (!fields) return {};
          return Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v.stringValue ?? ""])
          );
        };
        const fArrMaps = (field) =>
          rawFields[field]?.arrayValue?.values?.map((v) => v.mapValue?.fields ?? {}).filter(Boolean) ?? [];

        const p = {
          title: f("title"),
          description: f("description"),
          price: f("price"),
          compareAtPrice: f("compareAtPrice"),
          sellOutOfStock: f("sellOutOfStock"),
          quantity: f("quantity"),
          images: fArr("images"),
          colorSwatches: fMap("colorSwatches"),
          selectedCollections: fArr("selectedCollections"),
          variants: fArrMaps("variants"),
          seoDescription: rawFields["seo"]?.mapValue?.fields?.description?.stringValue ?? "",
        };

        const productUrl = `${SITE_URL}/products/${handle}`;
        const baseTitle = p.title ?? "";
        const rawDescription = p.description || p.seoDescription || "";
        const cleanDescription = escapeXml(stripHtml(rawDescription));
        const basePrice = p.price ?? "0";
        const compareAtPrice = p.compareAtPrice ?? "";
        const images = Array.isArray(p.images) ? p.images : [];
        const colorSwatches = p.colorSwatches ?? {};
        const googleCategory =
          p.selectedCollections.find((c) => c.includes(">")) ??
          "Apparel & Accessories > Clothing";
        const variants = Array.isArray(p.variants) ? p.variants : [];

        // ---- منتج بدون variants ----
        if (variants.length === 0) {
          const mainImage = images[0] ?? "";
          if (!mainImage) continue;

          const availability =
            Number(p.quantity ?? 0) > 0 || p.sellOutOfStock === "Yes"
              ? "in stock"
              : "out of stock";
          const hasSale = compareAtPrice && parseFloat(compareAtPrice) > parseFloat(basePrice);

          items.push(`<item>
        <g:id>${escapeXml(handle)}</g:id>
        <g:title>${escapeXml(baseTitle)}</g:title>
        <g:description>${cleanDescription}</g:description>
        <g:link>${productUrl}</g:link>
        <g:image_link>${escapeXml(mainImage)}</g:image_link>
        ${images.slice(1, 10).map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n       ")}
        <g:availability>${availability}</g:availability>
        ${hasSale
          ? `<g:price>${compareAtPrice}.00 ${CURRENCY}</g:price>\n       <g:sale_price>${basePrice}.00 ${CURRENCY}</g:sale_price>`
          : `<g:price>${basePrice}.00 ${CURRENCY}</g:price>`}
        <g:brand>${BRAND}</g:brand>
        <g:condition>new</g:condition>
        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
      </item>`);
          continue;
        }

        // ---- منتج بـ variants (colors) ----
        const seenColors = new Set();

        for (const v of variants) {
          if (!v) continue;

          const colorValue =
            v["option1Value"]?.stringValue ||
            v["option2Value"]?.stringValue || "";
          const variantPrice = v["price"]?.stringValue ?? basePrice;
          const variantCompare = v["compareAtPrice"]?.stringValue ?? compareAtPrice;
          
          const qty = Number(v["quantity"]?.integerValue ?? v["quantity"]?.stringValue ?? 0);
          const colorKey = colorValue.toLowerCase().replace(/\s+/g, "-");

          if (seenColors.has(colorKey)) continue;
          seenColors.add(colorKey);

          const variantImage =
            colorSwatches[colorKey] ?? colorSwatches[colorValue] ?? images[0] ?? "";
          if (!variantImage) continue;

          const availability =
            qty > 0 || p.sellOutOfStock === "Yes" ? "in stock" : "out of stock";
          const colorLabel = colorLabels[colorKey] ?? colorLabels[colorValue] ?? colorValue;
          const itemId = `${handle}-${colorKey}`;
          const itemTitle = colorValue ? `${baseTitle} - ${colorLabel}` : baseTitle;
          const extraImages = images.filter((img) => img !== variantImage).slice(0, 9);
          const hasSale = variantCompare && parseFloat(variantCompare) > parseFloat(variantPrice);

          items.push(`<item>
        <g:id>${escapeXml(itemId)}</g:id>
        <g:item_group_id>${escapeXml(handle)}</g:item_group_id>
        <g:title>${escapeXml(itemTitle)}</g:title>
        <g:description>${cleanDescription}</g:description>
        <g:link>${productUrl}?color=${encodeURIComponent(colorValue)}</g:link>
        <g:image_link>${escapeXml(variantImage)}</g:image_link>
        ${extraImages.map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n       ")}
        <g:availability>${availability}</g:availability>
        ${hasSale
          ? `<g:price>${variantCompare}.00 ${CURRENCY}</g:price>\n       <g:sale_price>${variantPrice}.00 ${CURRENCY}</g:sale_price>`
          : `<g:price>${variantPrice}.00 ${CURRENCY}</g:price>`}
        <g:brand>${BRAND}</g:brand>
        <g:condition>new</g:condition>
        <g:color>${escapeXml(colorLabel)}</g:color>
        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
      </item>`);
        }
      }
    }

    const xml = buildXml(items);

    // 3. التخزين في Cloudflare KV مباشرة كـ string (تستخدم دالة put الأصلية)
    if (kv) {
      // لم نستخدم kvSet لأن الكتالوج يُصنف كـ content ولا نريد تطبيق منطق السيريالايز الخاص بـ JSON.
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