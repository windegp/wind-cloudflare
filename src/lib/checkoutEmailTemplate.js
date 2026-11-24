import { PAYMENT_METHOD_DISPLAY, SITE_NAME, SITE_DOMAIN, CURRENCY } from "@/lib/constants";
import { escapeHtml, safeHttpUrl } from "@/lib/apiGuards";

// Existing checkout email markup, shared unchanged with durable delivery.
// Itemized money rows shared by both emails. total = subtotal - discount + shipping.
// Every discount the server applied (offer, code, first order, subscriber) gets its own line.
export function buildBreakdownRows(signedQuote) {
  const subtotal = Number(signedQuote.subtotal);
  const shipping = Number(signedQuote.shipping) || 0;
  const discount = Number(signedQuote.discount) || 0;
  const lines = Array.isArray(signedQuote.discountLines)
    ? signedQuote.discountLines.filter(l => Number(l?.amount) > 0).map(l => ({ label: String(l.label || "خصم"), amount: Number(l.amount) }))
    : [];
  const itemized = lines.reduce((sum, l) => sum + l.amount, 0);
  const discountRows = lines.length && Math.abs(itemized - discount) <= 0.01
    ? lines
    : discount > 0 ? [{ label: "الخصم", amount: discount }] : [];
  // Real price markdowns only (compare-at vs price). productDiscountTotal also counts the free-gift
  // value, which is already inside `discount`, so using it double counted. Shipping is never savings.
  const orig = Number(signedQuote.originalSubtotal);
  const markdown = Number.isFinite(orig) ? Math.max(0, orig - subtotal) : 0;
  const saved = markdown + discount;
  return { subtotal, shipping, discountRows, saved, total: Number(signedQuote.total) };
}

