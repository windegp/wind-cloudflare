/** Cairo-local offer date helpers shared by the client and server offer evaluators. */
export function cairoDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** YYYY-MM-DD from a date string, null when absent, undefined when invalid. */
function dayOf(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return undefined;
}

/** An offer is live only when active === true and within its Cairo-local date range. */
export function isOfferLive(offer, now = new Date()) {
  if (!offer || offer.active !== true) return false;
  const start = dayOf(offer.startsAt);
  const end = dayOf(offer.endsAt);
  if (start === undefined || end === undefined) return false;
  const today = cairoDateString(now);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}
