// Subscriber discount: configured in admin (settings/siteSettings -> promotions.subscriberDiscount).
// Pure helpers shared by the server quote and the client cart so both compute the same amount.

export const DEFAULT_NEWSLETTER_TITLE = "اشترك واحصل على خصم 10%";
export const DEFAULT_NEWSLETTER_SUBTITLE = "على أول طلب";
// لما خصم المشتركين يكون متوقف، الفوتر بيعرض سطر عام بدل نص الخصم.
export const GENERIC_NEWSLETTER_TITLE = "اشترك ليصلك أحدث العروض";
export const GENERIC_NEWSLETTER_SUBTITLE = "";

/** Footer newsletter text: discount copy (editable) when the discount is on, generic line when off. */
export function resolveNewsletterText(promotions) {
  const promos = promotions || {};
  const enabled = normalizeSubscriberSettings(promos.subscriberDiscount).enabled;
  if (!enabled) {
    return { title: GENERIC_NEWSLETTER_TITLE, subtitle: GENERIC_NEWSLETTER_SUBTITLE, discountOn: false };
  }
  return {
    title: String(promos.newsletterTitle || "").trim() || DEFAULT_NEWSLETTER_TITLE,
    subtitle: String(promos.newsletterSubtitle ?? "").trim() || DEFAULT_NEWSLETTER_SUBTITLE,
    discountOn: true,
  };
}

/** Normalizes whatever is stored in settings. Disabled unless explicitly enabled with a valid value. */
export function normalizeSubscriberSettings(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const type = cfg.type === "fixed" ? "fixed" : "percent";
  const value = Number(cfg.value);
  const valid =
    Number.isFinite(value) && value > 0 && (type === "fixed" || value <= 100);
  return {
    enabled: cfg.enabled === true && valid,
    name: String(cfg.name || "خصم المشتركين").trim().slice(0, 60) || "خصم المشتركين",
    type,
    value: valid ? value : 0,
    firstOrderOnly: cfg.firstOrderOnly !== false, // default: first order only
  };
}

/** Discount in EGP for a paid subtotal. Never exceeds the subtotal. */
export function computeSubscriberDiscountAmount(cfg, subtotal) {
  const s = Math.max(0, Number(subtotal) || 0);
  if (!cfg || !(Number(cfg.value) > 0) || s <= 0) return 0;
  const amount = cfg.type === "fixed" ? Number(cfg.value) : Math.round((s * Number(cfg.value)) / 100);
  return Math.min(s, Math.max(0, amount));
}

/**
 * Display-only: decides what the checkout summary shows after a live quote.
 * The submit-time quote stays authoritative; this never changes what is charged.
 * `lines` are the discount rows (a code and an automatic discount are shown separately).
 */
export function resolveLiveSubscriberDisplay({ liveQuote, subtotal, discount, discountLabel, total, promoLabel, clientLines }) {
  const defaultLines = clientLines || [{ label: discountLabel, amount: discount }];
  const hasSubscriber =
    liveQuote?.discountSource === "subscriber" || liveQuote?.stackedDiscount?.source === "subscriber";
  const applies =
    hasSubscriber &&
    Math.abs(Number(liveQuote.subtotal) - Number(subtotal)) < 0.01 &&
    Number(liveQuote.discount) > Number(discount);
  if (!applies) {
    return { applies: false, discount, label: discountLabel, total, lines: defaultLines };
  }
  const stacked = liveQuote.stackedDiscount;
  const lines = liveQuote.discountSource === "promo" && stacked
    ? [
        { label: promoLabel || "خصم الكود", amount: Number(liveQuote.promoDiscountAmount) || 0 },
        { label: stacked.label, amount: Number(stacked.amount) || 0 },
      ]
    : [{ label: liveQuote.subscriberDiscount?.name || "خصم المشتركين", amount: Number(liveQuote.discount) }];
  return {
    applies: true,
    discount: Number(liveQuote.discount),
    label: lines[0].label,
    total: Number(liveQuote.total),
    lines,
  };
}
