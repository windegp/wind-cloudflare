export const SWR_KEYS = {
  HOMEPAGE_DATA: 'homepage/data',
  HOMEPAGE_SECTIONS: 'homepage-products-sections',
  HOMEPAGE_REVIEWS: 'homepage-reviews',
  SITE_SETTINGS: 'settings/siteSettings',

  PRODUCT: (id) => (id ? `product-${id}` : null),
  RELATED: (id) => (id ? `related-${id}` : null),
  PRODUCT_STATS: (handle) => (handle ? `product-stats-${handle}` : null),
  PAGINATED_PRODUCTS: (categorySlug, cursor = 'start') => `paginated-products-${categorySlug}-${cursor}`,
  PAGINATED_REVIEWS: (productHandle, filter = 'all', cursor = 'start') =>
    productHandle ? `reviews-${productHandle}-${filter}-${cursor}` : null
};

