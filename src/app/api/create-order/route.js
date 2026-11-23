import { buildCheckoutEmails } from "@/lib/checkoutEmailTemplate";
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
import { calculateAllTotals } from '@/lib/cartCalculations';
import { sendNewOrderNotification } from '@/lib/fcmAdmin';
import { verifyCheckoutQuote } from '@/lib/checkoutQuoteToken';
import { enforceRateLimit, escapeHtml, safeHttpUrl } from '@/lib/apiGuards';

// Generate unique order number with format: WND-YYYYMMDD-TTTT
function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().split('T')[0].replace(/-/g, ''); // 20260219
  const timePart = now.getTime().toString().slice(-4); // Last 4 digits of timestamp
  return `${ORDER_NUMBER_PREFIX}-${datePart}-${timePart}`;
}

export async function POST(req) {
  // Each call can send emails and a push notification, so cap abuse per IP.
  const limited = await enforceRateLimit(req, 'CREATE_ORDER');
  if (limited) return limited;

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
      promoCode,
      discount,
      quoteToken,
    } = body;

    if (typeof orderId === "string" && orderId.startsWith("WIND-D-")) {
      return NextResponse.json({ error: "USE_DURABLE_CHECKOUT" }, { status: 409 });
    }
    // A server-signed quote is mandatory for every payment method. The old unsigned
    // "card_success" callback path was removed: it trusted totals sent by the browser.
    let signedQuote = null;
    if (!quoteToken) {
      return NextResponse.json(
        { success: false, error: "بيانات التسعير الموثوقة غير موجودة. حدّث صفحة الدفع وحاول مرة أخرى." },
        { status: 409 }
      );
    }
    try {
      signedQuote = await verifyCheckoutQuote(quoteToken, orderId);
    } catch (error) {
      console.error("[create-order] Checkout quote verification failed:", error);
    }
    if (!signedQuote) {
      return NextResponse.json(
        { success: false, error: "انتهت صلاحية تسعير الطلب أو تعذر التحقق منه. أعد المحاولة من صفحة الدفع." },
        { status: 409 }
      );
    }

    {
      const matches = (provided, trusted) =>
        provided !== undefined && provided !== null &&
        Number.isFinite(Number(provided)) &&
        Math.abs(Number(provided) - Number(trusted)) <= 0.01;

      if (
        (paymentMethod === "card" && !matches(amount, signedQuote.total)) ||
        (paymentMethod !== "card" && (
          !matches(subtotal, signedQuote.subtotal) ||
          !matches(shipping, signedQuote.shipping) ||
          !matches(total, signedQuote.total)
        ))
      ) {
        return NextResponse.json(
          { success: false, error: "تغيرت أسعار السلة. أعد مراجعة الإجمالي قبل إتمام الطلب." },
          { status: 409 }
        );
      }
    }

    const trustedSubtotal = signedQuote.subtotal;
    const trustedShipping = signedQuote.shipping;
    const trustedTotal = signedQuote.total;
    const trustedCartItems = signedQuote.cartItems ?? [];
    const trustedLineItems = signedQuote.lineItems ?? trustedCartItems;

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

      const amountStr = Number(trustedTotal).toFixed(2);

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
    const actualShipping = Number(trustedShipping) || 0;
    const isFreeShipping = actualShipping === 0;
    const shippingText = isFreeShipping
      ? `0 ${CURRENCY} (شحن مجاني)`
      : `${actualShipping} ${CURRENCY}`;
    
    const { adminHtml: htmlContent, customerHtml: customerHtmlContent } = buildCheckoutEmails({ paymentMethod, formData, orderNumber, signedQuote });
    const displayPaymentMethod = PAYMENT_METHOD_DISPLAY[paymentMethod?.toUpperCase()?.replace('-', '_')] || paymentMethod;

    // ============================================
    // 3. إرسال الإيميلات عبر Resend REST API — Edge-compatible
    //    (إيميل للأدمن + إيميل تأكيد للعميل)
    // ============================================
    try {
      const response = await fetch('https://api.resend.com/emails', {
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
      let result;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (response.ok) {
        const messageId = typeof result?.id === 'string' ? result.id : null;
        console.log('✅ Admin email sent successfully via Resend REST API', messageId ? { messageId } : '');
      } else {
        const errorMessage = typeof result?.message === 'string'
          ? result.message
          : typeof result?.error === 'string'
            ? result.error
            : typeof result?.error?.message === 'string'
              ? result.error.message
              : 'No error message returned';
        console.error('❌ Resend Admin Email Error:', { status: response.status, message: errorMessage });
      }
    } catch {
      console.error('❌ Resend Admin Email Request Failed before receiving a response');
    }

    // 🔥 إشعار صوتي للأدمن — مستقل تماماً عن الإيميل، فشله ما يأثرش على أي حاجة
    // ⚠️ لازم await هنا: على Cloudflare، أي Promise من غير await ممكن
    // يتقفل قبل ما يخلص لو الـ Response رجع قبله — ده اللي يخلي الإشعار
    // يجي بالصدفة مرة ويختفي مرة، نفس مشكلة عدم الاستقرار القديمة.
    await sendNewOrderNotification({
      title: `طلب جديد من WIND`,
      body: `${formData.firstName} • ${displayPaymentMethod} • ${trustedTotal} ${CURRENCY} • #${orderNumber}`,
      orderId: orderNumber,
    });

    const recipientEmail = customerEmail || formData.email;
    if (typeof recipientEmail === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(recipientEmail)) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: recipientEmail,
            subject: `تأكيد طلبك من ${SITE_NAME} — #${orderNumber}`,
            html: customerHtmlContent,
          })
        });
        let result;
        try {
          result = await response.json();
        } catch {
          result = null;
        }

        if (response.ok) {
          const messageId = typeof result?.id === 'string' ? result.id : null;
          console.log('✅ Customer email sent successfully via Resend REST API', messageId ? { messageId } : '');
        } else {
          const errorMessage = typeof result?.message === 'string'
            ? result.message
            : typeof result?.error === 'string'
              ? result.error
              : typeof result?.error?.message === 'string'
                ? result.error.message
                : 'No error message returned';
          console.error('❌ Resend Customer Email Error:', { status: response.status, message: errorMessage });
        }
      } catch {
        console.error('❌ Resend Customer Email Request Failed before receiving a response');
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