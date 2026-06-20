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
    const shippingText = getShippingDisplayText(appliedPromo, true);
    
    // Map payment method to display name
    const displayPaymentMethod = PAYMENT_METHOD_DISPLAY[paymentMethod?.toUpperCase()?.replace('-', '_')] || paymentMethod;

    // --- دالة مشتركة لبناء كارت كل منتج ---
    const buildItemCard = (item) => `
      <div style="display: flex; gap: 12px; padding: 14px; background: #fafafa; border-radius: 6px; border: 0.5px solid #f0f0f0; margin-bottom: 10px;">
        <div style="width: 56px; height: 56px; background: #efefef; border-radius: 4px; flex-shrink: 0; overflow: hidden;">
          <img src="${item.image || item.images?.[0] || ''}" alt="${item.title}" width="56" height="56" style="width: 56px; height: 56px; object-fit: cover; display: block;" />
        </div>
        <div style="flex: 1; min-width: 0;">
          <p style="color: #111111; font-size: 13px; font-weight: bold; margin: 0 0 4px;">${item.title}</p>
          <p style="color: #888888; font-size: 12px; margin: 0;">المقاس: ${item.selectedSize || '-'} &nbsp;|&nbsp; الكمية: ${item.qty}</p>
        </div>
        <div style="text-align: left; white-space: nowrap;">
          <p style="color: #111111; font-size: 13px; font-weight: bold; margin: 0;">${item.price} ${CURRENCY}</p>
        </div>
      </div>
    `;

    // --- دالة مشتركة لبناء جسم الإيميل بالكامل (نفس التصميم للعميل والأدمن) ---
    const buildEmailHtml = ({ headline, subline }) => `
      <div dir="rtl" style="background-color: #f0f0f0; padding: 32px 16px; font-family: 'Arial', sans-serif;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 0.5px solid #e5e5e5; border-radius: 8px; overflow: hidden;">

          <div style="padding: 32px 32px 24px; text-align: center; border-bottom: 0.5px solid #ededed;">
            <p style="color: #111111; font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 0;">${SITE_NAME}</p>
          </div>

          <div style="padding: 32px 32px 24px; text-align: center;">
            <p style="color: #999999; font-size: 12px; margin: 0 0 6px; letter-spacing: 1px;">${headline}</p>
            <p style="color: #111111; font-size: 22px; font-weight: bold; margin: 0;">${subline}</p>
            <p style="color: #888888; font-size: 13px; margin: 8px 0 0;">رقم الطلب #${orderNumber}</p>
          </div>

          <div style="padding: 0 32px 24px;">
            <div style="background-color: #fafafa; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 0.5px solid #f0f0f0;">
              <p style="color: #999999; font-size: 10px; letter-spacing: 1px; margin: 0 0 8px;">بيانات العميل</p>
              <p style="margin: 4px 0; font-size: 13px; color: #444444;"><strong style="color:#111111;">الاسم:</strong> ${formData.firstName} ${formData.lastName}</p>
              <p style="margin: 4px 0; font-size: 13px; color: #444444;"><strong style="color:#111111;">الهاتف:</strong> ${formData.phone}</p>
              <p style="margin: 4px 0; font-size: 13px; color: #444444;"><strong style="color:#111111;">طريقة الدفع:</strong> <span style="color: #10b981; font-weight: bold;">${displayPaymentMethod}</span></p>
            </div>

            ${cartItems.map(buildItemCard).join('')}
          </div>

          <div style="padding: 0 32px 24px;">
            <div style="border-top: 0.5px solid #ededed; padding-top: 16px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 13px;">
                <span style="color: #999999;">سعر المنتج</span>
                <span style="color: #444444;">${cartItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0)} ${CURRENCY}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px;">
                <span style="color: #999999;">الشحن</span>
                <span style="color: ${appliedPromo === 'free' ? '#10b981' : '#444444'};">${shippingText}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 0.5px solid #ededed;">
                <span style="color: #111111; font-size: 15px; font-weight: bold;">الإجمالي</span>
                <span style="color: #111111; font-size: 17px; font-weight: bold;">${total} ${CURRENCY}</span>
              </div>
            </div>
          </div>

          <div style="padding: 0 32px 28px;">
            <div style="background-color: #fafafa; border-radius: 6px; padding: 16px; border: 0.5px solid #f0f0f0;">
              <p style="color: #999999; font-size: 10px; letter-spacing: 1px; margin: 0 0 8px;">عنوان الشحن</p>
              <p style="color: #444444; font-size: 13px; margin: 0; line-height: 1.7;">${formData.firstName} ${formData.lastName}<br>${formData.address}${formData.landmark ? ' - ' + formData.landmark : ''}<br>${formData.city}, ${formData.governorate}</p>
            </div>
          </div>

          <div style="padding: 0 32px 32px;">
            <a href="https://windeg.com" style="display: block; background-color: #111111; border-radius: 6px; padding: 13px; text-align: center; text-decoration: none;">
              <span style="color: #ffffff; font-size: 13px; font-weight: bold;">تتبع طلبك</span>
            </a>
          </div>

          <div style="padding: 20px 32px; border-top: 0.5px solid #ededed; text-align: center;">
            <p style="color: #aaaaaa; font-size: 11px; margin: 0;">
              محتاج مساعدة؟
              <a href="https://wa.me/201055351494" style="color: #111111; text-decoration: none; font-weight: bold;">تواصل معنا عبر واتساب</a>
            </p>
            <p style="color: #bbbbbb; font-size: 10px; margin: 8px 0 0;">© 2026 ${SITE_NAME}</p>
          </div>

        </div>
      </div>
    `;

    // --- محتوى إيميل الأدمن ---
    const htmlContent = buildEmailHtml({
      headline: 'طلب جديد',
      subline: `طلب جديد من ${formData.firstName}`,
    });

    // --- محتوى إيميل العميل ---
    const customerHtmlContent = buildEmailHtml({
      headline: 'ORDER CONFIRMED',
      subline: 'شكراً لطلبك من وينـد',
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