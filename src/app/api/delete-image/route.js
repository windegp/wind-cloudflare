import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/apiResponse';
import ImageKit from "imagekit";

export const dynamic = 'force-dynamic';

const imagekit = new ImageKit({
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
});

// 🔥 حذف نهائي لملف من ImageKit اعتماداً على رابطه (URL) فقط —
// بما إننا نخزن روابط الصور (URLs) في Firestore وليس الـ fileId، لازم نبحث
// عن الملف أولاً بالاسم داخل المجلد الصحيح قبل الحذف.
export async function POST(request) {
  try {
    if (!process.env.IMAGEKIT_PRIVATE_KEY || !process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY) {
      const response = errorResponse("Missing ImageKit configuration in environment variables", 'MISSING_CONFIG', 500);
      return NextResponse.json(response.body, { status: response.status });
    }

    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      const response = errorResponse("Missing or invalid 'url'", 'INVALID_REQUEST', 400);
      return NextResponse.json(response.body, { status: response.status });
    }

    const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "";
    // لو الرابط مش من ImageKit أصلاً (مثلاً صورة اتضافت برابط خارجي يدوياً)، تجاهل بأمان
    if (!urlEndpoint || !url.startsWith(urlEndpoint)) {
      return NextResponse.json({ success: true, skipped: true, reason: "Not an ImageKit URL" }, { status: 200 });
    }

    // استخراج المسار الكامل داخل ImageKit (بدون query params زي ?updatedAt=...)
    const filePath = url.slice(urlEndpoint.length).split('?')[0]; // مثال: /WIND-Shopping/wind_123_abc.jpg
    const fileName = filePath.split('/').pop();
    const folderPath = filePath.substring(0, filePath.length - fileName.length) || "/";

    const matches = await imagekit.listFiles({
      path: folderPath,
      searchQuery: `name="${fileName}"`,
    });

    const exactMatch = matches.find((f) => f.filePath === filePath) || matches[0];

    if (!exactMatch) {
      // الملف مش موجود أصلاً على ImageKit (اتحذف قبل كده أو الرابط قديم) — مش خطأ حقيقي
      return NextResponse.json({ success: true, skipped: true, reason: "File not found on ImageKit" }, { status: 200 });
    }

    await imagekit.deleteFile(exactMatch.fileId);

    return NextResponse.json({ success: true, deleted: fileName }, { status: 200 });

  } catch (error) {
    console.error("❌ ImageKit Delete Error:", error);
    const response = errorResponse(error.message, 'IMAGEKIT_DELETE_ERROR', 500);
    return NextResponse.json(response.body, { status: response.status });
  }
}
