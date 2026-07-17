// src/lib/htmlToPlainText.js
//
// تحويل وصف HTML (بتصميمه الكامل: Tabs / Read More / Styles) لنص عادي نظيف
// 100%، بدون أي HTML أو CSS أو JavaScript — مخصص لأي مكان محتاج نص خام بس
// (زي Facebook Catalog Feed)، بدون التأثير على عرض الوصف نفسه في صفحة المنتج.
//
// الترتيب مهم جداً: لازم نشيل <style>/<script> بالكامل (مع محتواهم) قبل أي
// خطوة تانية، وإلا هيفضل كود الـ CSS/JS ظاهر كنص عادي بعد ما نمسح الوسوم بس.

/** فك أشهر HTML Entities الشائعة في الوصف (بدون مكتبة خارجية) */
function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * يحوّل وصف HTML كامل (بتصميمه) لنص عادي نظيف تماماً.
 * @param {string} html - الوصف الخام كما هو مخزَّن في Firestore
 * @param {number} maxLength - أقصى طول للنص الناتج (اختياري)
 * @returns {string}
 */
export function htmlToPlainText(html, maxLength = 5000) {
  if (!html || typeof html !== "string") return "";

  let text = html;

  // 1) شيل <style>...</style> و<script>...</script> بالكامل (مع المحتوى جواهم)
  //    ده أهم خطوة — لازم تحصل قبل أي حاجة تانية عشان محتوى CSS/JS ميتسربش كنص
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");

  // 2) حوّل الوسوم البنيوية (فقرات/أسطر) لسطر جديد قبل ما نمسحها،
  //    عشان نحافظ على ترتيب وفصل الفقرات
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|details|summary)>/gi, "\n")
    .replace(/<(p|div|li|h[1-6]|tr|section)[^>]*>/gi, "");

  // 3) شيل أي وسوم متبقية (مع كل الـ Classes/Attributes بتاعتها)
  text = text.replace(/<[^>]+>/g, "");

  // 4) فك HTML Entities (زي &nbsp; و&amp;)
  text = decodeHtmlEntities(text);

  // 5) تنظيف الفراغات المكررة مع الحفاظ على فواصل الفقرات
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== "")) // يمنع أسطر فاضية متكررة
    .join("\n")
    .trim();

  return maxLength ? text.slice(0, maxLength) : text;
}
