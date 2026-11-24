// Routes whose page component calls signalPageReady() itself (it waits for its own data).
// Every other storefront route is ready as soon as it renders, so the loader must not
// wait for a signal that never comes (it used to hang until the safety timeout).
export function routeSignalsReady(pathname) {
  if (typeof pathname !== "string") return false;
  return (
    pathname === "/" ||
    /^\/(products|collections|policies)\/[^/]+/.test(pathname) ||
    /^\/(thank-you|failure)(\/|$)/.test(pathname)
  );
}
