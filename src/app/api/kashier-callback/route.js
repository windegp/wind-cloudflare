import { NextResponse } from 'next/server';

// ============================================
// كاشير Callback — التحقق من الـ Signature
// المسار: /api/kashier-callback
// كاشير بيبعت GET request هنا بعد الدفع
// ============================================

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    // ── استخراج البيانات من كاشير ──
    const paymentStatus  = searchParams.get('paymentStatus');   // SUCCESS / FAILURE
    const orderId        = searchParams.get('orderId');
    const amount         = searchParams.get('amount');
    const currency       = searchParams.get('currency') || 'EGP';
    const receivedSig    = searchParams.get('signature');        // التوقيع من كاشير

    // ── التحقق من الـ Signature (أمان إضافي) ──
    // كاشير يوقّع على: orderId.amount.currency.paymentStatus
    if (receivedSig && process.env.KASHIER_API_KEY) {
      const signaturePath = `/?payment=${process.env.KASHIER_MERCHANT_ID}.${orderId}.${amount}.${currency}`;
      
      // Create HMAC signature using Web Crypto API
      const keyBuffer = new TextEncoder().encode(process.env.KASHIER_API_KEY);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const dataBuffer = new TextEncoder().encode(signaturePath);
      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
      
      const expectedSig = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (expectedSig !== receivedSig) {
        console.error('❌ Kashier: Signature mismatch — possible tampering');
        // نوجّه لصفحة الفشل في حالة التلاعب
        return NextResponse.redirect(new URL('/checkout/failed', request.url));
      }
    }

    // ── توجيه حسب نتيجة الدفع ──
    if (paymentStatus === 'SUCCESS') {
      console.log(`✅ Kashier payment SUCCESS — orderId: ${orderId}, amount: ${amount}`);
      return NextResponse.redirect(new URL('/checkout/success', request.url));
    }

    console.warn(`⚠️ Kashier payment NOT successful — status: ${paymentStatus}, orderId: ${orderId}`);
    return NextResponse.redirect(new URL('/checkout/failed', request.url));

  } catch (error) {
    console.error('Kashier Callback Error:', error.message);
    return NextResponse.redirect(new URL('/checkout/failed', request.url));
  }
}