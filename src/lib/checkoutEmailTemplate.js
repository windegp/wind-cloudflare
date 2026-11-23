import { PAYMENT_METHOD_DISPLAY, SITE_NAME, CURRENCY } from "@/lib/constants";
import { escapeHtml, safeHttpUrl } from "@/lib/apiGuards";

// Existing checkout email markup, shared unchanged with durable delivery.
export function buildCheckoutEmails({ paymentMethod, formData, orderNumber, signedQuote }) {
  const trustedSubtotal = signedQuote.subtotal;
  const trustedTotal = signedQuote.total;
  const trustedCartItems = signedQuote.cartItems || [];
  const trustedLineItems = signedQuote.lineItems || trustedCartItems;
  const actualShipping = Number(signedQuote.shipping) || 0;
  const isFreeShipping = actualShipping === 0;
  const shippingText = isFreeShipping ? `0 ${CURRENCY} (شحن مجاني)` : `${actualShipping} ${CURRENCY}`;
    // Map payment method to display name
    const displayPaymentMethod = PAYMENT_METHOD_DISPLAY[paymentMethod?.toUpperCase()?.replace('-', '_')] || paymentMethod;

   // --- دالة مشتركة لبناء كارت كل منتج (table layout — متوافق مع كل عملاء البريد) ---
    const buildItemCard = (item) => {
      const title = item.productTitle || item.title || item.name || "منتج";
      const quantity = Number(item.quantity ?? item.qty) || 1;
      const originalPrice = Number(item.originalPrice ?? item.compareAtPrice);
      const hasDiscount = Number.isFinite(originalPrice) && originalPrice > Number(item.price);
      const isOfferBenefit = item.isOfferBenefit === true;
      const benefitLabel = isOfferBenefit
        ? (item.isFree ? "هدية مجانية من العرض" : "خصم العرض")
        : item.isCustomerChoiceGiftSelection
          ? "اختيار ضمن العرض"
          : "";
      const imgUrl = item.image || (Array.isArray(item.images) ? item.images[0] : '') || '';
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0; margin-bottom: 8px;">
        <tr>
          <td width="56" style="padding: 10px;">
            <img src="${escapeHtml(safeHttpUrl(imgUrl))}" alt="${escapeHtml(title)}" width="52" height="52" style="width: 52px; height: 52px; object-fit: cover; border-radius: 4px; display: block; background: #efefef;" />
          </td>
          <td style="padding: 10px 6px; vertical-align: middle;">
            <span style="color: #111111; font-size: 12px; font-weight: bold; display: block; margin-bottom: 2px;">${escapeHtml(title)}</span>
            <span style="color: #888888; font-size: 11px;">المقاس: ${escapeHtml(item.selectedSize || '-')} &nbsp;|&nbsp; اللون: ${escapeHtml(item.selectedColor || '-')} &nbsp;|&nbsp; الكمية: ${quantity}</span>
            ${benefitLabel ? `<span style="color: #16835f; font-size: 10px; font-weight: bold; display: block; margin-top: 3px;">${benefitLabel}</span>` : ''}
          </td>
          <td width="65" style="padding: 10px; text-align: left; vertical-align: middle; white-space: nowrap;">
            ${hasDiscount ? `<span style="color: #bbbbbb; font-size: 10px; text-decoration: line-through; display: block;">${originalPrice}</span>` : ''}
            <span style="color: #111111; font-size: 12px; font-weight: bold;">${escapeHtml(item.price)} ${CURRENCY}</span>
          </td>
        </tr>
      </table>
    `;
    };
    // --- دالة مشتركة لبناء جسم الإيميل بالكامل (table-based) ---
    const buildEmailHtml = ({ headline, subline, isAdminEmail = false }) => `
      <div dir="rtl" style="background-color: #f0f0f0; padding: 24px 12px; font-family: 'Arial', sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 420px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e5e5; border-radius: 8px; border-collapse: separate;">

          <tr><td style="padding: 28px 24px 20px; text-align: center; border-bottom: 1px solid #ededed;">
            <span style="color: #111111; font-size: 18px; font-weight: bold; letter-spacing: 2px;">${SITE_NAME}</span>
          </td></tr>

          <tr><td style="padding: 24px 24px 18px; text-align: center;">
            <span style="color: #999999; font-size: 11px; letter-spacing: 1px;">${headline}</span><br>
            <span style="color: #111111; font-size: 19px; font-weight: bold;">${subline}</span><br>
            <span style="color: #888888; font-size: 12px;">رقم الطلب #${escapeHtml(orderNumber)}</span>
          </td></tr>

          <tr><td style="padding: 0 20px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
              <tr><td style="padding: 12px 14px;">
                <span style="color: #999999; font-size: 9px; letter-spacing: 1px; display: block; margin-bottom: 8px;">بيانات العميل</span>
                <span style="color: #444444; font-size: 12px; line-height: 1.8;">
                  <strong style="color:#111111;">الاسم:</strong> ${escapeHtml(formData.firstName)} ${escapeHtml(formData.lastName)}<br>
                  <strong style="color:#111111;">الهاتف:</strong> ${escapeHtml(formData.phone)}<br>
                  ${isAdminEmail && formData.altPhone ? `<strong style="color:#111111;">هاتف بديل:</strong> ${escapeHtml(formData.altPhone)}<br>` : ''}
                  ${isAdminEmail && formData.email ? `<strong style="color:#111111;">البريد الإلكتروني:</strong> ${escapeHtml(formData.email)}<br>` : ''}
                  ${isAdminEmail && formData.postalCode ? `<strong style="color:#111111;">الرمز البريدي:</strong> ${escapeHtml(formData.postalCode)}<br>` : ''}
                  <strong style="color:#111111;">طريقة الدفع:</strong> <span style="color: #10b981; font-weight: bold;">${escapeHtml(displayPaymentMethod)}</span>
                </span>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding: 0 20px 4px;">
            ${trustedLineItems.map(buildItemCard).join('')}
          </td></tr>

          <tr><td style="padding: 4px 24px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #ededed; padding-top: 12px;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #999999;">سعر المنتج</td>
                <td style="padding: 6px 0; font-size: 12px; color: #444444; text-align: left;">${trustedSubtotal || trustedCartItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0)} ${CURRENCY}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #999999;">الشحن</td>
                <td style="padding: 6px 0; font-size: 12px; color: ${isFreeShipping ? '#1d9e75' : '#444444'}; text-align: left; font-weight: ${isFreeShipping ? 'bold' : 'normal'};">${shippingText}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0 0; font-size: 14px; color: #111111; font-weight: bold; border-top: 1px solid #ededed;">الإجمالي</td>
                <td style="padding: 10px 0 0; font-size: 16px; color: #111111; font-weight: bold; text-align: left; border-top: 1px solid #ededed;">${trustedTotal} ${CURRENCY}</td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="padding: 0 20px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
              <tr><td style="padding: 14px;">
                <span style="color: #999999; font-size: 9px; letter-spacing: 1px; display: block; margin-bottom: 6px;">عنوان الشحن</span>
                <span style="color: #444444; font-size: 12px; line-height: 1.6;">${escapeHtml(formData.firstName)} ${escapeHtml(formData.lastName)}<br>${escapeHtml(formData.address)}${formData.landmark ? ' - ' + escapeHtml(formData.landmark) : ''}<br>${escapeHtml(formData.city)}, ${escapeHtml(formData.governorate)}</span>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding: 0 20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background: #111111; border-radius: 6px; text-align: center; padding: 12px;">
                <a href="https://windeg.com" style="color: #ffffff; font-size: 12px; font-weight: bold; text-decoration: none;">تتبع طلبك</a>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding: 16px 24px; border-top: 1px solid #ededed; text-align: center;">
            <span style="color: #aaaaaa; font-size: 10px;">محتاج مساعدة؟ <a href="https://wa.me/201055351494" style="color:#111; font-weight:bold; text-decoration:none;">تواصل معنا عبر واتساب</a></span><br>
            <span style="color: #cccccc; font-size: 9px;">© 2026 ${SITE_NAME}</span>
          </td></tr>

        </table>
      </div>
    `;

    // --- محتوى إيميل الأدمن (يشمل كل البيانات اللي كتبها العميل) ---
    const htmlContent = buildEmailHtml({
      headline: 'طلب جديد',
      subline: `طلب جديد من ${escapeHtml(formData.firstName)}`,
      isAdminEmail: true,
    });

    // --- محتوى إيميل العميل (مختصر) ---
    const customerHtmlContent = buildEmailHtml({
      headline: 'ORDER CONFIRMED',
      subline: 'شكراً لطلبك من وينـد',
      isAdminEmail: false,
    });


  return { adminHtml: htmlContent, customerHtml: customerHtmlContent };
}
