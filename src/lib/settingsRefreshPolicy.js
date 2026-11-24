// Fresh promotion settings (bypassing the KV cache) are only needed where a
// customer sees prices: the checkout. Other pages use the cached settings.
export function shouldRefreshSettingsOnPath(pathname) {
  return typeof pathname === "string" &&
    (pathname === "/checkout" || pathname.startsWith("/checkout/"));
}
