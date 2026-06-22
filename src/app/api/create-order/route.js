import { NextResponse } from 'next/server';
import { 
  ADMIN_EMAIL, 
  EMAIL_FROM, 
  SITE_NAME, 
  BRAND_COLOR, 
  CURRENCY, 
  ORDER_NUMBER_PREFIX,
  PAYMENT_METHOD_DISPLAY,
  KASHIER_CONFIG 
} from '@/lib/constants';
import { getShippingDisplayText, calculateAllTotals } from '@/lib/cartCalculations';
import { sendNewOrderNotification } from '@/lib/fcmAdmin';

// Generate unique order number with format: WND-YYYYMMDD-TTTT
function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().split('T')[0].replace(/-/g, ''); // 20260219
  const timePart = now.getTime().toString().slice(-4); // Last 4 digits of timestamp
  return `${ORDER_NUMBER_PREFIX}-${datePart}-${timePart}`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { 
      paymentMethod, 
      orderId, 
      amount, 
      customerName, 
      customerEmail, 
      phone, 
      formData, 
      cartItems, 
      subtotal,
      shipping,
      total,
      appliedPromo 
    } = body;

    // ============================================
    // 1. كاشير — إرجاع بيانات الـ iFrame (hash + params)
    //    ⚠️ تغيير: بدل ما نرجع paymentUrl للـ redirect،
    //    نرجع الـ hash والبيانات عشان الـ iFrame يشتغل
    //    في نفس الصفحة بدون redirect
    // ============================================
    if (paymentMethod === 'card') {
      const merchantId = process.env.KASHIER_MERCHANT_ID;
      const paymentApiKey = process.env.KASHIER_API_KEY;
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      const mode = KASHIER_CONFIG.MODE;

      if (!merchantId || !paymentApiKey || !baseUrl) {
        return NextResponse.json(
          { error: `متغير ناقص في الإعدادات` },
          { status: 500 }
        );
      }

      const amountStr = parseFloat(amount).toFixed(2);

      // Generate payment hash (HMAC SHA256) using Web Crypto API
      const hashPath = `/?payment=${merchantId}.${orderId}.${amountStr}.${CURRENCY}`;
      
      const keyBuffer = new TextEncoder().encode(paymentApiKey);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const dataBuffer = new TextEncoder().encode(hashPath);
      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
      
      const hash = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Return iframe data instead of redirect URL
      return NextResponse.json({
        success: true,
        iframeData: {
          merchantId,
          hash,
          orderId,
          amount: amountStr,
          currency: CURRENCY,
          mode,
          merchantRedirect: `${baseUrl}/thank-you`,
          failureRedirect: `${baseUrl}/failed`,
          allowedMethods: KASHIER_CONFIG.ALLOWED_METHODS,
          display: KASHIER_CONFIG.DISPLAY_LANGUAGE,
          brandColor: BRAND_COLOR,
        }
      });
    }

   // ============================================
    // 2. COD أو InstaPay أو Card_Success — إرسال الإيميل
    // ============================================
    const orderNumber = orderId; // 🔥 توحيد رقم الطلب مع اللي اتسجل في الداتا بيز بدل ما نولد واحد جديد للإيميل

    // --- تجهيز بيانات الإيميل ---
    // نستخدم قيمة shipping الفعلية المرسلة من صفحة الدفع مباشرة
    // بدل إعادة حسابها من كود الخصم، عشان تطابق القيمة الحقيقية دايماً
    const actualShipping = Number(shipping) || 0;
    const isFreeShipping = actualShipping === 0;
    const shippingText = isFreeShipping
      ? `0 ${CURRENCY} (شحن مجاني)`
      : `${actualShipping} ${CURRENCY}`;
    
    // Map payment method to display name
    const displayPaymentMethod = PAYMENT_METHOD_DISPLAY[paymentMethod?.toUpperCase()?.replace('-', '_')] || paymentMethod;

   // --- دالة مشتركة لبناء كارت كل منتج (table layout — متوافق مع كل عملاء البريد) ---
    const buildItemCard = (item) => {
      const hasDiscount = item.compareAtPrice && Number(item.compareAtPrice) > Number(item.price);
      const imgUrl = item.image || (Array.isArray(item.images) ? item.images[0] : '') || '';
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0; margin-bottom: 8px;">
        <tr>
          <td width="56" style="padding: 10px;">
            <img src="${imgUrl}" alt="${item.title}" width="52" height="52" style="width: 52px; height: 52px; object-fit: cover; border-radius: 4px; display: block; background: #efefef;" />
          </td>
          <td style="padding: 10px 6px; vertical-align: middle;">
            <span style="color: #111111; font-size: 12px; font-weight: bold; display: block; margin-bottom: 2px;">${item.title}</span>
            <span style="color: #888888; font-size: 11px;">المقاس: ${item.selectedSize || '-'} &nbsp;|&nbsp; الكمية: ${item.qty}</span>
          </td>
          <td width="65" style="padding: 10px; text-align: left; vertical-align: middle; white-space: nowrap;">
            ${hasDiscount ? `<span style="color: #bbbbbb; font-size: 10px; text-decoration: line-through; display: block;">${item.compareAtPrice}</span>` : ''}
            <span style="color: #111111; font-size: 12px; font-weight: bold;">${item.price} ${CURRENCY}</span>
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
            <span style="color: #888888; font-size: 12px;">رقم الطلب #${orderNumber}</span>
          </td></tr>

          <tr><td style="padding: 0 20px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
              <tr><td style="padding: 12px 14px;">
                <span style="color: #999999; font-size: 9px; letter-spacing: 1px; display: block; margin-bottom: 8px;">بيانات العميل</span>
                <span style="color: #444444; font-size: 12px; line-height: 1.8;">
                  <strong style="color:#111111;">الاسم:</strong> ${formData.firstName} ${formData.lastName}<br>
                  <strong style="color:#111111;">الهاتف:</strong> ${formData.phone}<br>
                  ${isAdminEmail && formData.altPhone ? `<strong style="color:#111111;">هاتف بديل:</strong> ${formData.altPhone}<br>` : ''}
                  ${isAdminEmail && formData.email ? `<strong style="color:#111111;">البريد الإلكتروني:</strong> ${formData.email}<br>` : ''}
                  ${isAdminEmail && formData.postalCode ? `<strong style="color:#111111;">الرمز البريدي:</strong> ${formData.postalCode}<br>` : ''}
                  <strong style="color:#111111;">طريقة الدفع:</strong> <span style="color: #10b981; font-weight: bold;">${displayPaymentMethod}</span>
                </span>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding: 0 20px 4px;">
            ${cartItems.map(buildItemCard).join('')}
          </td></tr>

          <tr><td style="padding: 4px 24px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #ededed; padding-top: 12px;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #999999;">سعر المنتج</td>
                <td style="padding: 6px 0; font-size: 12px; color: #444444; text-align: left;">${Number(subtotal) || cartItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0)} ${CURRENCY}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #999999;">الشحن</td>
                <td style="padding: 6px 0; font-size: 12px; color: ${isFreeShipping ? '#1d9e75' : '#444444'}; text-align: left; font-weight: ${isFreeShipping ? 'bold' : 'normal'};">${shippingText}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0 0; font-size: 14px; color: #111111; font-weight: bold; border-top: 1px solid #ededed;">الإجمالي</td>
                <td style="padding: 10px 0 0; font-size: 16px; color: #111111; font-weight: bold; text-align: left; border-top: 1px solid #ededed;">${total} ${CURRENCY}</td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="padding: 0 20px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
              <tr><td style="padding: 14px;">
                <span style="color: #999999; font-size: 9px; letter-spacing: 1px; display: block; margin-bottom: 6px;">عنوان الشحن</span>
                <span style="color: #444444; font-size: 12px; line-height: 1.6;">${formData.firstName} ${formData.lastName}<br>${formData.address}${formData.landmark ? ' - ' + formData.landmark : ''}<br>${formData.city}, ${formData.governorate}</span>
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
      subline: `طلب جديد من ${formData.firstName}`,
      isAdminEmail: true,
    });

    // --- محتوى إيميل العميل (مختصر) ---
    const customerHtmlContent = buildEmailHtml({
      headline: 'ORDER CONFIRMED',
      subline: 'شكراً لطلبك من وينـد',
      isAdminEmail: false,
    });

    // ============================================
    // 3. إرسال الإيميلات عبر Resend REST API — Edge-compatible
    //    (إيميل للأدمن + إيميل تأكيد للعميل)
    // ============================================
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: EMAIL_FROM, 
          to: ADMIN_EMAIL,
          subject: `طلب جديد من ${formData.firstName} #${orderNumber}`,
          html: htmlContent,
        })
      });
      console.log('✅ Admin email sent successfully via Resend REST API');
    } catch (emailError) {
      console.error('❌ Resend Admin Email Error:', emailError.message);
    }

    // 🔥 إشعار صوتي للأدمن — مستقل تماماً عن الإيميل، فشله ما يأثرش على أي حاجة
    // ⚠️ لازم await هنا: على Cloudflare، أي Promise من غير await ممكن
    // يتقفل قبل ما يخلص لو الـ Response رجع قبله — ده اللي يخلي الإشعار
    // يجي بالصدفة مرة ويختفي مرة، نفس مشكلة عدم الاستقرار القديمة.
    await sendNewOrderNotification({
      title: `طلب جديد من WIND`,
      body: `${formData.firstName} • ${displayPaymentMethod} • ${total} ${CURRENCY} • #${orderNumber}`,
      orderId: orderNumber,
    });

    if (customerEmail || formData.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: customerEmail || formData.email,
            subject: `تأكيد طلبك من ${SITE_NAME} — #${orderNumber}`,
            html: customerHtmlContent,
          })
        });
        console.log('✅ Customer email sent successfully via Resend REST API');
      } catch (emailError) {
        console.error('❌ Resend Customer Email Error:', emailError.message);
      }
    }

    // Final response with success
    return NextResponse.json({
      success: true,
      data: { orderNumber },
      message: "Order created successfully"
    }, { status: 200 });

  } catch (error) {
    console.error('Server Error:', error.message);
    return NextResponse.json({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      details: error.message
    }, { status: 500 });
  }
}