export function buildCheckoutEmails({ paymentMethod, formData, orderNumber, signedQuote, orderId }) {
  const trustedSubtotal = signedQuote.subtotal;
  const trustedTotal = signedQuote.total;
  const trustedCartItems = signedQuote.cartItems || [];
  const trustedLineItems = signedQuote.lineItems || trustedCartItems;
  const actualShipping = Number(signedQuote.shipping) || 0;
  const isFreeShipping = actualShipping === 0;
  const breakdown = buildBreakdownRows(signedQuote);
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
                <td style="padding: 6px 0; font-size: 12px; color: #999999;">المجموع الفرعي</td>
                <td style="padding: 6px 0; font-size: 12px; color: #444444; text-align: left;">${breakdown.subtotal} ${CURRENCY}</td>
              </tr>
              ${breakdown.discountRows.map(row => `<tr>
                <td style="padding: 6px 0; font-size: 12px; color: #1d9e75;">${escapeHtml(row.label)}</td>
                <td style="padding: 6px 0; font-size: 12px; color: #1d9e75; text-align: left;">- ${row.amount} ${CURRENCY}</td>
              </tr>`).join('')}
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


    // --- إيميل الأدمن: بنفس ترتيب إيميل Shopify (عنوان، زر عرض الطلب، ملخص الطلب، الدفع، الشحن) ---
    const adminOrderId = String(orderId || orderNumber);
    const rowTd = 'padding: 4px 0; font-size: 15px; color: #202223;';
    const adminItem = (item) => {
      const title = item.productTitle || item.title || item.name || "منتج";
      const quantity = Number(item.quantity ?? item.qty) || 1;
      const price = Number(item.price) || 0;
      const imgUrl = safeHttpUrl(item.image || (Array.isArray(item.images) ? item.images[0] : '') || '');
      const meta = [item.selectedSize && `المقاس: ${item.selectedSize}`, item.selectedColor && `اللون: ${item.selectedColor}`].filter(Boolean).map(escapeHtml).join(' &nbsp;|&nbsp; ');
      const note = item.isOfferBenefit === true ? (item.isFree ? "هدية مجانية من العرض" : "خصم العرض") : item.isCustomerChoiceGiftSelection ? "اختيار ضمن العرض" : "";
      return `<tr>
        <td width="64" style="padding: 8px 0; vertical-align: top;"><img src="${escapeHtml(imgUrl)}" alt="" width="56" height="56" style="width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #e1e3e5; display: block; background: #f6f6f7;" /></td>
        <td style="padding: 8px 10px; vertical-align: top; font-size: 15px; color: #202223;">${escapeHtml(title)}<br><span style="font-size: 14px; color: #6d7175;">${price === 0 ? 'مجاني' : `${price} ${CURRENCY}`} × ${quantity}</span>${meta ? `<br><span style="font-size: 12px; color: #6d7175;">${meta}</span>` : ''}${note ? `<br><span style="font-size: 12px; color: #16835f;">${note}</span>` : ''}</td>
        <td style="padding: 8px 0; vertical-align: top; text-align: left; font-size: 15px; color: #202223; white-space: nowrap;">${price === 0 ? 'مجاني' : `${price * quantity} ${CURRENCY}`}</td>
      </tr>`;
    };
    const moneyRow = (label, value, color = '#202223') => `<tr><td style="${rowTd} color: ${color};">${label}</td><td style="${rowTd} color: ${color}; text-align: left;">${value}</td></tr>`;
    const logoBlock = `<tr><td style="padding: 8px 28px 28px; text-align: center; border-top: 1px solid #e1e3e5;"><img src="https://${SITE_DOMAIN}/logo.png" alt="${escapeHtml(SITE_NAME)}" width="120" style="width: 120px; max-width: 50%; height: auto; display: inline-block; margin-top: 24px;" /></td></tr>`;
    const detailsBlocks = `
          <tr><td style="padding: 0 28px;"><div style="border-top: 1px solid #e1e3e5;"></div></td></tr>
          <tr><td style="padding: 20px 28px 0; font-size: 15px; line-height: 1.7; color: #202223;">
            <strong>طريقة الدفع</strong><br>${escapeHtml(displayPaymentMethod)}
          </td></tr>
          <tr><td style="padding: 16px 28px 0; font-size: 15px; line-height: 1.7; color: #202223;">
            <strong>طريقة الشحن</strong><br>${isFreeShipping ? 'شحن مجاني' : 'شحن قياسي'}
          </td></tr>
          <tr><td style="padding: 16px 28px 28px; font-size: 15px; line-height: 1.7; color: #202223;">
            <strong>عنوان الشحن</strong><br>
            ${escapeHtml(formData.firstName)} ${escapeHtml(formData.lastName)}<br>
            ${escapeHtml(formData.address)}${formData.landmark ? ' - ' + escapeHtml(formData.landmark) : ''}<br>
            ${escapeHtml(formData.city)}, ${escapeHtml(formData.governorate)}${formData.postalCode ? ' ' + escapeHtml(formData.postalCode) : ''}<br>
            ${escapeHtml(formData.phone)}${formData.altPhone ? `<br>هاتف بديل: ${escapeHtml(formData.altPhone)}` : ''}${formData.email ? `<br>${escapeHtml(formData.email)}` : ''}
          </td></tr>`;
    const summaryBlocks = `
          <tr><td style="padding: 20px 28px 4px; font-size: 18px; font-weight: bold; color: #202223;">ملخص الطلب</td></tr>
          <tr><td style="padding: 4px 28px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${trustedLineItems.map(adminItem).join('')}</table>
          </td></tr>
          <tr><td style="padding: 4px 28px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${moneyRow('المجموع الفرعي', `${breakdown.subtotal} ${CURRENCY}`)}
              ${breakdown.discountRows.map(row => moneyRow(escapeHtml(row.label), `- ${row.amount} ${CURRENCY}`, '#16835f')).join('')}
              ${moneyRow('الشحن', isFreeShipping ? 'مجاني' : `${actualShipping} ${CURRENCY}`)}
              <tr><td style="padding: 8px 0 0; font-size: 16px; font-weight: bold; color: #202223;">الإجمالي</td><td style="padding: 8px 0 0; font-size: 16px; font-weight: bold; color: #202223; text-align: left;">${breakdown.total} ${CURRENCY}</td></tr>
              ${breakdown.saved > 0 ? moneyRow('إجمالي التوفير', `${breakdown.saved} ${CURRENCY}`, '#16835f') : ''}
            </table>
          </td></tr>`;
    const wrap = (inner) => `
      <div dir="rtl" style="background: #ffffff; padding: 32px 12px; font-family: Arial, Helvetica, sans-serif; color: #202223;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto; border: 1px solid #e1e3e5; border-radius: 8px; border-collapse: separate;">${inner}
          ${logoBlock}
        </table>
      </div>
    `;
    const adminHtml = wrap(`
          <tr><td style="padding: 24px 28px 8px; font-size: 18px; line-height: 1.6; color: #202223;">
            ${escapeHtml(formData.firstName)} ${escapeHtml(formData.lastName)} سجّل الطلب #${escapeHtml(orderNumber)}
          </td></tr>
          <tr><td style="padding: 8px 28px 20px;">
            <a href="https://${SITE_DOMAIN}/admin/orders/${encodeURIComponent(adminOrderId)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #008060; color: #ffffff; font-size: 15px; text-decoration: none; padding: 12px 20px; border-radius: 6px;">عرض الطلب</a>
          </td></tr>
          <tr><td style="padding: 0 28px;"><div style="border-top: 1px solid #e1e3e5;"></div></td></tr>
          ${summaryBlocks}${detailsBlocks}`);

    // --- إيميل العميل: نفس ترتيب إيميل Shopify. زر "عرض طلبك" يفتح صفحة تتبع الطلب برقم الطلب ---
    // The phone goes in the URL fragment (#p=), which browsers never send to the server or logs.
    const trackPhone = String(formData.phone || '').replace(/[^0-9+]/g, '').slice(0, 20);
    const trackUrl = `https://${SITE_DOMAIN}/track-order?order=${encodeURIComponent(String(orderNumber))}${trackPhone ? `#p=${encodeURIComponent(trackPhone)}` : ''}`;
    const customerHtmlContent = wrap(`
          <tr><td style="padding: 28px 28px 4px; font-size: 24px; color: #202223;">شكراً لطلبك من وينـد!</td></tr>
          <tr><td style="padding: 4px 28px 0; font-size: 14px; color: #6d7175;">رقم الطلب #${escapeHtml(orderNumber)}</td></tr>
          <tr><td style="padding: 12px 28px 0; font-size: 15px; line-height: 1.8; color: #6d7175;">أهلاً ${escapeHtml(formData.firstName)}، بنجهّز طلبك للشحن دلوقتي، وهنبلغك أول ما يتشحن.</td></tr>
          <tr><td style="padding: 20px 28px 24px; font-size: 15px; color: #6d7175;">
            <a href="${trackUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #1990c6; color: #ffffff; font-size: 15px; text-decoration: none; padding: 14px 22px; border-radius: 5px;">عرض طلبك</a>
            &nbsp; أو <a href="https://${SITE_DOMAIN}" target="_blank" rel="noopener noreferrer" style="color: #1990c6; text-decoration: none;">زيارة المتجر</a>
          </td></tr>
          ${summaryBlocks}${detailsBlocks}`);


  return { adminHtml, customerHtml: customerHtmlContent };
}
