import { NextResponse } from 'next/server';
import { doc, setDoc } from 'firebase/firestore/lite';
import { getDb } from '@/lib/firebase';
import { getCairoTimestamp } from '@/lib/analytics-helpers';
import { ADMIN_UID } from '@/lib/constants';

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { token, platform } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid token' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await setDoc(
      doc(getDb(), 'adminTokens', token),
      {
        token,
        uid: ADMIN_UID,
        platform: platform || 'unknown', // مثال: "android-native"
        createdAt: getCairoTimestamp(),
        lastSeenAt: getCairoTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ Native admin token registered (${platform || 'unknown'}): ${token.slice(0, 12)}...`);

    return NextResponse.json({ success: true }, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    console.error('❌ register-admin-token error:', error?.message);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}