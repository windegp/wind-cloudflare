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

export function getSWRNamespaceFromPath(pathname = '') {
  return pathname?.startsWith('/admin') ? 'admin' : 'public';
}

export function serializeSWRKey(key) {
  if (key === null || key === undefined) return null;
  if (typeof key === 'string') return key;
  if (Array.isArray(key)) return JSON.stringify(key);

  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

export function buildScopedSWRKey(key, pathname = '') {
  const namespace = getSWRNamespaceFromPath(pathname);
  if (key === null || key === undefined) return null;

  if (Array.isArray(key)) {
    const marker = `__ns:${namespace}`;
    const lastPart = key[key.length - 1];
    if (typeof lastPart === 'string' && lastPart.startsWith('__ns:')) return key;
    return [...key, marker];
  }

  const serialized = serializeSWRKey(key);
  if (!serialized) return null;
  if (serialized.startsWith('admin:') || serialized.startsWith('public:')) return serialized;
  return `${namespace}:${serialized}`;
}
