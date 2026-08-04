// app/api/tiktok-catalog/route.js
//
// فيد منتجات مستقل تمامًا لـ TikTok Catalog — لا يعدّل ولا يعتمد على تعديل
// /api/fb-catalog/route.js إطلاقًا. نفس مصدر البيانات (Firestore → products)
// يُقرأ هنا من جديد (طلب Firestore REST مستقل)، وليس عبر استيراد أي كود من
// fb-catalog/route.js.
//
// الاستيرادات المشتركة هنا للقراءة فقط: getCatalogId للـ sku_id الموحّد،
// htmlToPlainText لتنظيف الوصف، و getGoogleProductCategory لتصنيف التجارة.
// لا تعديل على Firestore ولا على catalogId.js.

import { getCatalogId } from "@/lib/catalogId";
import { htmlToPlainText } from "@/lib/htmlToPlainText";
import { GENERIC_COLLECTIONS } from "@/lib/constants";
import { getGoogleProductCategory } from "@/lib/productTaxonomy";

const PROJECT_ID = "wind-reviews";
const BRAND = "WIND Shopping";
const SITE_URL = "https://windeg.com";

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ttAvailability(inventoryStatus) {
  switch (inventoryStatus) {
    case "IN_STOCK":
    case "LOW_STOCK":
      return "in stock";
    case "PREORDER":
      return "preorder";
    default:
      return "out of stock";
  }
}

