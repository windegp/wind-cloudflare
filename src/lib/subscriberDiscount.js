// Subscriber discount: configured in admin (settings/siteSettings -> promotions.subscriberDiscount).
// Pure helpers shared by the server quote and the client cart so both compute the same amount.

export const DEFAULT_NEWSLETTER_TITLE = "اشترك واحصل على خصم 10%";
export const DEFAULT_NEWSLETTER_SUBTITLE = "على أول طلب";

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
