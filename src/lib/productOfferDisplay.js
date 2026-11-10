import { isOfferLive } from "@/lib/offerDates";

export function getProductDisplayOffers(product, offers, fallbackProductId = null) {
  if (!product || !Array.isArray(offers) || offers.length === 0) {
    return [];
  }

  const productKeys = new Set(
    [product.id, product.handle, fallbackProductId]
      .filter((value) => value !== undefined && value !== null && String(value).trim())
      .map(String)
  );

  return offers.filter((offer) => {
    if (!isOfferLive(offer)) return false;

    // Shipping offers are not product-specific display offers.
    if (offer.type === "free_shipping") return false;

    // Fixed coupons follow their configured product scope.
    if (offer.type === "coupon_fixed") {
      const excludedIds = new Set(
        Array.isArray(offer.excludedProductIds)
          ? offer.excludedProductIds.map(String)
          : []
      );

      if ([...productKeys].some((key) => excludedIds.has(key))) {
        return false;
      }

      if (offer.productScope === "selected") {
        const selectedIds = new Set(
          Array.isArray(offer.productIds)
            ? offer.productIds.map(String)
            : []
        );

        return [...productKeys].some((key) => selectedIds.has(key));
      }

      return true;
    }

    // Customer-choice gifts match purchase products.
    if (offer.type === "buy_x_get_y_select_gift") {
      const purchaseIds = new Set(
        Array.isArray(offer.purchaseProductIds)
          ? offer.purchaseProductIds.map(String)
          : []
      );

      return [...productKeys].some((key) => purchaseIds.has(key));
    }

    const excludedIds = new Set(
      Array.isArray(offer.excludedProductIds)
        ? offer.excludedProductIds.map(String)
        : []
    );

    if ([...productKeys].some((key) => excludedIds.has(key))) {
      return false;
    }

    if (offer.productScope === "selected") {
      const selectedIds = new Set(
        Array.isArray(offer.productIds)
          ? offer.productIds.map(String)
          : []
      );

      return [...productKeys].some((key) => selectedIds.has(key));
    }

    return true;
  });
}