import { NextResponse } from 'next/server';
import { firestoreAdminSet } from '@/lib/firestoreAdmin';
import { getCairoTimestamp } from '@/lib/analytics-helpers';
import { ADMIN_UID } from '@/lib/constants';
import { checkRateLimit } from '@/lib/rateLimit';

// 🔥 Endpoint مخصص لاستقبال توكن FCM الـ Native من تطبيق الموبايل
// (عبر Capacitor's PushNotifications API)، بعكس توكنات الويب اللي
// بتتسجل مباشرة من المتصفح في src/components/OrderNotifications.js.
//
// كل التوكنات (ويب + نيتيف) بتتخزن في نفس الكولكشن adminTokens،
// لأن fcmAdmin.js بيبعت لكل التوكنات الموجودة فيها بنفس الطريقة —
// FCM v1 API بيتعامل مع توكنات الويب والنيتيف بنفس الـ endpoint.
//
// ⚠️ CORS: التطبيق المصغر (Capacitor) بيناديني من origin مختلف تمامًا
// عن windeg.com (الـ WebView بتاعه شغال على https://localhost)، فالـ
// fetch بتاعه بـ Content-Type: application/json بيخلي المتصفح يبعت
// OPTIONS preflight الأول. من غير الـ headers دي تحت، المتصفح كان
// بيرفض الطلب من نفسه قبل ما يوصل هنا خالص — وده سبب رسالة "فشل إرسال
// التوكن للسيرفر" اللي كانت بتظهر في التطبيق.
//
// ⚠️ مهم جداً: الكتابة هنا بتستخدم firestoreAdminSet (REST API + Service
// Account) مش setDoc العادي من firebase/firestore/lite. السبب: قواعد
// الأمان (Firestore Security Rules) بتمنع الكتابة في adminTokens غير
// من مستخدم مسجل دخول بـ UID الأدمن — والـ endpoint ده بيتنادى من
// السيرفر من غير أي تسجيل دخول، فـ setDoc كان بيترفض بصمت
// (permission-denied) رغم إن الـ response كان بيرجع 200 وهمي، وده
// السبب الحقيقي إن توكن التطبيق مكنش بيوصل لقاعدة البيانات خالص.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// الحد الأدنى والأقصى لطول التوكن. توكنات FCM طولها في الواقع حوالي 163 حرف
// (ويب: base64url، أندرويد نيتيف: "<id>:APA91b...")، فالمدى ده واسع جداً
// والتوكن الحقيقي بيمر منه دايماً.
const MIN_TOKEN_LENGTH = 64;
const MAX_TOKEN_LENGTH = 4096;
const MAX_PLATFORM_LENGTH = 40;

// فحص شكل التوكن: مش بنفترض صيغة واحدة ثابتة لأن صيغة توكنات FCM مش موثقة
// كـ contract وممكن تتغير. بنرفض بس اللي مستحيل يبقى توكن صالح أو آمن
// كـ Firestore document id: مش نص، طول مستحيل، مسافات/محارف تحكم، أو "/"
// (لأن doc id = التوكن، وأي "/" بتغيّر مسار المستند).
function isValidTokenShape(token) {
  if (typeof token !== 'string') return false;
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return false;
  if (token.includes('/')) return false;
  return !/[\s\u0000-\u001f\u007f]/.test(token);
}

// عنوان الـ IP للحماية: cf-connecting-ip هو الوحيد اللي Cloudflare بتحطه على
// الحافة ومستحيل العميل يزوّره. مش بنستخدم x-forwarded-for / x-real-ip هنا
// لأنهم قابلين للتزوير لو الطلب مش عدّي على Cloudflare، وساعتها العميل يقدر
// يغيّر الـ bucket بتاعه بنفسه. بره Cloudflare (تطوير محلي) كل الطلبات بتقع
// في bucket واحد اسمه "unknown".
function getRateLimitIp(req) {
  return req.headers.get('cf-connecting-ip') || 'unknown';
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req) {
  try {
    // 🔥 rate limit قبل أي شغل تاني: 10 طلبات / 10 دقايق لكل IP (حظر 15 دقيقة).
    // التطبيق بيسجل مرة كل ما يتفتح، فالحد ده واسع للاستخدام الحقيقي.
    const limit = await checkRateLimit(getRateLimitIp(req), 'ADMIN_TOKEN_REGISTER');

    if (!limit.allowed) {
      const retryAfter = Math.max(0, (limit.resetTime || 0) - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        {
          status: 429,
          // نفس CORS headers ضرورية عشان التطبيق يقرا الرد بدل ما يشوفه
          // كفشل شبكة (الـ preflight بيعتمد عليها).
          headers: { ...CORS_HEADERS, 'Retry-After': String(retryAfter) },
        }
      );
    }

    const body = await req.json();
    const { token, platform } = body;

    if (!isValidTokenShape(token)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid token' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const safePlatform =
      typeof platform === 'string' &&
      platform.length > 0 &&
      platform.length <= MAX_PLATFORM_LENGTH
        ? platform
        : 'unknown'; // مثال: "android-native"

    await firestoreAdminSet('adminTokens', token, {
      token,
      uid: ADMIN_UID,
      platform: safePlatform,
      createdAt: getCairoTimestamp(),
      lastSeenAt: getCairoTimestamp(),
    });

    console.log(`✅ Native admin token registered (${safePlatform}): ${token.slice(0, 12)}...`);

    return NextResponse.json({ success: true }, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    console.error('❌ register-admin-token error:', error?.message);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}