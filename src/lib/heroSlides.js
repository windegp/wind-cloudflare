// Hero banner slides (Firestore: homepage/main-hero -> slides[]).
//   image        : الصورة الأساسية (ديسكتوب/تابلت) - الحقل القديم، إجباري كما كان
//   mobileImage  : صورة الهاتف - اختيارية. غيابها (أو "") يعني استخدام image
//
// يجب أن تبقى قيمة HERO_MOBILE_MEDIA مطابقة لحد الهاتف في قواعد .hero-slide في globals.css (767px).
export const HERO_MOBILE_MEDIA = "(max-width: 767px)";

export function getHeroMobileImage(slide) {
  const value = slide?.mobileImage;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// الصورة التي سيحمّلها المتصفح فعلياً حسب حالة الشاشة الحالية (للـ preload فقط)
export function pickHeroImage(slide, isMobileViewport) {
  const mobile = getHeroMobileImage(slide);
  return isMobileViewport && mobile ? mobile : slide?.image || "";
}
