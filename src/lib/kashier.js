// إنشاء التوقيع الأساسي لطلب الدفع باستخدام Web Crypto API
export async function generatePaymentHash(orderId, amount, currency) {
    const mid = process.env.KASHIER_MERCHANT_ID;
    const apiKey = process.env.KASHIER_API_KEY;
    const path = `&payment=${mid}${orderId}${amount}${currency}`;
    
    // تحويل مفتاح API إلى Uint8Array
    const keyBuffer = new TextEncoder().encode(apiKey);
    
    // استيراد المفتاح باستخدام Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    // تحويل البيانات إلى Uint8Array
    const dataBuffer = new TextEncoder().encode(path);
    
    // إنشاء التوقيع باستخدام Web Crypto API
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
    
    // تحويل التوقيع إلى hex string
    const hash = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    return hash;
}

// التحقق من صحة بيانات الـ Webhook القادمة من كاشير باستخدام Web Crypto API
export async function verifyWebhookSignature(data, receivedSignature) {
    const apiKey = process.env.KASHIER_API_KEY;
    const signatureKeys = data.signatureKeys.sort(); // ترتيب المفاتيح أبجدياً كما تطلب كاشير
    const payload = signatureKeys
        .map(key => `${key}=${encodeURIComponent(data[key])}`)
        .join('&');
    
    // تحويل مفتاح API إلى Uint8Array
    const keyBuffer = new TextEncoder().encode(apiKey);
    
    // استيراد المفتاح باستخدام Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );
    
    // تحويل التوقيع المستلم من hex إلى Uint8Array
    const receivedSignatureBuffer = new Uint8Array(
        receivedSignature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );
    
    // تحويل البيانات إلى Uint8Array
    const dataBuffer = new TextEncoder().encode(payload);
    
    // التحقق من التوقيع باستخدام Web Crypto API
    const isValid = await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        receivedSignatureBuffer,
        dataBuffer
    );
    
    return isValid;
}