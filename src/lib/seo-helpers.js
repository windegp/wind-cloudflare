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
