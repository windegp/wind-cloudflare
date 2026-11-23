// Validation and email rendering for the public contact form.
import { escapeHtml } from "@/lib/apiGuards";

export const CONTACT_TOPICS = {
  order: "استفسار عن طلب",
  product: "استفسار عن منتج أو مقاس",
  shipping: "الشحن والتوصيل",
  return: "استبدال أو استرجاع",
  other: "أخرى",
};

const stripControl = (v) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const oneLine = (v) => stripControl(v).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const westernDigits = (v) => String(v ?? "").replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

/** Returns { ok: true, data } or { ok: false, error } (Arabic message). */
export function validateContactForm(body) {
  const name = oneLine(body?.name);
  const phoneRaw = oneLine(westernDigits(body?.phone));
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const email = oneLine(body?.email).toLowerCase();
  const topic = typeof body?.topic === "string" && CONTACT_TOPICS[body.topic] ? body.topic : "other";
  const message = stripControl(body?.message).replace(/\r\n/g, "\n");

  if (name.length < 2 || name.length > 80) return { ok: false, error: "اكتب اسمك (من حرفين لـ ٨٠ حرف)." };
  if (phoneDigits.length < 10 || phoneDigits.length > 15 || phoneRaw.length > 25) {
    return { ok: false, error: "رقم الموبايل غير صحيح." };
  }
  if (email.length > 120 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "البريد الإلكتروني غير صحيح." };
  }
  if (message.length < 10 || message.length > 2000) {
    return { ok: false, error: "اكتب رسالتك (من ١٠ حروف لـ ٢٠٠٠ حرف)." };
  }
  return { ok: true, data: { name, phone: phoneRaw, email, topic, message } };
}

/** Newsletter / discount subscription: email only. */
export function validateSubscription(body) {
  const email = oneLine(body?.email).toLowerCase();
  if (email.length > 120 || !EMAIL_RE.test(email)) return { ok: false, error: "البريد الإلكتروني غير صحيح." };
  return { ok: true, data: { email } };
}

export function buildSubscriptionEmail(data) {
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:600px;margin:auto">
<h2 style="margin:0 0 12px">اشتراك جديد في الخصم</h2>
<p>عميل جديد اشترك من صفحة تواصل معانا:</p>
<p style="font-size:18px;font-weight:bold" dir="ltr">${escapeHtml(data.email)}</p>
<p style="color:#888;font-size:12px">النوع: اشتراك خصم (مش استفسار).</p></div>`;
  return { subject: `[اشتراك خصم] ${data.email}`.slice(0, 150), html };
}

export function buildContactEmail(data) {
  const topic = CONTACT_TOPICS[data.topic];
  const row = (label, value) =>
    `<tr><td style="padding:8px 12px;background:#f6f6f6;font-weight:bold;width:120px;vertical-align:top">${label}</td><td style="padding:8px 12px">${value}</td></tr>`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:600px;margin:auto">
<h2 style="margin:0 0 12px">استفسار جديد من صفحة تواصل معانا</h2>
<table style="border-collapse:collapse;width:100%;border:1px solid #e5e5e5">
${row("الاسم", escapeHtml(data.name))}
${row("الموبايل", escapeHtml(data.phone))}
${row("البريد", escapeHtml(data.email))}
${row("الموضوع", escapeHtml(topic))}
${row("الرسالة", escapeHtml(data.message).replace(/\n/g, "<br>"))}
</table>
<p style="color:#888;font-size:12px">اضغط Reply للرد على العميل مباشرة.</p></div>`;
  return { subject: `[استفسار] ${topic} - ${data.name}`.slice(0, 150), html };
}
