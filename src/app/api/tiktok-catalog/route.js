// app/api/tiktok-catalog/route.js
//
// فيد منتجات مستقل تمامًا لـ TikTok Catalog — لا يعدّل ولا يعتمد على تعديل
// /api/fb-catalog/route.js إطلاقًا. نفس مصدر البيانات (Firestore → products)
// يُقرأ هنا من جديد (طلب Firestore REST مستقل)، وليس عبر استيراد أي كود من
// fb-catalog/route.js.
//
// الاستيراد الوحيد المشترك مع منظومة Meta: getCatalogId() — للقراءة فقط،
// كما صرَّح صاحب المشروع، لضمان أن Product ID الموحَّد نفسه يُستخدَم عبر كل
// المنصات الإعلانية لنفس المنتج (لا تعديل على catalogId.js إطلاقًا).
//
// ⚠️ الحقول هنا مبنية على معايير TikTok Product Feed العامة (sku_id,
// item_group_id, title, availability, condition, price, link, image_link,
// brand) — يُنصَح بمطابقتها مع متطلبات TikTok Catalog Manager الفعلية عند
// ربط هذا الفيد بالكتالوج المناسب يدويًا (لن يُنشَأ أو يُعدَّل أي Catalog
// من الكود).

import { getCatalogId } from "@/lib/catalogId";

const PROJECT_ID = "wind-reviews";
const BRAND = "WIND Shopping";

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
            sku_id: getCatalogId(handle, colorValue),
            item_group_id: handle,
            title,
            color: colorValue || undefined,
            availability: ttAvailability(inventoryStatus),
            condition: "new",
            price: `${price.toFixed(2)} EGP`,
            link: colorValue
              ? `https://windeg.com/products/${handle}?color=${encodeURIComponent(colorValue)}`
              : `https://windeg.com/products/${handle}`,
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
            availability: "in stock",
            condition: "new",
            price: `${price.toFixed(2)} EGP`,
            link: `https://windeg.com/products/${handle}`,
            image_link: images[0] || "",
            brand: BRAND,
          });
        }
      }
    }

    const itemsXml = rows
      .map(
        (r) => `  <item>
    <sku_id>${escapeXml(r.sku_id)}</sku_id>
    <item_group_id>${escapeXml(r.item_group_id)}</item_group_id>
    <title>${escapeXml(r.title)}</title>
    ${r.color ? `<color>${escapeXml(r.color)}</color>` : ""}
    <availability>${escapeXml(r.availability)}</availability>
    <condition>${escapeXml(r.condition)}</condition>
    <price>${escapeXml(r.price)}</price>
    <link>${escapeXml(r.link)}</link>
    <image_link>${escapeXml(r.image_link)}</image_link>
    <brand>${escapeXml(r.brand)}</brand>
  </item>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
${itemsXml}
</items>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return new Response(`<?xml version="1.0"?><error>${escapeXml(err.message)}</error>`, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}
