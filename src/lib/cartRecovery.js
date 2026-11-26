// استرجاع السلة المتروكة بتوكن سري: ثوابت ودوال نقية مشتركة بين العميل والسيرفر.
// ممنوع استيراد أي وحدة سيرفر هنا (الملف بيتحقّق منه مكوّنات العميل).

// مدة تكريم أسعار وعروض اللقطة: ٧٢ ساعة من آخر نشاط على السلة.
export const RECOVERY_WINDOW_MS = 72 * 60 * 60 * 1000;
// العمر الكلي للينك: بعدها اللينك نفسه يتوقف حتى لو السلة لسه موجودة.
export const RECOVERY_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const CART_RECOVERY_COLLECTION = "WindCartRecovery";
export const CART_RECOVERY_ORDER_COLLECTION = "WindCartRecoveryOrders";

const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRecoveryToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token.trim());
}

// هوية سطر المنتج: نفس المنتج بنفس المقاس واللون والكمية.
export function recoveryLineKey(item) {
  return [
    String(item?.id ?? item?.productId ?? ""),
    String(item?.selectedSize || ""),
    String(item?.selectedColor || ""),
    Number(item?.qty ?? item?.quantity) || 0,
  ].join("|");
}

function countLines(list) {
  const counts = new Map();
  for (const item of list) {
    const key = recoveryLineKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// السلة الحالية مطابقة للقطة؟ أي إضافة/حذف/تغيير كمية يكسر التطابق
// ويرجّع التسعير الحالي تلقائياً.
export function cartMatchesRecoveryItems(cartItems, snapshotItems) {
  if (!Array.isArray(cartItems) || !Array.isArray(snapshotItems)) return false;
  if (cartItems.length === 0 || cartItems.length !== snapshotItems.length) return false;
  const current = countLines(cartItems);
  const snapshot = countLines(snapshotItems);
  if (current.size !== snapshot.size) return false;
  for (const [key, count] of current) {
    if (snapshot.get(key) !== count) return false;
  }
  return true;
}

function giftSelectionKey(selection) {
  return [
    String(selection?.selectionId || ""),
    String(selection?.productId || selection?.id || ""),
    String(selection?.selectedColor || ""),
    String(selection?.selectedSize || ""),
  ].join("|");
}

export function giftSelectionsMatch(inputSelections, snapshotSelections) {
  const current = Array.isArray(inputSelections) ? inputSelections : [];
  const snapshot = Array.isArray(snapshotSelections) ? snapshotSelections : [];
  if (current.length !== snapshot.length) return false;
  const currentKeys = current.map(giftSelectionKey).sort();
  const snapshotKeys = snapshot.map(giftSelectionKey).sort();
  return currentKeys.every((key, index) => key === snapshotKeys[index]);
}

// اللقطة لسه في شباك الـ ٧٢ ساعة؟
export function isRecoveryActive(recovery, now = Date.now()) {
  return (
    Boolean(recovery) &&
    Number.isFinite(recovery.expiresAtMs) &&
    now <= recovery.expiresAtMs
  );
}

// اللينك نفسه لسه شغال؟ (أطول من شباك التكريم)
export function isRecoveryLinkAlive(recovery, now = Date.now()) {
  return (
    Boolean(recovery) &&
    Number.isFinite(recovery.anchorMs) &&
    now <= recovery.anchorMs + RECOVERY_LINK_TTL_MS
  );
}

// نسخة عامة من اللقطة ترجع للعميل: منتجات وملخص فقط، بدون أي بيانات عميل.
export function toPublicRecoveryCart(recovery, now = Date.now()) {
  const quote = recovery?.quote || {};
  const items = (Array.isArray(quote.cartItems) ? quote.cartItems : [])
    .slice(0, 50)
    .map((item) => ({
      id: String(item?.id || item?.productId || ""),
      name: String(item?.title || item?.name || "منتج").slice(0, 160),
      price: Number(item?.price) || 0,
      compareAtPrice: Number.isFinite(Number(item?.compareAtPrice))
        ? Number(item.compareAtPrice)
        : null,
      image: String(item?.image || "").slice(0, 300),
      selectedColor: String(item?.selectedColor || "").slice(0, 40),
      selectedSize: String(item?.selectedSize || "").slice(0, 40),
      qty: Math.max(1, Math.min(99, Number(item?.qty ?? item?.quantity) || 1)),
      ...(item?.bundleGroupId
        ? {
            bundleGroupId: String(item.bundleGroupId),
            bundleParentId: String(item?.bundleParentId || ""),
            bundleRole: String(item?.bundleRole || ""),
          }
        : {}),
    }))
    .filter((item) => item.id);

  const giftSelections = (
    Array.isArray(quote.customerChoiceGiftSelections)
      ? quote.customerChoiceGiftSelections
      : []
  )
    .slice(0, 20)
    .map((selection) => ({
      selectionId: String(selection?.selectionId || ""),
      id: String(selection?.id || selection?.productId || ""),
      productId: String(selection?.productId || selection?.id || ""),
      handle: String(selection?.handle || selection?.productHandle || ""),
      productHandle: String(selection?.productHandle || selection?.handle || ""),
      title: String(selection?.title || selection?.name || "").slice(0, 160),
      price: Number(selection?.price) || 0,
      image: String(selection?.image || "").slice(0, 300),
      selectedColor: String(selection?.selectedColor || "").slice(0, 40),
      selectedSize: String(selection?.selectedSize || "").slice(0, 40),
    }))
    .filter((selection) => selection.selectionId && selection.id);

  return {
    items,
    giftSelections,
    honored: isRecoveryActive(recovery, now),
    expiresAt: Number.isFinite(recovery?.expiresAtMs)
      ? new Date(recovery.expiresAtMs).toISOString()
      : null,
    total: Number(quote.total) || 0,
    offerName: quote.appliedOffer?.name ? String(quote.appliedOffer.name) : "",
    promoCode: quote.appliedPromo?.code ? String(quote.appliedPromo.code) : "",
  };
}
