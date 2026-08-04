// app/api/fb-catalog/route.js
import { NextResponse } from "next/server";
import { getKV } from "@/lib/kv-cache"; 
import { getMetaAvailability } from "@/lib/inventoryHelpers";
import { getCatalogId, slugifyColor } from "@/lib/catalogId";
import { GENERIC_COLLECTIONS } from "@/lib/constants";
import { htmlToPlainText } from "@/lib/htmlToPlainText";
import { getGoogleProductCategory } from "@/lib/productTaxonomy";

const SITE_URL = "https://windeg.com";
const BRAND = "WIND Shopping";
const CURRENCY = "EGP";
// 🌟 تم تغيير المفتاح هنا لكسر الكاش القديم تماماً وإجبار السيرفر على التحديث
const KV_KEY = "fb_catalog_xml_v8";

// اجبار Next.js على عدم كاش الـ Route نفسه في Vercel
export const dynamic = 'force-dynamic';

// -------- helpers --------

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

// طبقة عرض فقط — لا تُستخدَم في توليد أي ID (getCatalogId يعتمد على colorValue
// الخام عبر slugifyColor في lib/catalogId.js، وليس على هذه الخريطة إطلاقًا)،
// لذلك صفر تأثير على g:id / item_group_id / content_ids. الهدف الوحيد هنا:
// توحيد التهجئة الأمريكية والبريطانية لنفس اللون عند اختيار التسمية المعروضة
// في g:color، بدون لمس slugifyColor أو أي منطق IDs.
const COLOR_LABEL_ALIASES = {
  gray: "grey",
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
          categories: fArr("categories"), // 🔥 المصدر الموثوق — مزامَن مع collections وصفحات العرض، بعكس selectedCollections الذي قد يكون فاضياً لمنتجات قديمة
                    productType: f("productType"),
          gender: f("gender"),
          ageGroup: f("ageGroup"),
          material: f("material"),
          pattern: f("pattern"),
          variants: fArrMaps("variants"),
          seoDescription: rawFields["seo"]?.mapValue?.fields?.description?.stringValue ?? "",
        };

        const productUrl = `${SITE_URL}/products/${handle}`;
        const baseTitle = p.title ?? "";
        const rawDescription = p.description || p.seoDescription || "";
        const cleanDescription = escapeXml(htmlToPlainText(rawDescription));
        const basePrice = p.price ?? "0";
        const compareAtPrice = p.compareAtPrice ?? "";
        const images = Array.isArray(p.images) ? p.images : [];
        const colorSwatches = p.colorSwatches ?? {};
        // 🔥 المصدر الأساسي categories (موثوق ومتزامن)، مع fallback لـ selectedCollections القديم
        // لأي منتج نادر لم يُحدَّث بعد — يضمن عدم رجوع قيم فاضية تماماً
        const sourceCollections =
          (p.categories && p.categories.length > 0) ? p.categories : p.selectedCollections;

        // 🔥 توحيد المصدر: googleCategory لم يعد يُحسَب هنا بمنطق مستقل —
        // يُحسَب الآن (بعد تعريف productType أدناه) عبر getGoogleProductCategory()
        // من lib/productTaxonomy.js، نفس المصدر المستخدَم في tiktok-catalog/route.js.
        // لا تغيير على sourceCollections/meaningfulCollections/productType نفسها.
        
        // 🌟 الأقسام العامة دي مش مفيدة كفلتر Set في فيسبوك (موجودة في كل المنتجات تقريباً)
        // فبنستبعدها من الـ product_type/custom_labels، مع استبعاد نسخ السلاش المكررة "/slug"
        // 🔥 Phase 7: GENERIC_COLLECTIONS مستوردة الآن من @/lib/constants (مصدر
        // مشترك مع Admin Product Type Dropdown) — لم تعد مُعرَّفة محلياً هنا.
        const meaningfulCollections = Array.from(
          new Set(
            sourceCollections
              .map((c) => c.replace(/^\//, "").trim()) // إزالة السلاش البادئ لتوحيد القيم المكررة
              .filter((c) => c && !c.includes(">") && !GENERIC_COLLECTIONS.has(c))
          )
        );

        // 🌟 كل الأقسام الحقيقية: أول قسم في product_type، والباقي في custom_label_0..4
        // ده بيخلي Meta تقدر تعمل Set بناءً على أي قسم منهم وقت اختيار "Filter by product_type/custom_label"
        // 🌟 Phase 7: product_type يُقرأ الآن من الحقل المخصص productType أولاً —
        // مستقل تماماً عن ترتيب Collections (المشكلة الأصلية التي أثبتها Phase 6:
        // كان يعتمد على meaningfulCollections[0]، أي ترتيب نقر الأدمن على الأقسام).
        // الـ fallback القديم يبقى فقط للمنتجات الموجودة (~70) التي لم تُراجَع يدوياً
        // بعد — بدون أي Migration تلقائي، تماماً كما طُلب. أي منتج جديد أو مُعدَّل
        // سيحمل productType دائماً (إلزامي في الأدمن)، فلن يحتاج الـ fallback إطلاقاً.
        const productType = p.productType
          ? p.productType.replace(/-/g, " ")
          : (meaningfulCollections.length > 0
              ? meaningfulCollections[0].replace(/-/g, " ")
              : "WIND Collection");
        // 🔥 نفس المصدر الموحَّد المستخدَم في tiktok-catalog/route.js — يمرَّر
        // productType الخام (بلا استبدال الشرطات بمسافات) لأن مفاتيح
        // PRODUCT_TAXONOMY نفسها بصيغة slug (بشرطات)، تماماً كما في TikTok.
        const googleCategory = getGoogleProductCategory(p.productType || "");
        // 🌟 Collections تُصدَّر بالكامل ومستقلة تماماً الآن في custom_label_0..4 —
        // لم تعد تفقد أول عنصر لصالح product_type (كان ده سلوك النظام القديم
        // فقط، طالما product_type أصبح مصدره منفصل تماماً الآن).
        const customLabels = meaningfulCollections.slice(0, 5).map((c) => c.replace(/-/g, " "));
        while (customLabels.length < 5) customLabels.push(""); // تفريغ الباقي لو الأقسام أقل من 5
        const customLabelsXml = customLabels
          .map((label, i) => `<g:custom_label_${i}>${escapeXml(label)}</g:custom_label_${i}>`)
          .join("\n        ");
        
        const variants = Array.isArray(p.variants) ? p.variants : [];

        // ── قراءة أسماء الخيارات على مستوى المنتج (للـ fallback) ──────────
        // الأولوية: option1Name/option2Name داخل كل variant
        // الـ Fallback: options[] على مستوى المنتج
        const productOptions = fArrMaps("options");
        // productOptions = [{name:{stringValue:"لون"}, values:{stringValue:"red,blue"}}, ...]

        // ── دوال الكشف (متطابقة مع admin/products/create) ──────────────
        const isColorOptName = (name = "") => {
          const n = name.toLowerCase().trim();
          return n.includes("color") || n.includes("colour") ||
                 n.includes("لون")   || n.includes("الوان");
        };
        const isSizeOptName  = (name = "") => {
          const n = name.toLowerCase().trim();
          return n.includes("size") || n.includes("مقاس") || n.includes("حجم");
        };

        // ── تحديد طبيعة الـ options من مستوى المنتج ──────────────────────
        // نستخدم هذا للـ fallback عندما لا يحمل الـ variant اسم الخيار
        let productColorOptIndex = -1; // 1 أو 2
        let productSizeOptIndex  = -1;
        for (const opt of productOptions) {
          const optName = opt["name"]?.stringValue ?? "";
          if (isColorOptName(optName)) {
            // نحدد هل هو في option1 أم option2 بناءً على ترتيبه في المصفوفة
            productColorOptIndex = productOptions.indexOf(opt) === 0 ? 1 : 2;
          } else if (isSizeOptName(optName)) {
            productSizeOptIndex  = productOptions.indexOf(opt) === 0 ? 1 : 2;
          }
        }

        // ── دالة قراءة قيمة الخيار من variant باستخدام اسمه ──────────────
        // تقرأ option1Name/option2Name من الـ variant ذاته أولاً،
        // ثم تتراجع لـ productColorOptIndex / productSizeOptIndex
        const getVariantColorValue = (v) => {
          const n1 = v["option1Name"]?.stringValue ?? "";
          const n2 = v["option2Name"]?.stringValue ?? "";
          if (isColorOptName(n1)) return v["option1Value"]?.stringValue ?? "";
          if (isColorOptName(n2)) return v["option2Value"]?.stringValue ?? "";
          // fallback: استخدم الترتيب المحدد من options المنتج
          if (productColorOptIndex === 1) return v["option1Value"]?.stringValue ?? "";
          if (productColorOptIndex === 2) return v["option2Value"]?.stringValue ?? "";
          return "";
        };

        const getVariantSizeValue  = (v) => {
          const n1 = v["option1Name"]?.stringValue ?? "";
          const n2 = v["option2Name"]?.stringValue ?? "";
          if (isSizeOptName(n1)) return v["option1Value"]?.stringValue ?? "";
          if (isSizeOptName(n2)) return v["option2Value"]?.stringValue ?? "";
          // fallback
          if (productSizeOptIndex === 1) return v["option1Value"]?.stringValue ?? "";
          if (productSizeOptIndex === 2) return v["option2Value"]?.stringValue ?? "";
          return "";
        };

        // ── هل المنتج عنده ألوان أو مقاسات فعلاً؟ ───────────────────────
        const productHasColors = variants.some(v => getVariantColorValue(v) !== "");
        const productHasSizes  = variants.some(v => getVariantSizeValue(v)  !== "");

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
          ? `<g:price>${parseFloat(compareAtPrice).toFixed(2)} ${CURRENCY}</g:price>\n       <g:sale_price>${parseFloat(basePrice).toFixed(2)} ${CURRENCY}</g:sale_price>`
          : `<g:price>${parseFloat(basePrice).toFixed(2)} ${CURRENCY}</g:price>`}
        <g:brand>${BRAND}</g:brand>
                <g:condition>new</g:condition>
        ${p.gender ? `<g:gender>${escapeXml(p.gender)}</g:gender>` : ""}
        ${p.ageGroup ? `<g:age_group>${escapeXml(p.ageGroup)}</g:age_group>` : ""}
        ${p.material ? `<g:material>${escapeXml(p.material)}</g:material>` : ""}
        ${p.pattern ? `<g:pattern>${escapeXml(p.pattern)}</g:pattern>` : ""}
        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
        <g:product_type>${escapeXml(productType)}</g:product_type>
        ${customLabelsXml}
      </item>`);
          continue;
        }

        // ── السيناريو: variants موجودة لكن لا لون ولا مقاس مُعرَّف ─────────
        // Data Issue: بيانات غير مكتملة في Firestore (options مفقودة أو بدون أسماء معروفة)
        // → نتعامل مع المنتج كمنتج بدون variants (item واحد)
        if (!productHasColors && !productHasSizes) {
          // تحذير خفيف فقط (مرة واحدة لكل منتج، بدون أي تأثير على الأداء أو الـ XML):
          // يساعد على اكتشاف منتجات بأسماء options غير معروفة (مثل "نوع القماش")
          // بدل اكتشاف المشكلة لاحقاً من خلال انخفاض جودة الكتالوج في Meta
          const unrecognizedOptionNames = productOptions
            .map(o => o["name"]?.stringValue)
            .filter(Boolean);
          console.warn(
            `[fb-catalog] DATA ISSUE — منتج "${handle}" عنده ${variants.length} variant(s) ` +
            `لكن لا يوجد خيار لون أو مقاس معروف. ` +
            `أسماء الـ options الموجودة: ${unrecognizedOptionNames.length > 0 ? unrecognizedOptionNames.join(", ") : "(غير محددة)"}. ` +
            `تم التعامل معه كمنتج بدون variants (item واحد). ` +
            `الحل: أضف اسم واضح للـ option في صفحة تعديل المنتج (مثل "لون" أو "مقاس").`
          );

          const mainImage = images[0] ?? "";
          if (!mainImage) continue;
          // 🔥 Legacy Audit Fix: هذا المنتج عنده variants فعلياً — القرار لازم يعتمد
          // على inventoryStatus لكل variant (Golden Rule)، وليس product.quantity/sellOutOfStock
          // حتى لو أسماء الـ options غير معروفة (لون/مقاس). نعتبره "in stock" لو أي variant
          // منه قابل للشراء فعلياً.
          const anyVariantAvailable = variants.some((sv) => {
            const a = getMetaAvailability(sv["inventoryStatus"]?.stringValue);
            return a === "in stock" || a === "preorder";
          });
          const availability = anyVariantAvailable ? "in stock" : "out of stock";
          const hasSale = compareAtPrice && parseFloat(compareAtPrice) > parseFloat(basePrice);
          items.push(`<item>
        <g:id>${escapeXml(handle)}</g:id>
        <g:title>${escapeXml(baseTitle)}</g:title>
        <g:description>${cleanDescription}</g:description>
        <g:link>${productUrl}</g:link>
        <g:image_link>${escapeXml(mainImage)}</g:image_link>
        ${images.slice(1, 10).map(img => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n       ")}
        <g:availability>${availability}</g:availability>
        ${hasSale
          ? `<g:price>${parseFloat(compareAtPrice).toFixed(2)} ${CURRENCY}</g:price>\n       <g:sale_price>${parseFloat(basePrice).toFixed(2)} ${CURRENCY}</g:sale_price>`
          : `<g:price>${parseFloat(basePrice).toFixed(2)} ${CURRENCY}</g:price>`}
        <g:brand>${BRAND}</g:brand>
                <g:condition>new</g:condition>
        ${p.gender ? `<g:gender>${escapeXml(p.gender)}</g:gender>` : ""}
        ${p.ageGroup ? `<g:age_group>${escapeXml(p.ageGroup)}</g:age_group>` : ""}
        ${p.material ? `<g:material>${escapeXml(p.material)}</g:material>` : ""}
        ${p.pattern ? `<g:pattern>${escapeXml(p.pattern)}</g:pattern>` : ""}
        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
        <g:product_type>${escapeXml(productType)}</g:product_type>
        ${customLabelsXml}
      </item>`);
          continue;
        }

        // ── السيناريو B: مقاس فقط (بدون ألوان) ───────────────────────────
        // item واحد للمنتج + g:size بالمقاسات المتاحة (in stock)
        if (!productHasColors && productHasSizes) {
          const mainImage = images[0] ?? "";
          if (!mainImage) continue;

          // Phase 6: availability من inventoryStatus — Golden Rule, لا fallback لـ quantity
          const availableSizes = [...new Set(
            variants
              .filter(v => {
                const metaAvail = getMetaAvailability(v["inventoryStatus"]?.stringValue);
                return metaAvail === "in stock" || metaAvail === "preorder";
              })
              .map(v => getVariantSizeValue(v))
              .filter(Boolean)
          )];

          const anyInStock = variants.some(v => {
            const metaAvail = getMetaAvailability(v["inventoryStatus"]?.stringValue);
            return metaAvail === "in stock" || metaAvail === "preorder";
          });
          const availability = anyInStock ? "in stock" : "out of stock";

          const firstV   = variants[0] ?? {};
          const vPrice   = firstV["price"]?.stringValue ?? basePrice;
          const vCompare = firstV["compareAtPrice"]?.stringValue ?? compareAtPrice;
          const hasSale  = vCompare && parseFloat(vCompare) > parseFloat(vPrice);

          items.push(`<item>
        <g:id>${escapeXml(handle)}</g:id>
        <g:title>${escapeXml(baseTitle)}</g:title>
        <g:description>${cleanDescription}</g:description>
        <g:link>${productUrl}</g:link>
        <g:image_link>${escapeXml(mainImage)}</g:image_link>
        ${images.slice(1, 10).map(img => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n       ")}
        <g:availability>${availability}</g:availability>
        ${hasSale
          ? `<g:price>${parseFloat(vCompare).toFixed(2)} ${CURRENCY}</g:price>\n       <g:sale_price>${parseFloat(vPrice).toFixed(2)} ${CURRENCY}</g:sale_price>`
          : `<g:price>${parseFloat(vPrice).toFixed(2)} ${CURRENCY}</g:price>`}
        <g:brand>${BRAND}</g:brand>
                <g:condition>new</g:condition>
        ${p.gender ? `<g:gender>${escapeXml(p.gender)}</g:gender>` : ""}
        ${p.ageGroup ? `<g:age_group>${escapeXml(p.ageGroup)}</g:age_group>` : ""}
        ${p.material ? `<g:material>${escapeXml(p.material)}</g:material>` : ""}
        ${p.pattern ? `<g:pattern>${escapeXml(p.pattern)}</g:pattern>` : ""}
        ${availableSizes.length > 0 ? `<g:size>${escapeXml(availableSizes.join(", "))}</g:size>` : ""}
        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
        <g:product_type>${escapeXml(productType)}</g:product_type>
        ${customLabelsXml}
      </item>`);
          continue;
        }

        // ── السيناريو A و C: لون (مع أو بدون مقاس) ─────────────────────
        // item واحد لكل لون فريد
        // + g:size يجمع المقاسات المتاحة لهذا اللون (فقط لو productHasSizes)
        const seenColors = new Set();

        for (const v of variants) {
          if (!v) continue;

          const colorValue = getVariantColorValue(v);
          const colorKey   = slugifyColor(colorValue);

          if (seenColors.has(colorKey)) continue;
          seenColors.add(colorKey);

          // اجمع المقاسات المتاحة لهذا اللون بالذبط
          let sizesForThisColor = [];
          if (productHasSizes) {
            // Phase 6: مقاسات متاحة لهذا اللون — من inventoryStatus فقط
            sizesForThisColor = [...new Set(
              variants
                .filter(sv => {
                  const svColor = slugifyColor(getVariantColorValue(sv));
                  const metaAvail = getMetaAvailability(sv["inventoryStatus"]?.stringValue);
                  return svColor === colorKey && (metaAvail === "in stock" || metaAvail === "preorder");
                })
                .map(sv => getVariantSizeValue(sv))
                .filter(Boolean)
            )];
          }

          const variantPrice   = v["price"]?.stringValue ?? basePrice;
          const variantCompare = v["compareAtPrice"]?.stringValue ?? compareAtPrice;

          // Phase 6: availability لهذا اللون — من inventoryStatus فقط (Golden Rule)
          const anyColorInStock = variants.some(sv => {
            const svColor = slugifyColor(getVariantColorValue(sv));
            const metaAvail = getMetaAvailability(sv["inventoryStatus"]?.stringValue);
            return svColor === colorKey && (metaAvail === "in stock" || metaAvail === "preorder");
          });
          const availability = anyColorInStock ? "in stock" : "out of stock";

          const variantImage = colorSwatches[colorKey] ?? colorSwatches[colorValue] ?? images[0] ?? "";
          if (!variantImage) continue;

          const normalizedColorKey = COLOR_LABEL_ALIASES[colorKey] ?? colorKey;
          const colorLabel  = colorLabels[normalizedColorKey] ?? colorLabels[colorValue] ?? colorValue;
          // 🔥 لا استثناء لـ"أول لون" بعد الآن — كل لون، بما فيه الأول،
          // يحصل على id فريد عبر getCatalogId (المصدر الموحّد). هذا يمنع
          // بنيوياً تطابق أي g:id مع أي item_group_id (الذي يبقى = handle
          // الخام دائماً، وهو قيمة لا يعود يُنتجها getCatalogId أبداً طالما
          // colorValue غير فاضٍ).
          // ⚠️ getCatalogId يعتمد على colorValue الخام (وليس على colorLabel/
          // normalizedColorKey أعلاه) — تعديل التسمية المعروضة هنا لا يغيّر
          // ولا يُقرَّب من أي g:id/item_group_id/content_ids حالية.
          const itemId      = getCatalogId(handle, colorValue);
          // g:title = اسم المنتج الأساسي فقط (بدون لون) — اللون يبقى فقط في
          // g:color أدناه. هذا التغيير المقصود الوحيد على شكل g:title.
          const itemTitle   = baseTitle;
          const extraImages = images.filter(img => img !== variantImage).slice(0, 9);
          const hasSale     = variantCompare && parseFloat(variantCompare) > parseFloat(variantPrice);

          items.push(`<item>
        <g:id>${escapeXml(itemId)}</g:id>
        <g:item_group_id>${escapeXml(handle)}</g:item_group_id>
        <g:title>${escapeXml(itemTitle)}</g:title>
        <g:description>${cleanDescription}</g:description>
        <g:link>${productUrl}?color=${encodeURIComponent(colorValue)}</g:link>
        <g:image_link>${escapeXml(variantImage)}</g:image_link>
        ${extraImages.map(img => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n       ")}
        <g:availability>${availability}</g:availability>
        ${hasSale
          ? `<g:price>${parseFloat(variantCompare).toFixed(2)} ${CURRENCY}</g:price>\n       <g:sale_price>${parseFloat(variantPrice).toFixed(2)} ${CURRENCY}</g:sale_price>`
          : `<g:price>${parseFloat(variantPrice).toFixed(2)} ${CURRENCY}</g:price>`}
        <g:brand>${BRAND}</g:brand>
                <g:condition>new</g:condition>
        ${p.gender ? `<g:gender>${escapeXml(p.gender)}</g:gender>` : ""}
        ${p.ageGroup ? `<g:age_group>${escapeXml(p.ageGroup)}</g:age_group>` : ""}
        ${p.material ? `<g:material>${escapeXml(p.material)}</g:material>` : ""}
        ${p.pattern ? `<g:pattern>${escapeXml(p.pattern)}</g:pattern>` : ""}
        <g:color>${escapeXml(colorLabel)}</g:color>
        ${sizesForThisColor.length > 0 ? `<g:size>${escapeXml(sizesForThisColor.join(", "))}</g:size>` : ""}
        <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>
        <g:product_type>${escapeXml(productType)}</g:product_type>
        ${customLabelsXml}
      </item>`);
        }
      }
    }

    const xml = buildXml(items);

    if (kv) {
      // TTL 86400 (24h) كشبكة أمان — لا يوجد Cron Job أو Scheduled Worker
      // لتحديث الكتالوج. في الظروف الطبيعية، يتم مسح الكاش عبر
      // /api/revalidate عند تعديل/إضافة/حذف أي منتج.
      // الـ TTL هنا يضمن عدم بقاء الكاش عالقاً لأكثر من 24 ساعة
      // في حال فشلت آلية الـ invalidation لأي سبب.
      await kv.put(KV_KEY, xml, { expirationTtl: 86400 });
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