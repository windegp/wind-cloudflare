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

    // --- بناء محتوى الإيميل (htmlContent) ---
    const htmlContent = `
      <div dir="rtl" style="font-family: 'Arial', sans-serif; background-color: #121212; color: #ffffff; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #333;">
        <div style="text-align: center; border-bottom: 2px solid ${BRAND_COLOR}; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="color: ${BRAND_COLOR}; margin: 0; font-size: 28px; letter-spacing: 2px;">${SITE_NAME}</h1>
          <p style="color: #a1a1a1; font-size: 14px; margin-top: 5px;">طلب جديد رقم #${orderNumber}</p>
        </div>
        
        <div style="background-color: #1a1a1a; padding: 15px; border-radius: 4px; margin-bottom: 25px; border-right: 4px solid ${BRAND_COLOR};">
          <h3 style="color: ${BRAND_COLOR}; margin-top: 0; font-size: 16px;">بيانات العميل:</h3>
          <p style="margin: 5px 0; font-size: 14px;"><strong>الاسم:</strong> ${formData.firstName} ${formData.lastName}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>الهاتف:</strong> ${formData.phone}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>العنوان:</strong> ${formData.address}, ${formData.governorate}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>طريقة الدفع:</strong> <span style="color: #10b981; font-weight: bold;">${displayPaymentMethod}</span></p>
        </div>

        <h3 style="color: ${BRAND_COLOR}; font-size: 16px; margin-bottom: 10px;">ملخص المشتريات:</h3>
        <table style="width: 100%; border-collapse: collapse; color: #ffffff;">
          <thead>
            <tr style="background-color: #222;">
              <th style="padding: 12px; text-align: right; border-bottom: 1px solid #333; font-size: 13px;">المنتج</th>
              <th style="padding: 12px; text-align: center; border-bottom: 1px solid #333; font-size: 13px;">الكمية</th>
              <th style="padding: 12px; text-align: left; border-bottom: 1px solid #333; font-size: 13px;">السعر</th>
            </tr>
          </thead>
          <tbody>
            ${cartItems.map(item => `
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #222; font-size: 13px;">
                  <span style="font-weight: bold; color: #eee;">${item.title}</span><br/>
                  <small style="color: ${BRAND_COLOR};">المقاس: ${item.selectedSize}</small>
                </td>
                <td style="padding: 12px; text-align: center; border-bottom: 1px solid #222;">${item.qty}</td>
                <td style="padding: 12px; text-align: left; border-bottom: 1px solid #222; font-weight: bold;">${item.price} ${CURRENCY}</td>
              </tr>
            `).join('')}
            <tr>
              <td colspan="2" style="padding: 12px; text-align: right; font-weight: bold; color: #a1a1a1;">مصاريف الشحن:</td>
              <td style="padding: 12px; text-align: left; font-weight: bold; color: ${appliedPromo === 'free' ? '#10b981' : '#eee'};">${shippingText}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 30px; padding: 15px; background-color: ${BRAND_COLOR}; color: #000; border-radius: 4px; text-align: center;">
          <span style="font-size: 14px; font-weight: bold;">الإجمالي الكلي المستحق</span>
          <h2 style="margin: 5px 0 0 0; font-size: 24px; font-weight: 900;">${total} ${CURRENCY}</h2>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #555; font-size: 11px;">
          <p>© 2026 ${SITE_NAME}. All rights reserved.</p>
        </div>
      </div>
    `;

    // ============================================
    // 3. إرسال الإيميل عبر Resend REST API — Edge-compatible
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
      console.log('✅ Email sent successfully via Resend REST API');
    } catch (emailError) {
      console.error('❌ Resend Email Error:', emailError.message);
      // Don't break the entire operation if email fails, just log the error
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