export async function GET() {
  try {
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
    const rows = [];

    if (Array.isArray(firestoreData)) {
      for (const row of firestoreData) {
        if (!row.document || !row.document.fields) continue;
        const rawFields = row.document.fields;
        const handle = row.document.name.split("/").pop() ?? "";

        const f = (field) => rawFields[field]?.stringValue ?? "";
        const fArrMaps = (field) =>
          rawFields[field]?.arrayValue?.values?.map((v) => v.mapValue?.fields ?? {}).filter(Boolean) ?? [];
        const fMap = (field) => {
          const fields = rawFields[field]?.mapValue?.fields;
          if (!fields) return {};
          return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.stringValue ?? ""]));
        };

        const title = f("title");
        const seoDescription = rawFields["seo"]?.mapValue?.fields?.description?.stringValue ?? "";
        const rawDescription = f("description") || seoDescription || "";
        const cleanDescription = htmlToPlainText(rawDescription);
        const price = parseFloat(f("price")) || 0;
        const compareAtPrice = parseFloat(f("compareAtPrice")) || 0;
        const images = rawFields["images"]?.arrayValue?.values?.map((v) => v.stringValue ?? "").filter(Boolean) ?? [];
        const colorSwatches = fMap("colorSwatches");
        const variants = fArrMaps("variants");

        const categoriesArr = rawFields["categories"]?.arrayValue?.values?.map((v) => v.stringValue ?? "").filter(Boolean) ?? [];
        const selectedCollectionsArr = rawFields["selectedCollections"]?.arrayValue?.values?.map((v) => v.stringValue ?? "").filter(Boolean) ?? [];
        const sourceCollections = categoriesArr.length > 0 ? categoriesArr : selectedCollectionsArr;
        const meaningfulCollections = [...new Set(
          sourceCollections
            .map((c) => c.replace(/^\//, "").trim())
            .filter((c) => c && !c.includes(">") && !GENERIC_COLLECTIONS.has(c))
        )];
        const rawProductType = f("productType");
        const productType = rawProductType
          ? rawProductType.replace(/-/g, " ")
          : (meaningfulCollections.length > 0
              ? meaningfulCollections[0].replace(/-/g, " ")
              : "WIND Collection");

        // Commerce taxonomy is independent from WIND marketing Collections.
        // Existing productType values remain the source of truth; this mapping
        // adds a standardized Google Product Category without changing Firestore.
        const googleProductCategory = getGoogleProductCategory(rawProductType || productType);

               // ── قراءة أسماء الخيارات على مستوى المنتج ────────────────────────
        // نفس منطق fb-catalog: نحدد أي option هو Color وأي option هو Size.
        const productOptions = fArrMaps("options");

        const isColorOptName = (name = "") => {
          const n = name.toLowerCase().trim();
          return (
            n.includes("color") ||
            n.includes("colour") ||
            n.includes("لون") ||
            n.includes("الوان")
          );
        };

        const isSizeOptName = (name = "") => {
          const n = name.toLowerCase().trim();
          return (
            n.includes("size") ||
            n.includes("مقاس") ||
            n.includes("حجم")
          );
        };

        let productColorOptIndex = -1;
        let productSizeOptIndex = -1;

        for (const opt of productOptions) {
          const optName = opt["name"]?.stringValue ?? "";
          const index = productOptions.indexOf(opt);

          if (isColorOptName(optName)) {
            productColorOptIndex = index === 0 ? 1 : 2;
          } else if (isSizeOptName(optName)) {
            productSizeOptIndex = index === 0 ? 1 : 2;
          }
        }

        const getVariantColorValue = (v) => {
          const n1 = v["option1Name"]?.stringValue ?? "";
          const n2 = v["option2Name"]?.stringValue ?? "";

          if (isColorOptName(n1)) {
            return v["option1Value"]?.stringValue ?? "";
          }

          if (isColorOptName(n2)) {
            return v["option2Value"]?.stringValue ?? "";
          }

          if (productColorOptIndex === 1) {
            return v["option1Value"]?.stringValue ?? "";
          }

          if (productColorOptIndex === 2) {
            return v["option2Value"]?.stringValue ?? "";
          }

          return v.color?.stringValue ?? "";
        };

        const getVariantSizeValue = (v) => {
          const n1 = v["option1Name"]?.stringValue ?? "";
          const n2 = v["option2Name"]?.stringValue ?? "";

          if (isSizeOptName(n1)) {
            return v["option1Value"]?.stringValue ?? "";
          }

          if (isSizeOptName(n2)) {
            return v["option2Value"]?.stringValue ?? "";
          }

          if (productSizeOptIndex === 1) {
            return v["option1Value"]?.stringValue ?? "";
          }

          if (productSizeOptIndex === 2) {
            return v["option2Value"]?.stringValue ?? "";
          }

          return v.size?.stringValue ?? "";
        };

        // ── TikTok: row واحد لكل لون، والمقاسات داخل size ──────────────
        const colorsSeen = new Set();
        let pushedColorless = false;

        for (const v of variants) {
          const colorValue = getVariantColorValue(v);
          const colorKey = colorValue.trim().toLowerCase();

          if (colorValue) {
            if (colorsSeen.has(colorKey)) continue;
            colorsSeen.add(colorKey);
          } else {
            if (pushedColorless) continue;
            pushedColorless = true;
          }

          // اجمع كل المقاسات المتاحة لهذا اللون فقط.
          const colorVariants = variants.filter((cv) => {
  const cvColor = getVariantColorValue(cv);
  return cvColor.trim().toLowerCase() === colorKey;
});

const anyColorAvailable = colorVariants.some((cv) => {
  const status = cv.inventoryStatus?.stringValue;
  return (
    status === "IN_STOCK" ||
    status === "LOW_STOCK" ||
    status === "PREORDER"
  );
});

const inventoryStatus = anyColorAvailable
  ? "IN_STOCK"
  : "OUT_OF_STOCK";

const image =
  (colorValue && colorSwatches[colorValue]) ||
  images[0] ||
  "";

          rows.push({
            sku_id: getCatalogId(handle, colorValue),
            item_group_id: handle,
            title,
            description: cleanDescription,
           color: colorValue || undefined,
size: colorVariants
  .filter((cv) => {
    const status = cv.inventoryStatus?.stringValue;
    return (
      status === "IN_STOCK" ||
      status === "LOW_STOCK" ||
      status === "PREORDER"
    );
  })
  .map((cv) => getVariantSizeValue(cv).trim())
  .filter(Boolean)
  .filter((size, index, arr) => arr.indexOf(size) === index)
  .join(", "),
availability: ttAvailability(inventoryStatus),
            condition: "new",
            price: `${price.toFixed(2)} EGP`,
            sale_price:
              compareAtPrice > price
                ? `${price.toFixed(2)} EGP`
                : undefined,
            link: colorValue
              ? `${SITE_URL}/products/${handle}?color=${encodeURIComponent(colorValue)}`
              : `${SITE_URL}/products/${handle}`,
            image_link: image,
            additional_image_links: images
              .filter((img) => img && img !== image)
              .slice(0, 10),
            brand: BRAND,
            product_type: productType,
            google_product_category: googleProductCategory,
          });
        }

        if (variants.length === 0) {
          rows.push({
            sku_id: getCatalogId(handle, ""),
            item_group_id: handle,
            title,
            description: cleanDescription,
            availability: "in stock",
            condition: "new",
            price: `${price.toFixed(2)} EGP`,
            sale_price:
              compareAtPrice > price
                ? `${price.toFixed(2)} EGP`
                : undefined,
            link: `${SITE_URL}/products/${handle}`,
            image_link: images[0] || "",
            additional_image_links: images
              .filter((img) => img && img !== images[0])
              .slice(0, 10),
            brand: BRAND,
            product_type: productType,
            google_product_category: googleProductCategory,
          });
        }
      }
    }

    const itemsXml = rows
      .map(
        (r) => `    <item>
      <g:sku_id>${escapeXml(r.sku_id)}</g:sku_id>
      <g:item_group_id>${escapeXml(r.item_group_id)}</g:item_group_id>
      <g:title>${escapeXml(r.title)}</g:title>
      <g:description>${escapeXml(r.description)}</g:description>
                ${r.color ? `<g:color>${escapeXml(r.color)}</g:color>` : ""}
      ${r.size ? `<g:size>${escapeXml(r.size)}</g:size>` : ""}
      <g:availability>${escapeXml(r.availability)}</g:availability>
      <g:condition>${escapeXml(r.condition)}</g:condition>
      <g:price>${escapeXml(r.price)}</g:price>
      ${r.sale_price ? `<g:sale_price>${escapeXml(r.sale_price)}</g:sale_price>` : ""}
      <g:link>${escapeXml(r.link)}</g:link>
      <g:image_link>${escapeXml(r.image_link)}</g:image_link>
      ${
        r.additional_image_links?.length
          ? r.additional_image_links
              .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
              .join("\n      ")
          : ""
      }
      <g:brand>${escapeXml(r.brand)}</g:brand>
      <g:product_type>${escapeXml(r.product_type)}</g:product_type>
      <g:google_product_category>${escapeXml(r.google_product_category)}</g:google_product_category>
    </item>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>WIND Shopping — TikTok Product Feed</title>
    <link>${SITE_URL}</link>
    <description>WIND Shopping TikTok E-commerce Catalog Feed</description>
${itemsXml}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Error</title><description>${escapeXml(err.message)}</description></channel></rss>`,
      {
        status: 500,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      }
    );
  }
}
