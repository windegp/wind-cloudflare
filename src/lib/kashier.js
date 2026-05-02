// إنشاء التوقيع الأساسي لطلب الدفع باستخدام Web Crypto API مع fallback للمتصفحات القديمة
import { generateHmacSha256, verifyHmacSha256 } from './cryptoFallback';

export async function generatePaymentHash(orderId, amount, currency) {
    const mid = process.env.KASHIER_MERCHANT_ID;
    const apiKey = process.env.KASHIER_API_KEY;
    const path = `&payment=${mid}${orderId}${amount}${currency}`;
    
    // استخدام نظام التوفيق التلقائي الذي يجرب Web Crypto أولاً ثم يستخدم crypto-js كـ fallback
    return generateHmacSha256(path, apiKey);
}

// التحقق من صحة بيانات الـ Webhook القادمة من كاشير باستخدام Web Crypto API مع fallback
export async function verifyWebhookSignature(data, receivedSignature) {
    const apiKey = process.env.KASHIER_API_KEY;
    const signatureKeys = data.signatureKeys.sort(); // ترتيب المفاتيح أبجدياً كما تطلب كاشير
    const payload = signatureKeys
        .map(key => `${key}=${encodeURIComponent(data[key])}`)
        .join('&');
    
    // استخدام نظام التوفيق التلقائي للتحقق من التوقيع
    return verifyHmacSha256(payload, apiKey, receivedSignature);
}