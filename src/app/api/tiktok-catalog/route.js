// app/api/tiktok-catalog/route.js
// Independent TikTok Catalog feed. Meta Catalog and catalogId.js are untouched.
// sku_id = Firestore variantId; item_group_id = product handle; color/size = exact variant.

import { htmlToPlainText } from "@/lib/htmlToPlainText";
import { GENERIC_COLLECTIONS } from "@/lib/constants";
import { getGoogleProductCategory } from "@/lib/productTaxonomy";
import { getTikTokSkuId, getTikTokVariantAttributes } from "@/lib/tiktokCatalogId";

const PROJECT_ID = "wind-reviews";
const BRAND = "WIND Shopping";
const SITE_URL = "https://windeg.com";

function escapeXml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function ttAvailability(status) {
  switch (String(status || "").toUpperCase()) {
    case "IN_STOCK":
    case "LOW_STOCK": return "in stock";
    case "PREORDER":
    case "PRE_ORDER": return "preorder";
    case "BACKORDER": return "available for order";
    case "DISCONTINUED": return "discontinued";
    default: return "out of stock";
  }
}

export async function GET() {
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
    const firestoreRes = await fetch(firestoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "products" }], where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "Active" } } } } }),
    });
    if (!firestoreRes.ok) throw new Error(`Firestore API error: ${firestoreRes.statusText}`);
    const firestoreData = await firestoreRes.json();
    const rows = [];
    const arr = (fields, name) => fields[name]?.arrayValue?.values || [];
    const str = (fields, name) => fields[name]?.stringValue ?? "";

    for (const row of Array.isArray(firestoreData) ? firestoreData : []) {
      if (!row.document?.fields) continue;
      const fields = row.document.fields;
      const handle = row.document.name.split("/").pop() || "";
      const title = str(fields, "title");
      const description = htmlToPlainText(str(fields, "description") || fields.seo?.mapValue?.fields?.description?.stringValue || "");
      const productPrice = parseFloat(str(fields, "price")) || 0;
      const images = arr(fields, "images").map(v => v.stringValue ?? "").filter(Boolean);
      const swatchFields = fields.colorSwatches?.mapValue?.fields || {};
      const colorSwatches = Object.fromEntries(Object.entries(swatchFields).map(([k, v]) => [k, v.stringValue ?? ""]));
      const variants = arr(fields, "variants").map(v => v.mapValue?.fields || {}).filter(Boolean);
      const productOptions = arr(fields, "options").map(v => v.mapValue?.fields || {}).filter(Boolean).map(o => ({
        name: o.name?.stringValue || "", values: o.values?.stringValue || "",
      }));

      const categories = arr(fields, "categories").map(v => v.stringValue ?? "").filter(Boolean);
      const collections = arr(fields, "selectedCollections").map(v => v.stringValue ?? "").filter(Boolean);
      const source = categories.length ? categories : collections;
      const meaningful = [...new Set(source.map(c => c.replace(/^\//, "").trim()).filter(c => c && !c.includes(">") && !GENERIC_COLLECTIONS.has(c)))];
      const rawProductType = str(fields, "productType");
      const productType = rawProductType ? rawProductType.replace(/-/g, " ") : (meaningful[0]?.replace(/-/g, " ") || "WIND Collection");
      const googleProductCategory = getGoogleProductCategory(rawProductType || productType);

      if (variants.length) {
        for (const v of variants) {
          const plainVariant = {
            variantId: str(v, "variantId"), color: str(v, "color"), size: str(v, "size"),
            option1Name: str(v, "option1Name"), option1Value: str(v, "option1Value"),
            option2Name: str(v, "option2Name"), option2Value: str(v, "option2Value"),
          };
          const attrs = getTikTokVariantAttributes({ options: productOptions }, plainVariant);
          const skuId = getTikTokSkuId(handle, plainVariant);
          if (!skuId) continue;
          const inventoryStatus = str(v, "inventoryStatus");
          const variantPrice = parseFloat(str(v, "price"));
          const price = Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : productPrice;
          const image = (attrs.color && colorSwatches[attrs.color]) || images[0] || "";
          const params = new URLSearchParams();
          if (attrs.color) params.set("color", attrs.color);
          if (attrs.size) params.set("size", attrs.size);
          rows.push({
            sku_id: skuId, item_group_id: handle, title, description,
            color: attrs.color, size: attrs.size,
            availability: ttAvailability(inventoryStatus), condition: "new",
            price: `${price.toFixed(2)} EGP`,
            link: `${SITE_URL}/products/${handle}${params.toString() ? `?${params.toString()}` : ""}`,
            image_link: image, brand: BRAND, product_type: productType,
            google_product_category: googleProductCategory,
          });
        }
      } else {
        const quantity = parseInt(str(fields, "quantity"), 10) || 0;
        rows.push({
          sku_id: handle, item_group_id: handle, title, description, color: "", size: "",
          availability: quantity > 0 || str(fields, "sellOutOfStock") === "Yes" ? "in stock" : "out of stock",
          condition: "new", price: `${productPrice.toFixed(2)} EGP`, link: `${SITE_URL}/products/${handle}`,
          image_link: images[0] || "", brand: BRAND, product_type: productType, google_product_category: googleProductCategory,
        });
      }
    }

    const itemsXml = rows.map(r => `    <item>\n      <g:sku_id>${escapeXml(r.sku_id)}</g:sku_id>\n      <g:item_group_id>${escapeXml(r.item_group_id)}</g:item_group_id>\n      <g:title>${escapeXml(r.title)}</g:title>\n      <g:description>${escapeXml(r.description)}</g:description>\n      ${r.color ? `<g:color>${escapeXml(r.color)}</g:color>` : ""}\n      ${r.size ? `<g:size>${escapeXml(r.size)}</g:size>` : ""}\n      <g:availability>${escapeXml(r.availability)}</g:availability>\n      <g:condition>${escapeXml(r.condition)}</g:condition>\n      <g:price>${escapeXml(r.price)}</g:price>\n      <g:link>${escapeXml(r.link)}</g:link>\n      <g:image_link>${escapeXml(r.image_link)}</g:image_link>\n      <g:brand>${escapeXml(r.brand)}</g:brand>\n      <g:product_type>${escapeXml(r.product_type)}</g:product_type>\n      <g:google_product_category>${escapeXml(r.google_product_category)}</g:google_product_category>\n    </item>`).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>WIND Shopping — TikTok Product Feed</title>\n    <link>${SITE_URL}</link>\n    <description>WIND Shopping TikTok E-commerce Catalog Feed</description>\n${itemsXml}\n  </channel>\n</rss>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch (err) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Error</title><description>${escapeXml(err.message)}</description></channel></rss>`, { status: 500, headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }
}
