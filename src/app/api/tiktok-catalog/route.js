// app/api/tiktok-catalog/route.js
//
// فيد منتجات مستقل تمامًا لـ TikTok Catalog — لا يعدّل ولا يعتمد على تعديل
// /api/fb-catalog/route.js إطلاقًا. نفس مصدر البيانات (Firestore → products)
// يُقرأ هنا من جديد (طلب Firestore REST مستقل)، وليس عبر استيراد أي كود من
// fb-catalog/route.js.
//
// الاستيراد الوحيد المشترك مع منظومة Meta: getCatalogId() — للقراءة فقط،
// كما صرَّح صاحب المشروع، لضمان أن sku_id الموحَّد نفسه يُستخدَم عبر كل
// المنصات الإعلانية لنفس المنتج (لا تعديل على catalogId.js إطلاقًا) —
// ونفس القيمة تُرسَل كـ content_id عبر أحداث TikTok (ttTrack.js).
// كذلك htmlToPlainText — أداة عامة نقية لتنظيف النصوص، ليست خاصة بـ Meta.
//
// الكتالوج المستهدَف E-commerce Catalog → يستخدم g:sku_id (وليس g:id).
//
// RSS 2.0 + xmlns:g — الصيغة القياسية التي تتطلبها TikTok فعليًا (مطابقة
// شبه كاملة لبنية Google Product Data Specification)، بعد أن كانت النسخة
// السابقة تُخرِج جذر <items> مخصَّصًا غير قياسي (السبب المؤكَّد لظهور
// "0 files / 0 products / Rejected" في TikTok Catalog upload log).

import { getCatalogId } from "@/lib/catalogId";
import { htmlToPlainText } from "@/lib/htmlToPlainText";

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

// 🔥 تحويل حالة المخزون لصيغة TikTok — دالة مستقلة عن getMetaAvailability
// في lib/inventoryHelpers.js (نفس المنطق العام: Fail-Closed لأي حالة غير
// معروفة، لكن مكتوبة من الصفر هنا، بلا استيراد).
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
        // 🔥 description من بيانات المنتج الموجودة بالفعل في Firestore —
        // نفس المصدر ونفس الـ fallback المستخدَمين في fb-catalog/route.js
        // (description المنتج، وإلا seo.description)، بلا اختراع أي نص.
        const seoDescription = rawFields["seo"]?.mapValue?.fields?.description?.stringValue ?? "";
        const rawDescription = f("description") || seoDescription || "";
        const cleanDescription = htmlToPlainText(rawDescription);
        const price = parseFloat(f("price")) || 0;
        const images = rawFields["images"]?.arrayValue?.values?.map((v) => v.stringValue ?? "").filter(Boolean) ?? [];
        const colorSwatches = fMap("colorSwatches");
        const variants = fArrMaps("variants");

        const colorsSeen = new Set();
        for (const v of variants) {
          const colorValue = v.color?.stringValue ?? "";
          const colorKey = colorValue.trim().toLowerCase();
          if (colorValue && colorsSeen.has(colorKey)) continue;
          if (colorValue) colorsSeen.add(colorKey);

          const inventoryStatus = v.inventoryStatus?.stringValue;
          const image = (colorValue && colorSwatches[colorValue]) || images[0] || "";

          rows.push({
            // 🔥 نفس getCatalogId المستخدَمة في fb-catalog/route.js وفي كل
            // أحداث ttTrack (content_id) — sku_id هنا = نفس القيمة بالضبط.
            sku_id: getCatalogId(handle, colorValue),
            item_group_id: handle,
            title,
            description: cleanDescription,
            color: colorValue || undefined,
            availability: ttAvailability(inventoryStatus),
            condition: "new",
            price: `${price.toFixed(2)} EGP`,
            link: colorValue
              ? `${SITE_URL}/products/${handle}?color=${encodeURIComponent(colorValue)}`
              : `${SITE_URL}/products/${handle}`,
            image_link: image,
            brand: BRAND,
          });
        }

        // منتج بلا variants ألوان على الإطلاق → عنصر واحد بلا لون
        if (variants.length === 0) {
          rows.push({
            sku_id: getCatalogId(handle, ""),
            item_group_id: handle,
            title,
            description: cleanDescription,
            availability: "in stock",
            condition: "new",
            price: `${price.toFixed(2)} EGP`,
            link: `${SITE_URL}/products/${handle}`,
            image_link: images[0] || "",
            brand: BRAND,
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
      <g:availability>${escapeXml(r.availability)}</g:availability>
      <g:condition>${escapeXml(r.condition)}</g:condition>
      <g:price>${escapeXml(r.price)}</g:price>
      <g:link>${escapeXml(r.link)}</g:link>
      <g:image_link>${escapeXml(r.image_link)}</g:image_link>
      <g:brand>${escapeXml(r.brand)}</g:brand>
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
