// src/lib/seo-helpers.js
//
// دوال بناء JSON-LD بسيطة، بدون أي علاقة بـ Tracking/Pixel/CAPI/GA4/Catalog.
// الهدف فقط: تفادي تكرار نفس الـ schema في أكثر من مكان.

const SITE_URL = "https://windeg.com";

/**
 * Organization / OnlineStore JSON-LD — يُستخدم مرة واحدة فقط في Root Layout.
 * logoUrl: القيمة القادمة من settings.logoUrl مع fallback لـ /logo.png (نفس منطق Navbar).
 */
export function buildOrganizationJsonLd(settings) {
  const logo = settings?.logoUrl || `${SITE_URL}/logo.png`;
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "name": "WIND Shopping",
    "url": SITE_URL,
    "logo": logo,
  };
}

/**
 * WebSite JSON-LD — يُستخدم مرة واحدة فقط في Root Layout.
 */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "WIND Shopping",
    "url": SITE_URL,
  };
}

/**
 * OfferShippingDetails JSON-LD — يُستخدم داخل offers لصفحة المنتج.
 * ملاحظة مهمة: تكلفة الشحن تختلف فعلياً حسب المحافظة (shippingCostByGovernorate)،
 * وGoogle Search حالياً لا يدعم تمييز المحافظات المصرية عبر addressRegion (مدعوم فقط
 * لـ US/AU/JP حسب توثيق Google الرسمي) — لذلك نستخدم shippingRate.maxValue (بدل value)
 * لتمثيل أعلى تكلفة شحن فعلية موجودة، وهو الاستخدام الموثّق رسمياً من Google لهذه الحالة
 * بالتحديد (تكلفة متغيرة وليست رقماً ثابتاً واحداً)، مع addressCountry: "EG" فقط.
 * transitTime (٣-٥ أيام عمل) مطابق حرفياً للنص المعروض فعلياً في checkout/thank-you —
 * لا يوجد handlingTime لأنه غير موجود في أي مكان بالموقع فلا يُضاف.
 */
export function buildShippingDetailsJsonLd(settings) {
  const generalCost = settings?.promotions?.shippingCost ?? 70;
  const governorateRates = settings?.promotions?.shippingCostByGovernorate || {};

  const allRates = [generalCost, ...Object.values(governorateRates)]
    .map(Number)
    .filter((n) => !isNaN(n) && n >= 0);

  if (allRates.length === 0) return null;
  const maxRate = Math.max(...allRates);

  return {
    "@type": "OfferShippingDetails",
    "shippingRate": {
      "@type": "MonetaryAmount",
      "maxValue": maxRate,
      "currency": "EGP"
    },
    "shippingDestination": {
      "@type": "DefinedRegion",
      "addressCountry": "EG"
    },
    "deliveryTime": {
      "@type": "ShippingDeliveryTime",
      "transitTime": {
        "@type": "QuantitativeValue",
        "minValue": 3,
        "maxValue": 5,
        "unitCode": "DAY"
      }
    }
  };
}

/**
 * BreadcrumbList JSON-LD — items: [{ name, url }] بترتيب من الرئيسية للصفحة الحالية.
 */
export function buildBreadcrumbJsonLd(items = []) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url,
    })),
  };
}

