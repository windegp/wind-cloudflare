// ============================================
// WIND Product Taxonomy
//
// Separates commerce taxonomy from WIND's marketing Collections.
// Collections answer: "Where should this product appear on WIND?"
// Taxonomy answers: "What kind of product is this for commerce/catalog feeds?"
//
// This module is additive and does not modify existing Firestore product data.
// ============================================

const GOOGLE_APPAREL = "Apparel & Accessories > Clothing";

// Keep legacy WIND productType slugs working while giving feeds a real,
// standardized Google Product Category value.
export const PRODUCT_TAXONOMY = {
  "mens-pants": {
    label: "بنطلونات",
    googleProductCategory: "Apparel & Accessories > Clothing > Pants",
  },
  "womens-pants": {
    label: "بنطلونات نسائية",
    googleProductCategory: "Apparel & Accessories > Clothing > Pants",
  },
  "pants": {
    label: "بنطلونات",
    googleProductCategory: "Apparel & Accessories > Clothing > Pants",
  },
  "trousers": {
    label: "بنطلونات",
    googleProductCategory: "Apparel & Accessories > Clothing > Pants > Trousers",
  },
  "t-shirts": {
    label: "تيشيرتات",
    googleProductCategory: "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts",
  },
  "shirts": {
    label: "قمصان",
    googleProductCategory: "Apparel & Accessories > Clothing > Clothing Tops > Shirts",
  },
  "hoodies": {
    label: "هوديز",
    googleProductCategory: "Apparel & Accessories > Clothing > Clothing Tops > Hoodies",
  },
  "sweatshirts": {
    label: "سويت شيرت",
    googleProductCategory: "Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts",
  },
  "jackets": {
    label: "جاكيتات",
    googleProductCategory: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
  },
  "coats": {
    label: "معاطف",
    googleProductCategory: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
  },
  "dresses": {
    label: "فساتين",
    googleProductCategory: "Apparel & Accessories > Clothing > Dresses",
  },
  "skirts": {
    label: "تنانير",
    googleProductCategory: "Apparel & Accessories > Clothing > Skirts",
  },
  "sets": {
    label: "أطقم",
    googleProductCategory: "Apparel & Accessories > Clothing > Outfit Sets",
  },
  "shawls": {
    label: "شالات",
    googleProductCategory: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  },
  "womens-shawls": {
    label: "شالات نسائية",
    googleProductCategory: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  },
  "scarves": {
    label: "أوشحة",
    googleProductCategory: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  },
  "knitwear": {
    label: "ملابس تريكو",
    googleProductCategory: GOOGLE_APPAREL,
  },
  "sweatshirt": {
    label: "سويت شيرت",
    googleProductCategory: "Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts",
  },
  "hoodie": {
    label: "هودي",
    googleProductCategory: "Apparel & Accessories > Clothing > Clothing Tops > Hoodies",
  },
};

export function getGoogleProductCategory(productType) {
  const key = String(productType ?? "").trim().toLowerCase();
  return PRODUCT_TAXONOMY[key]?.googleProductCategory || GOOGLE_APPAREL;
}
