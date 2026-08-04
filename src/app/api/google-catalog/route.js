// app/api/google-catalog/route.js
// Google Merchant Center feed — intentionally independent from Meta/TikTok feeds.
import { NextResponse } from "next/server";
import { getKV } from "@/lib/kv-cache";
import { getMetaAvailability } from "@/lib/inventoryHelpers";
import { slugifyColor } from "@/lib/catalogId";
import { GENERIC_COLLECTIONS } from "@/lib/constants";
import { htmlToPlainText } from "@/lib/htmlToPlainText";
import { getGoogleProductCategory } from "@/lib/productTaxonomy";

const SITE_URL = "https://windeg.com";
const BRAND = "WIND Shopping";
const CURRENCY = "EGP";
const KV_KEY = "google_catalog_xml_v1";

export const dynamic = "force-dynamic";

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(value = "") {
  return htmlToPlainText(String(value || "")).trim();
}

function slugify(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function variantId(handle, color = "", size = "") {
  const parts = [handle];
  if (color) parts.push(slugifyColor(color));
  if (size) parts.push(slugify(size));
  return parts.join("-");
}

function buildVariantOption(name, value) {
  if (!value) return "";
  return `<g:variant_option><g:name>${escapeXml(name)}</g:name><g:value>${escapeXml(value)}</g:value></g:variant_option>`;
}

function buildXml(items) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${escapeXml(BRAND)}</title>\n    <link>${SITE_URL}</link>\n    <description>Google Merchant Center product feed for ${escapeXml(BRAND)}</description>\n    ${items.join("\n    ")}\n  </channel>\n</rss>`;
}

function readFirestoreString(fields, field) {
  return fields[field]?.stringValue ?? "";
}

function readFirestoreArray(fields, field) {
  return fields[field]?.arrayValue?.values
    ?.map((value) => value.stringValue ?? "")
    .filter(Boolean) ?? [];
}

function readFirestoreMap(fields, field) {
  const mapFields = fields[field]?.mapValue?.fields;
  if (!mapFields) return {};
  return Object.fromEntries(
    Object.entries(mapFields).map(([key, value]) => [key, value.stringValue ?? ""])
  );
}

function readFirestoreArrayMaps(fields, field) {
  return fields[field]?.arrayValue?.values
    ?.map((value) => value.mapValue?.fields ?? {})
    .filter((value) => value && Object.keys(value).length > 0) ?? [];
}

function isColorOption(name = "") {
  const normalized = String(name).toLowerCase().trim();
  return normalized.includes("color") || normalized.includes("colour") || normalized.includes("لون") || normalized.includes("الوان");
}

function isSizeOption(name = "") {
  const normalized = String(name).toLowerCase().trim();
  return normalized.includes("size") || normalized.includes("مقاس") || normalized.includes("حجم");
}

function variantColor(variant, colorOptionIndex) {
  const name1 = variant.option1Name?.stringValue ?? "";
  const name2 = variant.option2Name?.stringValue ?? "";
  if (isColorOption(name1)) return variant.option1Value?.stringValue ?? "";
  if (isColorOption(name2)) return variant.option2Value?.stringValue ?? "";
  if (colorOptionIndex === 1) return variant.option1Value?.stringValue ?? "";
  if (colorOptionIndex === 2) return variant.option2Value?.stringValue ?? "";
  return "";
}

function variantSize(variant, sizeOptionIndex) {
  const name1 = variant.option1Name?.stringValue ?? "";
  const name2 = variant.option2Name?.stringValue ?? "";
  if (isSizeOption(name1)) return variant.option1Value?.stringValue ?? "";
  if (isSizeOption(name2)) return variant.option2Value?.stringValue ?? "";
  if (sizeOptionIndex === 1) return variant.option1Value?.stringValue ?? "";
  if (sizeOptionIndex === 2) return variant.option2Value?.stringValue ?? "";
  return "";
}

function variantAvailability(variant) {
  const availability = getMetaAvailability(variant?.inventoryStatus?.stringValue);
  return availability === "in stock" || availability === "preorder" ? "in stock" : "out of stock";
}

function hasSale(price, compareAtPrice) {
  const current = parseFloat(price);
  const compare = parseFloat(compareAtPrice);
  return Number.isFinite(current) && Number.isFinite(compare) && compare > current;
}

function priceXml(price, compareAtPrice) {
  const current = parseFloat(price);
  const compare = parseFloat(compareAtPrice);
  if (!Number.isFinite(current)) return "";

  if (Number.isFinite(compare) && compare > current) {
    return `<g:price>${compare.toFixed(2)} ${CURRENCY}</g:price>\n        <g:sale_price>${current.toFixed(2)} ${CURRENCY}</g:sale_price>`;
  }

  return `<g:price>${current.toFixed(2)} ${CURRENCY}</g:price>`;
}

function identifierXml(variant, productFields) {
  const gtin =
    variant?.gtin?.stringValue ||
    variant?.barcode?.stringValue ||
    productFields.gtin?.stringValue ||
    productFields.barcode?.stringValue ||
    "";

  if (!gtin) return "";
  return `<g:gtin>${escapeXml(gtin)}</g:gtin>`;
}

function productTypeAndLabels(fields) {
  const productTypeRaw = readFirestoreString(fields, "productType");
  const categories = readFirestoreArray(fields, "categories");
  const selectedCollections = readFirestoreArray(fields, "selectedCollections");
  const sourceCollections = categories.length > 0 ? categories : selectedCollections;

  const meaningfulCollections = Array.from(
    new Set(
      sourceCollections
        .map((value) => value.replace(/^\//, "").trim())
        .filter((value) => value && !value.includes(">") && !GENERIC_COLLECTIONS.has(value))
    )
  );

  const productType = productTypeRaw
    ? productTypeRaw.replace(/-/g, " ")
    : meaningfulCollections.length > 0
      ? meaningfulCollections[0].replace(/-/g, " ")
      : "WIND Collection";

  const googleCategory = getGoogleProductCategory(productTypeRaw || "");

  return { productType, googleCategory };
}

function makeItem({
  id,
  itemGroupId,
  itemGroupTitle,
  title,
  description,
  link,
  image,
  additionalImages,
  availability,
  price,
  compareAtPrice,
  gender,
  ageGroup,
  material,
  pattern,
  color,
  size,
  googleCategory,
  productType,
  variantOptions = [],
  identifiers = "",
}) {
  const variantOptionsXml = variantOptions
    .map(({ name, value }) => buildVariantOption(name, value))
    .join("\n        ");

  return `<item>\n        <g:id>${escapeXml(id)}</g:id>\n        ${itemGroupId ? `<g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>` : ""}\n        ${itemGroupTitle ? `<g:item_group_title>${escapeXml(itemGroupTitle)}</g:item_group_title>` : ""}\n        <g:title>${escapeXml(title)}</g:title>\n        <g:description>${escapeXml(description)}</g:description>\n        <g:link>${escapeXml(link)}</g:link>\n        <g:image_link>${escapeXml(image)}</g:image_link>\n        ${additionalImages.map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n        ")}\n        <g:availability>${escapeXml(availability)}</g:availability>\n        ${priceXml(price, compareAtPrice)}\n        <g:brand>${escapeXml(BRAND)}</g:brand>\n        <g:condition>new</g:condition>\n        ${identifiers}\n        ${gender ? `<g:gender>${escapeXml(gender)}</g:gender>` : ""}\n        ${ageGroup ? `<g:age_group>${escapeXml(ageGroup)}</g:age_group>` : ""}\n        ${material ? `<g:material>${escapeXml(material)}</g:material>` : ""}\n        ${pattern ? `<g:pattern>${escapeXml(pattern)}</g:pattern>` : ""}\n        ${color ? `<g:color>${escapeXml(color)}</g:color>` : ""}\n        ${size ? `<g:size>${escapeXml(size)}</g:size>` : ""}\n        ${variantOptionsXml}\n        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>\n        <g:product_type>${escapeXml(productType)}</g:product_type>\n      </item>`;
}

export async function GET() {
  try {
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
        if (!row.document?.fields) continue;

        const fields = row.document.fields;
        const handle = row.document.name.split("/").pop() ?? "";
        const title = readFirestoreString(fields, "title");
        const description = cleanText(
          readFirestoreString(fields, "description") ||
          fields.seo?.mapValue?.fields?.description?.stringValue ||
          ""
        );
        const basePrice = readFirestoreString(fields, "price") || "0";
        const compareAtPrice = readFirestoreString(fields, "compareAtPrice");
        const images = readFirestoreArray(fields, "images");
        const colorSwatches = readFirestoreMap(fields, "colorSwatches");
        const variants = readFirestoreArrayMaps(fields, "variants");
        const productOptions = readFirestoreArrayMaps(fields, "options");
        const gender = readFirestoreString(fields, "gender");
        const ageGroup = readFirestoreString(fields, "ageGroup");
        const material = readFirestoreString(fields, "material");
        const pattern = readFirestoreString(fields, "pattern");
        const { productType, googleCategory } = productTypeAndLabels(fields);

        const productUrl = `${SITE_URL}/products/${handle}`;
        const itemGroupId = handle;
        const itemGroupTitle = title;
        const mainImage = images[0] || "";
        if (!mainImage || !title) continue;

        let colorOptionIndex = -1;
        let sizeOptionIndex = -1;
        productOptions.forEach((option, index) => {
          const optionName = option.name?.stringValue ?? "";
          if (isColorOption(optionName)) colorOptionIndex = index === 0 ? 1 : 2;
          if (isSizeOption(optionName)) sizeOptionIndex = index === 0 ? 1 : 2;
        });

        const hasColors = variants.some((variant) => variantColor(variant, colorOptionIndex));
        const hasSizes = variants.some((variant) => variantSize(variant, sizeOptionIndex));
        const isVariantProduct = hasColors || hasSizes;

        if (!isVariantProduct) {
          const anyVariantInStock = variants.length > 0
            ? variants.some((variant) => variantAvailability(variant) === "in stock")
            : Number(basePrice) >= 0;
          const availability = variants.length > 0
            ? (anyVariantInStock ? "in stock" : "out of stock")
            : "in stock";

          items.push(makeItem({
            id: handle,
            title,
            description,
            link: productUrl,
            image: mainImage,
            additionalImages: images.slice(1, 11),
            availability,
            price: basePrice,
            compareAtPrice,
            gender,
            ageGroup,
            material,
            pattern,
            googleCategory,
            productType,
            identifiers: identifierXml({}, fields),
          }));
          continue;
        }

        // Google expects each apparel variant to be a separate product row.
        // Each row gets one size and/or one color, while item_group_id groups them.
        const emittedKeys = new Set();

        for (const variant of variants) {
          const color = variantColor(variant, colorOptionIndex);
          const size = variantSize(variant, sizeOptionIndex);
          if (!color && !size) continue;

          const key = `${slugifyColor(color)}|${slugify(size)}`;
          if (emittedKeys.has(key)) continue;
          emittedKeys.add(key);

          const variantPrice = variant.price?.stringValue || basePrice;
          const variantCompareAt = variant.compareAtPrice?.stringValue || compareAtPrice;
          const variantImage = color
            ? colorSwatches[slugifyColor(color)] || colorSwatches[color] || mainImage
            : mainImage;
          const additionalImages = images.filter((image) => image !== variantImage).slice(0, 10);
          const colorLabel = color || "";
          const availability = variantAvailability(variant);

          const variantOptions = [];
          if (color) variantOptions.push({ name: "color", value: colorLabel });
          if (size) variantOptions.push({ name: "size", value: size });

          items.push(makeItem({
            id: variantId(handle, color, size),
            itemGroupId,
            itemGroupTitle,
            title: [title, colorLabel, size].filter(Boolean).join(" - "),
            description,
            link: `${productUrl}?color=${encodeURIComponent(color)}${size ? `&size=${encodeURIComponent(size)}` : ""}`,
            image: variantImage,
            additionalImages,
            availability,
            price: variantPrice,
            compareAtPrice: variantCompareAt,
            gender,
            ageGroup,
            material,
            pattern,
            color: colorLabel,
            size,
            googleCategory,
            productType,
            variantOptions,
            identifiers: identifierXml(variant, fields),
          }));
        }
      }
    }

    const xml = buildXml(items);

    if (kv) {
      await kv.put(KV_KEY, xml, { expirationTtl: 86400 });
    }

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("[google-catalog]", error);
    return new NextResponse("Google catalog feed error", { status: 500 });
  }
}
