// علامة "طلب مكتمل" في sessionStorage: صفحة الشكر بتزرعها، وصفحة الشيك آوت
// بتستهلكها عشان زرار الرجوع من صفحة الشكر ما يودّيش العميل لصفحة شيك آوت
// فاضية ومربكة، وإنما يتحوّل للرئيسية. عرض/تنقّل فقط، مالها أي علاقة
// بإنشاء الطلب أو الدفع.
//
// العلامة بتتستهلك مرة واحدة وعمرها ١٠ دقايق: كده زيارة لاحقة عادية
// للشيك آوت بسلة فاضية (من غير طلب مكتمل قبلها على طول) مبتتحوّلش.

export const COMPLETED_ORDER_EXIT_KEY = "wind_checkout_completed_v1";
export const COMPLETED_ORDER_EXIT_MAX_AGE_MS = 10 * 60 * 1000;

// صفحة الشكر بتنده دي لما يوصلها orderId فعلي.
export function markCompletedOrderExit(storage, orderId, now = Date.now()) {
  if (!storage || !orderId) return;
  try {
    storage.setItem(
      COMPLETED_ORDER_EXIT_KEY,
      JSON.stringify({ orderId: String(orderId), at: now })
    );
  } catch {
    // تخزين ممتلئ أو محظور: من غير العلامة الرجوع بيبقى زي الأول، من غير كسر.
  }
}

// صفحة الشيك آوت بتنده دي عند التحميل. بترجع true مرة واحدة بس لو فيه طلب
// مكتمل حديث، وتمسح العلامة في كل الأحوال عشان متاثرش على زيارات لاحقة.
export function consumeCompletedOrderExit(storage, now = Date.now()) {
  if (!storage) return false;
  let raw = null;
  try {
    raw = storage.getItem(COMPLETED_ORDER_EXIT_KEY);
  } catch {
    return false;
  }
  // العلامة بتتمسح في كل الأحوال (حتى لو تالفة) عشان متبقاش معلّقة.
  try { storage.removeItem(COMPLETED_ORDER_EXIT_KEY); } catch { /* ignore */ }
  if (!raw) return false;
  let record = null;
  try {
    record = JSON.parse(raw);
  } catch {
    return false;
  }
  return Boolean(
    record &&
      typeof record.orderId === "string" &&
      Number.isFinite(record.at) &&
      now - record.at >= 0 &&
      now - record.at <= COMPLETED_ORDER_EXIT_MAX_AGE_MS
  );
}
